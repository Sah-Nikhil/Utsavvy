import { ConvexError, v } from "convex/values";
import { budgetRollup } from "../components/items/budget/rollup";
import {
  checklistStatus,
  type ChecklistStatus,
  type VendorLinkStatus,
} from "../components/items/checklist/status";
import { can } from "../lib/access/permissions";
import {
  lineRange,
  referenceTableBasis,
  researchedBasis,
  tableRange,
} from "../lib/pricing";
import type { MemberActor } from "../lib/types/actors";
import type { EntryFields, EntryKind } from "../lib/types/canvas";
import type { PricedEstimate } from "../lib/types/estimates";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess } from "./lib/access";
import { memberInsert, memberSoftDelete, memberWrite } from "./lib/write";

/*
 * S4: the rows of the Budget, the Timeline and the Vendor checklist. Members
 * write them here through the contract's write helpers, so every change is
 * versioned, lands in the edit history and runs the post-write hooks (the
 * Nudge check, Comment passages). The Assistant writes the same rows through
 * its own tools (S7) with `assistantInsert` and `assistantWrite`.
 */

export { budgetRollup };
export type {
  BudgetRollup,
  RollupEntry,
} from "../components/items/budget/rollup";

type Ctx = QueryCtx | MutationCtx;
type PlanKind = EntryKind;

/** The most live Entries one Item reads; deleted ones are skipped, not counted. */
const MAX_ENTRIES = 500;
const MAX_LABEL = 120;
const MAX_NOTE = 500;
/** ₹100 crore: far above any Event, low enough to catch a typo of extra zeros. */
const MAX_AMOUNT = 1_000_000_000;
const MAX_QUANTITY = 100_000;

export function invalid(message: string, problem?: string): never {
  throw new ConvexError({
    kind: "InvalidInput",
    ...(problem ? { problem } : {}),
    message,
  });
}

// ---------------------------------------------------------------------------
// Input checks

export function cleanLabel(text: string, what: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "") invalid(`Give the ${what} a name.`);
  if (trimmed.length > MAX_LABEL)
    invalid(`Keep the ${what}'s name under ${MAX_LABEL} characters.`);
  return trimmed;
}

function cleanNote(text: string | null): string | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_NOTE)
    invalid(`Keep the note under ${MAX_NOTE} characters.`);
  return trimmed;
}

function cleanAmount(amount: number | null): number | null {
  if (amount === null) return null;
  if (!Number.isFinite(amount) || amount < 0)
    invalid("An amount is a number of rupees, zero or more.");
  if (amount > MAX_AMOUNT) invalid("That amount looks too large.");
  return Math.round(amount);
}

function cleanQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY)
    invalid("A quantity is a number above zero.");
  return quantity;
}

/** An ISO day such as "2027-02-14" that exists on the calendar. */
function cleanDate(date: string | null): string | null {
  if (date === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) invalid("A date looks like 2027-02-14.");
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  if (
    day.getUTCFullYear() !== y ||
    day.getUTCMonth() !== m - 1 ||
    day.getUTCDate() !== d
  )
    invalid("That date isn't on the calendar.");
  return date;
}

/** A 24-hour time such as "19:30". */
function cleanTime(time: string | null): string | null {
  if (time === null) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    invalid("A time looks like 19:30.");
  return time;
}

async function functionKeysOf(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<Set<string>> {
  const functions = await ctx.db
    .query("eventFunctions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(50);
  return new Set(functions.map((fn) => fn.key));
}

async function checkFunctionKeys(
  ctx: Ctx,
  eventId: Id<"events">,
  keys: readonly (string | null)[],
): Promise<void> {
  const wanted = keys.filter((k): k is string => k !== null);
  if (wanted.length === 0) return;
  const known = await functionKeysOf(ctx, eventId);
  for (const key of wanted) {
    if (!known.has(key)) invalid("That Function isn't in this Event.");
  }
}

// ---------------------------------------------------------------------------
// Reading

async function liveEntries(
  ctx: Ctx,
  itemId: Id<"items">,
): Promise<Doc<"entries">[]> {
  const live: Doc<"entries">[] = [];
  for await (const entry of ctx.db
    .query("entries")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))) {
    if (entry.deletedAt !== null) continue;
    live.push(entry);
    if (live.length >= MAX_ENTRIES) break;
  }
  return live.sort((a, b) => a.order - b.order);
}

/** The order after every Entry of the Item, so a new Entry goes last. */
export async function nextOrder(
  ctx: Ctx,
  itemId: Id<"items">,
): Promise<number> {
  const last = (await liveEntries(ctx, itemId)).at(-1);
  return last === undefined ? 0 : last.order + 1;
}

/** The Event's live Budget, Timeline or Vendor checklist Item. */
export async function planItemOf(
  ctx: Ctx,
  eventId: Id<"events">,
  kind: PlanKind,
): Promise<Doc<"items"> | null> {
  for await (const item of ctx.db
    .query("items")
    .withIndex("by_event_kind", (q) =>
      q.eq("eventId", eventId).eq("kind", kind),
    )) {
    if (item.deletedAt === null) return item;
  }
  return null;
}

async function checklistStatuses(
  ctx: Ctx,
  eventId: Id<"events">,
  entries: readonly Doc<"entries">[],
): Promise<Record<string, ChecklistStatus>> {
  const links = new Map<string, VendorLinkStatus[]>();
  for (const entry of entries) links.set(entry._id, []);
  for await (const link of ctx.db
    .query("vendorLinks")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))) {
    links.get(link.checklistEntryId)?.push(link.status);
  }
  const statuses: Record<string, ChecklistStatus> = {};
  for (const [entryId, found] of links) {
    statuses[entryId] = checklistStatus(found);
  }
  return statuses;
}

/** Each checklist Entry's book-by day, from the Timeline deadline it points at. */
async function bookByDates(
  ctx: Ctx,
  entries: readonly Doc<"entries">[],
): Promise<Record<string, string>> {
  const dates: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.kind !== "checklist" || entry.fields.bookByEntryId === null)
      continue;
    const deadline = await ctx.db.get("entries", entry.fields.bookByEntryId);
    if (
      deadline?.kind === "timeline" &&
      deadline.deletedAt === null &&
      deadline.fields.date !== null
    )
      dates[entry._id] = deadline.fields.date;
  }
  return dates;
}

/**
 * Everything one Budget, Timeline or Vendor checklist Item shows: its live
 * Entries in order, the Event's Functions, the Event's Budget facts, each
 * checklist Entry's status (to find, shortlisted, booked) and book-by day,
 * and whether this
 * person may edit.
 */
export const forItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get("items", itemId);
    if (item === null)
      throw new ConvexError({ kind: "NotFound", what: "item" });
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.view",
    );
    const event = await ctx.db.get("events", item.eventId);
    if (event === null)
      throw new ConvexError({ kind: "NotFound", what: "event" });

    const entries = await liveEntries(ctx, itemId);
    const functions = (
      await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", item.eventId))
        .take(50)
    )
      .sort((a, b) => a.order - b.order)
      .map((fn) => ({
        key: fn.key,
        name: fn.name,
        date: fn.date,
        guests: fn.guests,
      }));

    return {
      kind: item.kind,
      entries,
      functions,
      event: {
        eventType: event.eventType,
        budgetTotal: event.budgetTotal,
        households: event.households,
        contingencyShare: event.contingencyShare,
        budgetCheck: event.budgetCheck,
      },
      checklistStatus:
        item.kind === "checklist"
          ? await checklistStatuses(ctx, item.eventId, entries)
          : {},
      bookBy: item.kind === "checklist" ? await bookByDates(ctx, entries) : {},
      canEdit: can(membership.role, "canvas.edit"),
    };
  },
});

// ---------------------------------------------------------------------------
// Writing

/** Loads a live Entry and checks the caller may edit its Event. */
async function editableEntry(
  ctx: MutationCtx,
  entryId: Id<"entries">,
): Promise<{ entry: Doc<"entries">; actor: MemberActor }> {
  const entry = await ctx.db.get("entries", entryId);
  if (entry === null)
    throw new ConvexError({ kind: "NotFound", what: "entry" });
  const { membership } = await requireAccess(ctx, entry.eventId, "canvas.edit");
  if (entry.deletedAt !== null) invalid("That Entry was deleted.", "deleted");
  return { entry, actor: { kind: "member", membershipId: membership._id } };
}

const addInputValidator = v.union(
  v.object({
    kind: v.literal("budget"),
    label: v.string(),
    /** The Member's own amount, or null to leave it at "No Estimate yet". */
    amount: v.union(v.number(), v.null()),
  }),
  v.object({
    kind: v.literal("timeline"),
    title: v.string(),
    date: v.union(v.string(), v.null()),
    time: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("checklist"),
    label: v.string(),
    functionKeys: v.array(v.string()),
  }),
);

/**
 * A Member adds a row to the Budget, the Timeline or the Vendor checklist,
 * after the rows already there. A budget line a Member adds has no Estimate:
 * it shows "No Estimate yet" with the Member's amount, if any.
 */
export const add = mutation({
  args: {
    itemId: v.id("items"),
    functionKey: v.union(v.string(), v.null()),
    input: addInputValidator,
  },
  returns: v.id("entries"),
  handler: async (ctx, { itemId, functionKey, input }) => {
    const item = await ctx.db.get("items", itemId);
    if (item === null)
      throw new ConvexError({ kind: "NotFound", what: "item" });
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.edit",
    );
    if (item.deletedAt !== null) invalid("That Item was deleted.", "deleted");
    if (item.kind !== input.kind)
      invalid(`A ${input.kind} Entry can't go in this Item.`);
    const functionKeys =
      input.kind === "checklist" ? [...new Set(input.functionKeys)] : [];
    await checkFunctionKeys(ctx, item.eventId, [functionKey, ...functionKeys]);

    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    const common = {
      eventId: item.eventId,
      itemId,
      order: await nextOrder(ctx, itemId),
      functionKey,
      assumed: [],
      createdBy: actor,
    };
    let value;
    if (input.kind === "budget") {
      const amount = cleanAmount(input.amount);
      value = {
        ...common,
        kind: "budget" as const,
        fields: {
          label: cleanLabel(input.label, "line"),
          category: null,
          quantity: 1,
          unit: "per_event",
          estimate: null,
          plannedAmount: amount,
          role: "line" as const,
          belowUsualRange: false,
          editedByMember: amount !== null,
        },
      };
    } else if (input.kind === "timeline") {
      value = {
        ...common,
        kind: "timeline" as const,
        fields: {
          title: cleanLabel(input.title, "Timeline Entry"),
          date: cleanDate(input.date),
          time: cleanTime(input.time),
          leadKey: null,
          priority: null,
          late: false,
          note: cleanNote(input.note),
          vendorCategory: null,
          done: false,
        },
      };
    } else {
      value = {
        ...common,
        kind: "checklist" as const,
        fields: {
          vendorCategory: null,
          freeLabel: cleanLabel(input.label, "Vendor"),
          functionKeys,
          bookByEntryId: null,
          budgetEntryIds: [],
        },
      };
    }
    const { id } = await memberInsert(ctx, { table: "entries", value, actor });
    return id;
  },
});

/**
 * An Estimate moved to a new quantity at the same price per unit: low and
 * high from its per-unit range, the amount at the price per unit it had
 * (per-plate prices to ₹10, other lines to ₹1,000), never above the high.
 */
export function rescaleEstimate(
  estimate: PricedEstimate,
  unit: string,
  from: number,
  to: number,
): PricedEstimate {
  const { low, high } = lineRange(estimate.basis, to);
  const unitPrice = estimate.amount / from;
  let amount: number;
  if (unit === "per_plate") amount = Math.round(unitPrice / 10) * 10 * to;
  else {
    const line = unitPrice * to;
    const step = line >= 1000 ? 1000 : 100;
    amount = Math.round(line / step) * step;
  }
  return { ...estimate, low, high, amount: Math.min(amount, high) };
}

const patchValidator = v.union(
  v.object({
    kind: v.literal("budget"),
    label: v.optional(v.string()),
    quantity: v.optional(v.number()),
    /** The Member's own amount; null hands the line back to its Estimate. */
    plannedAmount: v.optional(v.union(v.number(), v.null())),
  }),
  v.object({
    kind: v.literal("timeline"),
    title: v.optional(v.string()),
    date: v.optional(v.union(v.string(), v.null())),
    time: v.optional(v.union(v.string(), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    kind: v.literal("checklist"),
    label: v.optional(v.string()),
    functionKeys: v.optional(v.array(v.string())),
  }),
);

/**
 * A Member edits an Entry (last write wins). Every field the Member sets stops
 * being an Assumption. Editing a budget line's amount sets `editedByMember`,
 * and its Estimate stays beside the Member's amount, never replaced by it.
 */
export const update = mutation({
  args: {
    entryId: v.id("entries"),
    functionKey: v.optional(v.union(v.string(), v.null())),
    patch: patchValidator,
  },
  returns: v.null(),
  handler: async (ctx, { entryId, functionKey, patch }) => {
    const { entry, actor } = await editableEntry(ctx, entryId);
    if (entry.kind !== patch.kind)
      invalid("That change is for another kind of Entry.");

    const touched: string[] = [];
    let fields: EntryFields;
    if (entry.kind === "budget" && patch.kind === "budget") {
      const next = { ...entry.fields };
      if (patch.label !== undefined) {
        next.label = cleanLabel(patch.label, "line");
        touched.push("label");
      }
      if (patch.quantity !== undefined) {
        const quantity = cleanQuantity(patch.quantity);
        if (next.estimate !== null && quantity !== next.quantity) {
          next.estimate = rescaleEstimate(
            next.estimate,
            next.unit,
            next.quantity,
            quantity,
          );
        }
        next.quantity = quantity;
        touched.push("quantity");
      }
      if (patch.plannedAmount !== undefined) {
        next.plannedAmount = cleanAmount(patch.plannedAmount);
        next.editedByMember = true;
        touched.push("plannedAmount");
      }
      fields = next;
    } else if (entry.kind === "timeline" && patch.kind === "timeline") {
      const next = { ...entry.fields };
      if (patch.title !== undefined) {
        next.title = cleanLabel(patch.title, "Timeline Entry");
        touched.push("title");
      }
      if (patch.date !== undefined) {
        next.date = cleanDate(patch.date);
        touched.push("date");
      }
      if (patch.time !== undefined) {
        next.time = cleanTime(patch.time);
        touched.push("time");
      }
      if (patch.note !== undefined) {
        next.note = cleanNote(patch.note);
        touched.push("note");
      }
      fields = next;
    } else if (entry.kind === "checklist" && patch.kind === "checklist") {
      const next = { ...entry.fields };
      if (patch.label !== undefined) {
        next.freeLabel = cleanLabel(patch.label, "Vendor");
        touched.push("freeLabel");
      }
      if (patch.functionKeys !== undefined) {
        next.functionKeys = [...new Set(patch.functionKeys)];
        await checkFunctionKeys(ctx, entry.eventId, next.functionKeys);
        touched.push("functionKeys");
      }
      fields = next;
    } else {
      invalid("That change is for another kind of Entry.");
    }

    const extra: { functionKey?: string | null } = {};
    if (functionKey !== undefined) {
      await checkFunctionKeys(ctx, entry.eventId, [functionKey]);
      extra.functionKey = functionKey;
      touched.push("functionKey");
    }
    await memberWrite(ctx, {
      table: "entries",
      id: entryId,
      patch: {
        ...extra,
        fields,
        assumed: entry.assumed.filter((name) => !touched.includes(name)),
      } as never,
      actor,
    });
    return null;
  },
});

/** Ticks a Timeline Entry done, or back to not done. */
export const tick = mutation({
  args: { entryId: v.id("entries"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { entryId, done }) => {
    const { entry, actor } = await editableEntry(ctx, entryId);
    if (entry.kind !== "timeline")
      invalid("Only a Timeline Entry can be ticked done.");
    if (entry.fields.done === done) return null;
    await memberWrite(ctx, {
      table: "entries",
      id: entryId,
      patch: { fields: { ...entry.fields, done } },
      actor,
    });
    return null;
  },
});

/** Deletes an Entry softly, so Restore (S6) can bring it back. */
export const remove = mutation({
  args: { entryId: v.id("entries") },
  returns: v.null(),
  handler: async (ctx, { entryId }) => {
    const { actor } = await editableEntry(ctx, entryId);
    await memberSoftDelete(ctx, { table: "entries", id: entryId, actor });
    return null;
  },
});

/** One tap confirms an Assumption: the field keeps its value and stops being assumed. */
export const confirmAssumption = mutation({
  args: { entryId: v.id("entries"), field: v.string() },
  returns: v.null(),
  handler: async (ctx, { entryId, field }) => {
    const { entry, actor } = await editableEntry(ctx, entryId);
    if (!entry.assumed.includes(field))
      invalid("That value isn't an Assumption.", "notAssumed");
    await memberWrite(ctx, {
      table: "entries",
      id: entryId,
      patch: { assumed: entry.assumed.filter((name) => name !== field) },
      actor,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Local browser checks only

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

/** A table-priced Estimate at fraction 0.2 of its range, as the first plan would price it. */
function seedEstimate(
  category: string,
  unit: string,
  quantity: number,
): PricedEstimate | null {
  const range = tableRange(category, unit, "Y");
  if (range === null) return null;
  const { low, high } = lineRange(range, quantity);
  const unitPrice = range.unitLow + 0.2 * (range.unitHigh - range.unitLow);
  const amount =
    unit === "per_plate"
      ? Math.round(unitPrice / 10) * 10 * quantity
      : Math.round((unitPrice * quantity) / 1000) * 1000;
  return {
    low,
    high,
    amount,
    label: "Estimate",
    basis: referenceTableBasis({ unit, ...range, tier: "Y" }),
  };
}

/**
 * Fills an Event made by `canvas:seedLocalCheck` with a small Jaipur plan:
 * budget lines with Estimates (one quantity assumed, one line with no
 * Estimate), a Contingency, a late deadline with its note, two run sheets with
 * assumed times, checklist Entries and a costed Suggestion. For the browser
 * checks in e2e/plan-items.spec.ts. Refuses on anything but a local deployment.
 */
export const seedPlanForLocalCheck = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    refuseOutsideLocal();
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).find((m) => m.role === "owner");
    if (!owner) throw new Error("That Event has no Owner");
    const createdBy = { kind: "member" as const, membershipId: owner._id };
    const budget = await planItemOf(ctx, eventId, "budget");
    const timeline = await planItemOf(ctx, eventId, "timeline");
    const checklist = await planItemOf(ctx, eventId, "checklist");
    if (!budget || !timeline || !checklist)
      throw new Error("Seed the Event with canvas:seedLocalCheck first");

    await ctx.db.patch("events", eventId, {
      eventType: "wedding",
      budgetTotal: 1_200_000,
      budgetCheck: {
        band: "tight",
        minimum: 1_050_000,
        typical: 1_550_000,
        high: 2_050_000,
        contingency: 100_000,
        unallocated: 0,
        perHousehold: null,
      },
    });
    await ctx.db.patch("items", budget._id, {
      data: {
        note: "₹12L is below the typical ₹15.5L for this plan, so Estimates sit near the low end.",
      },
    });

    let order = 0;
    const line = async (
      functionKey: string | null,
      label: string,
      category: string | null,
      quantity: number,
      unit: string,
      extra: Partial<EntryFields<"budget">> = {},
      assumed: string[] = [],
    ) =>
      await ctx.db.insert("entries", {
        eventId,
        itemId: budget._id,
        kind: "budget",
        order: order++,
        functionKey,
        assumed,
        createdBy,
        version: 1,
        deletedAt: null,
        fields: {
          label,
          category,
          quantity,
          unit,
          estimate: category ? seedEstimate(category, unit, quantity) : null,
          plannedAmount: null,
          role: "line",
          belowUsualRange: false,
          editedByMember: false,
          ...extra,
        },
      });
    await line("haldi", "Catering", "catering_light", 60, "per_plate", {}, [
      "quantity",
    ]);
    await line("haldi", "Decor", "decor_small", 1, "per_function");
    await line("sangeet", "Catering", "catering_main", 300, "per_plate", {
      plannedAmount: 245_000,
      editedByMember: true,
    });
    await line("sangeet", "Venue", "venue_large", 1, "per_function");
    await line("sangeet", "DJ and sound", "dj_sound", 1, "per_function");
    await line(null, "Photography", "photography_video", 4, "per_day", {}, [
      "quantity",
    ]);
    await line(null, "Favours", null, 1, "per_event");
    await line(null, "Contingency", null, 1, "per_event", {
      role: "contingency",
      plannedAmount: 100_000,
    });

    order = 0;
    const deadline = async (
      title: string,
      date: string,
      extra: Partial<EntryFields<"timeline">> = {},
    ) =>
      await ctx.db.insert("entries", {
        eventId,
        itemId: timeline._id,
        kind: "timeline",
        order: order++,
        functionKey: null,
        assumed: [],
        createdBy,
        version: 1,
        deletedAt: null,
        fields: {
          title,
          date,
          time: null,
          leadKey: null,
          priority: null,
          late: false,
          note: null,
          vendorCategory: null,
          done: false,
          ...extra,
        },
      });
    const venues = await deadline("Book Venues", "2026-10-30", {
      late: true,
      priority: "P1",
      note: "Venues for February dates usually book 9-12 months ahead; call these first.",
      vendorCategory: "venue",
    });
    await deadline("Send invitations", "2026-12-19", { priority: "P1" });
    const sheet = async (functionKey: string, time: string, title: string) =>
      await ctx.db.insert("entries", {
        eventId,
        itemId: timeline._id,
        kind: "timeline",
        order: order++,
        functionKey,
        assumed: ["time"],
        createdBy,
        version: 1,
        deletedAt: null,
        fields: {
          title,
          date: null,
          time,
          leadKey: null,
          priority: null,
          late: false,
          note: null,
          vendorCategory: null,
          done: false,
        },
      });
    await sheet("sangeet", "19:00", "Guests arrive");
    await sheet("sangeet", "19:30", "Family performances");
    await sheet("sangeet", "20:30", "Dinner");
    await sheet("wedding", "22:30", "Pheras begin");
    await sheet("wedding", "01:00", "Vidaai");

    order = 0;
    const vendorsNeeded: [string, string[]][] = [
      ["venue", ["sangeet"]],
      ["caterer", ["haldi", "sangeet"]],
      ["photographer", []],
    ];
    for (const [vendorCategory, functionKeys] of vendorsNeeded) {
      await ctx.db.insert("entries", {
        eventId,
        itemId: checklist._id,
        kind: "checklist",
        order: order++,
        functionKey: null,
        assumed: [],
        createdBy,
        version: 1,
        deletedAt: null,
        fields: {
          vendorCategory,
          freeLabel: null,
          functionKeys,
          bookByEntryId: vendorCategory === "venue" ? venues : null,
          budgetEntryIds: [],
        },
      });
    }

    for await (const item of ctx.db
      .query("items")
      .withIndex("by_event_kind", (q) =>
        q.eq("eventId", eventId).eq("kind", "suggestion"),
      )) {
      if (item.deletedAt !== null) continue;
      await ctx.db.patch("items", item._id, {
        functionKey: "sangeet",
        data: {
          title: "Rajasthani folk musicians at the sangeet dinner",
          body: "A Manganiyar group playing through dinner in the courtyard.",
          costCategory: "folk_musicians",
          quantity: 1,
          estimate: {
            low: 25_000,
            high: 60_000,
            amount: 32_000,
            label: "Estimate",
            basis: researchedBasis({
              unit: "per_function",
              unitLow: 25_000,
              unitHigh: 60_000,
              sourceUrls: [
                "https://example.com/folk-rates",
                "https://example.org/manganiyar",
                "https://example.net/sangeet",
              ],
              searchedAt: Date.UTC(2026, 9, 22, 6, 0),
              reasoning:
                "Three Jaipur troupes list ₹25,000 to ₹60,000 an evening.",
            }),
          },
          status: "open",
        },
      });
      break;
    }
    return null;
  },
});
