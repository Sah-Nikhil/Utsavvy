import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import { fitFrame } from "../lib/canvas/placement";
import { isStartingSection } from "../lib/canvas/starting";
import type { Actor } from "../lib/types/actors";
import { countCharacters } from "../lib/types/canvas";
import {
  changeOpValidator,
  type HistoryTable,
  type SoftDeleteTable,
} from "../lib/types/history";
import type { Action, Role } from "../lib/types/roles";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { MAX_CUSTOM_SECTIONS } from "./canvas";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { memberSoftDelete, memberWrite } from "./lib/write";

// S6 owns this file: the edit history and Restore (IMPLEMENTATION_PLAN.md
// section 4.4, docs/design/roles.md "History and attribution").
//
// Everyone in an Event, Viewers included, lists its history; only Members
// Restore, because Restore is an edit. The list never returns the stored
// before and after documents, only a sentence about each change, so nothing
// beyond what the Canvas already shows leaves the server.

/** Why Restore refused, for the UI to word. */
export type HistoryProblem =
  | "notFound"
  | "notRestorable"
  | "useDelete"
  | "gone"
  | "sectionDeleted"
  | "itemDeleted"
  | "tooManySections"
  | "sectionNotEmpty";

function refuse(problem: HistoryProblem): never {
  throw new ConvexError({ kind: "HistoryRefused", problem });
}

/** The most rows one history group is counted up to. */
const GROUP_COUNT_MAX = 200;
/** The most rows one page of the history returns, whatever the client asks for. */
const PAGE_MAX = 50;
/** The most Items a Section's frame is fitted around after a Restore. */
const SECTION_ITEMS_MAX = 1000;

/** Fields a Restore never puts back: identity, the version, and system bookkeeping. */
const NEVER_RESTORED = new Set([
  "_id",
  "_creationTime",
  "version",
  "eventId",
  "createdBy",
  "agentThreadId",
  "demoKey",
  "createdAt",
]);

// ---------------------------------------------------------------------------
// What a change changed

/** Deep equality for stored Convex values (objects compared by key, not order). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameValue(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

type Fields = Record<string, unknown>;

/** The top-level fields one change set to new values. */
function changedFields(before: Fields | null, after: Fields | null): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].filter(
    (k) => !NEVER_RESTORED.has(k) && !sameValue(before?.[k], after?.[k]),
  );
}

/** Whether a change can be Restored at all: an edit, delete or restore of Canvas content. */
function isRestorable(change: Doc<"changes">): boolean {
  return (
    change.table !== "memberships" &&
    (change.op === "update" ||
      change.op === "delete" ||
      change.op === "restore") &&
    change.before !== null
  );
}

/**
 * The fields a Restore of this change would put back. A shared Vendor is the
 * same row for every Event, so only its Marker (the one thing a Member moves)
 * ever comes back; its facts never do.
 */
function restorableFields(change: Doc<"changes">): string[] {
  const fields = changedFields(change.before as Fields, change.after as Fields);
  return change.table === "vendors"
    ? fields.filter((f) => f === "marker")
    : fields;
}

/**
 * Whether restoring this change would delete the row again, as Restoring a
 * "Restored ..." row does. Deleting has its own rules (a custom Section's
 * Items move home first, a starting Section must be empty and not the last),
 * so Restore never deletes: delete it from the Canvas instead.
 */
function wouldDelete(change: Doc<"changes">, fields: string[]): boolean {
  const before = change.before as Fields;
  return fields.includes("deletedAt") && before.deletedAt != null;
}

/**
 * The permissions-table actions putting back these fields needs, beyond
 * `history.restore`: Restore must never let a Member undo an Owner's setting
 * they couldn't change themselves.
 */
function actionsFor(
  table: HistoryTable,
  doc: Fields,
  fields: string[],
  renameBlocked: boolean,
): Action[] {
  const actions = new Set<Action>();
  switch (table) {
    case "events":
      for (const field of fields) {
        if (field === "name" || field === "ownerLabel")
          actions.add("event.rename");
        else if (field === "uploadRightsOn" || field === "defaults")
          actions.add("event.defaults");
        else if (field === "startingSectionRenameBlocked")
          actions.add("section.starting");
        else actions.add("canvas.edit");
      }
      break;
    case "sections": {
      const starting = isStartingSection(doc.kind as Doc<"sections">["kind"]);
      for (const field of fields) {
        if (field === "deletedAt")
          actions.add(starting ? "section.starting" : "section.custom");
        else if (field === "name")
          actions.add(
            !starting
              ? "section.custom"
              : renameBlocked
                ? "section.starting"
                : "section.renameStarting",
          );
        else actions.add("canvas.edit");
      }
      break;
    }
    case "vendors":
    case "vendorLinks":
    case "quotes":
      actions.add("vendor.manage");
      break;
    default:
      actions.add("canvas.edit");
  }
  return [...actions];
}

function belongsTo(
  table: HistoryTable,
  doc: Fields,
  eventId: Id<"events">,
): boolean {
  if (table === "events") return doc._id === eventId;
  // A shared Vendor has no Event; its change row is in the acting Event.
  if (table === "vendors") return true;
  return doc.eventId === eventId;
}

// ---------------------------------------------------------------------------
// Wording

function roleName(role: Role, ownerLabel: Doc<"events">["ownerLabel"]) {
  const host = ownerLabel === "host";
  switch (role) {
    case "owner":
      return host ? "Host" : "Owner";
    case "coOwner":
      return host ? "Co-host" : "Co-owner";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
  }
}

const ITEM_NAMES: Record<Doc<"items">["kind"], string> = {
  budget: "the Budget",
  timeline: "the Timeline",
  checklist: "the Vendor checklist",
  shortlistedVendor: "a Shortlisted Vendor",
  googlePlace: "a Google place",
  inspiration: "an Inspiration",
  suggestion: "a Suggestion",
  note: "a Note",
};

const EVENT_FIELDS: Record<string, string> = {
  name: "name",
  eventType: "type",
  ownerLabel: "Owner label",
  city: "city",
  tradition: "tradition",
  communityKind: "community",
  honoree: "honoree",
  households: "households",
  budgetTotal: "Budget total",
  contingencyShare: "Contingency",
  theme: "Theme",
  briefState: "Brief",
  brief: "Brief",
  budgetCheck: "Budget check",
  uploadRightsOn: "upload rights",
  defaults: "defaults",
  startingSectionRenameBlocked: "Section renaming",
};

/** The first `count` characters as people see them, never splitting a Hindi cluster or an emoji. */
function firstCharacters(text: string, count: number): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    let out = "";
    let n = 0;
    for (const { segment } of segmenter.segment(text)) {
      if (n++ === count) break;
      out += segment;
    }
    return out;
  }
  return Array.from(text).slice(0, count).join("");
}

function quoted(text: unknown, max = 40): string {
  if (typeof text !== "string" || text.trim() === "") return "";
  const clean = text.trim().replace(/\s+/g, " ");
  const short =
    countCharacters(clean) > max
      ? `${firstCharacters(clean, max - 1).trimEnd()}…`
      : clean;
  return ` "${short}"`;
}

function listWords(words: string[]): string {
  const unique = [...new Set(words)];
  if (unique.length <= 1) return unique[0] ?? "details";
  return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

/** What the change was about, such as `the Entry "Decor"` or `a Note`. */
function thingOf(table: HistoryTable, doc: Fields): string {
  switch (table) {
    case "items":
      return ITEM_NAMES[doc.kind as Doc<"items">["kind"]] ?? "an Item";
    case "entries": {
      const fields = (doc.fields ?? {}) as Fields;
      const label =
        fields.label ??
        fields.title ??
        fields.freeLabel ??
        fields.vendorCategory ??
        null;
      return `the Entry${quoted(label)}`;
    }
    case "sections":
      return `the Section${quoted(doc.name)}`;
    case "events":
      return "the Event";
    case "eventFunctions":
      return `the Function${quoted(doc.name)}`;
    case "vendors":
      return `the Vendor${quoted(doc.name)}`;
    case "vendorLinks":
      return "a Shortlisted Vendor";
    case "quotes":
      return "a Quote";
  }
}

/** One sentence about a Canvas change, such as "Moved a Note". */
function canvasSummary(change: Doc<"changes">): string {
  const table = change.table as HistoryTable;
  const doc = (change.after ?? change.before ?? {}) as Fields;
  const thing = thingOf(table, doc);
  if (change.op === "create")
    return table === "events" ? "Created the Event" : `Added ${thing}`;
  if (change.op === "delete") return `Deleted ${thing}`;
  if (change.op === "restore") return `Restored ${thing}`;
  const fields = changedFields(change.before as Fields, change.after as Fields);
  if (table === "events") {
    return `Changed the Event's ${listWords(
      fields.map((f) => EVENT_FIELDS[f] ?? "details"),
    )}`;
  }
  if (table === "vendors" && fields.every((f) => f === "marker")) {
    return `Moved the Marker for${quoted(doc.name) || " a Vendor"}`;
  }
  const moves = new Set(["position", "sectionId", "frame", "order"]);
  if (fields.length > 0 && fields.every((f) => moves.has(f)))
    return `Moved ${thing}`;
  if (fields.length > 0 && fields.every((f) => f === "size"))
    return `Resized ${thing}`;
  if (table === "sections" && fields.every((f) => f === "name"))
    return `Renamed ${thing}`;
  return `Edited ${thing}`;
}

type PeopleFields = {
  role?: Role;
  status?: Doc<"memberships">["status"];
  blocked?: boolean;
  linkReset?: "member" | "viewer";
};

/** One sentence about a people change, such as "Made Papa a Member". */
function peopleSummary(
  change: Doc<"changes">,
  target: string,
  ownerLabel: Doc<"events">["ownerLabel"],
): string {
  const before = (change.before ?? null) as PeopleFields | null;
  const after = (change.after ?? {}) as PeopleFields;
  if (after.linkReset) {
    return `Reset the ${after.linkReset === "member" ? "Member" : "Viewer"} link`;
  }
  const role = after.role ? roleName(after.role, ownerLabel) : "Member";
  if (before === null) {
    return after.role === "owner" ? "Created the Event" : `Joined as ${role}`;
  }
  if (after.status === "removed" && before.status !== "removed")
    return `Removed ${target}`;
  if (after.status === "left" && before.status !== "left")
    return "Left the Event";
  if (after.status === "active" && before.status !== "active")
    return `Rejoined as ${role}`;
  if (before.blocked && after.blocked === false) return `Unblocked ${target}`;
  if (after.role && after.role !== before.role) {
    return after.role === "owner"
      ? `Made ${target} the ${role}`
      : `Made ${target} a ${role}`;
  }
  return `Changed ${target}'s access`;
}

// ---------------------------------------------------------------------------
// Listing

const targetValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({
    kind: v.literal("entry"),
    itemId: v.id("items"),
    entryId: v.id("entries"),
  }),
  v.null(),
);

const rowValidator = v.object({
  changeId: v.id("changes"),
  at: v.number(),
  kind: v.union(v.literal("canvas"), v.literal("people")),
  op: changeOpValidator,
  /** Whether the Assistant made the change (for a Member, or through a Proposal). */
  byAssistant: v.boolean(),
  /** "Rohan", "Aditi (left)", "Utsavvy for Meera" or "Utsavvy for Rohan, accepted by Meera". */
  who: v.string(),
  summary: v.string(),
  /** The run or Proposal the change belongs to; null for a Member's own edit. */
  groupKey: v.union(v.string(), v.null()),
  /** "Utsavvy for Meera: Plan the sangeet (8 changes)"; null outside a group. */
  groupTitle: v.union(v.string(), v.null()),
  /** What to highlight on the Canvas, while it is still there. */
  target: targetValidator,
  /** Whether this caller may Restore this change now. */
  canRestore: v.boolean(),
});
export type HistoryRow = typeof rowValidator.type;

/** Reads each document once per query. */
function cached<K, T>(load: (key: K) => Promise<T>) {
  const seen = new Map<K, Promise<T>>();
  return (key: K) => {
    let hit = seen.get(key);
    if (hit === undefined) {
      hit = load(key);
      seen.set(key, hit);
    }
    return hit;
  };
}

function nameOf(m: Doc<"memberships"> | null, eventId: Id<"events">): string {
  if (m === null || m.eventId !== eventId) return "Someone";
  return m.status === "active" ? m.displayName : `${m.displayName} (left)`;
}

async function whoOf(
  actor: Actor,
  membership: (id: Id<"memberships">) => Promise<Doc<"memberships"> | null>,
  eventId: Id<"events">,
): Promise<string> {
  if (actor.kind === "member")
    return nameOf(await membership(actor.membershipId), eventId);
  const forName = nameOf(await membership(actor.forMembershipId), eventId);
  if (actor.acceptedBy === null) return `Utsavvy for ${forName}`;
  const by = nameOf(await membership(actor.acceptedBy), eventId);
  return `Utsavvy for ${forName}, accepted by ${by}`;
}

async function targetOf(
  ctx: QueryCtx,
  change: Doc<"changes">,
  doc: Fields | null,
): Promise<HistoryRow["target"]> {
  if (doc === null || doc.deletedAt !== null) return null;
  if (change.table === "items") {
    return { kind: "item", itemId: change.docId as Id<"items"> };
  }
  if (change.table === "entries") {
    const itemId = doc.itemId as Id<"items">;
    const item = await ctx.db.get("items", itemId);
    if (item === null || item.deletedAt !== null) return null;
    return { kind: "entry", itemId, entryId: change.docId as Id<"entries"> };
  }
  return null;
}

/**
 * The Event's edit history, newest first, a page at a time. People changes
 * (joins, role switches, removals, unblocks, link resets) are rows too. The
 * client groups consecutive rows with the same `groupKey` under `groupTitle`.
 */
export const list = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, { eventId, paginationOpts }) => {
    const { membership: me } = await requireAccess(ctx, eventId, "canvas.view");
    const event = await ctx.db.get("events", eventId);
    if (event === null) throw new AccessDenied("notAMember", "canvas.view");

    const result = await ctx.db
      .query("changes")
      .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, PAGE_MAX),
      });

    const membership = cached((id: Id<"memberships">) =>
      ctx.db.get("memberships", id),
    );
    const groupSize = cached(async (groupKey: string) => {
      const rows = await ctx.db
        .query("changes")
        .withIndex("by_group", (q) => q.eq("groupKey", groupKey))
        .take(GROUP_COUNT_MAX);
      return rows.filter((r) => r.eventId === eventId).length;
    });

    const page: HistoryRow[] = [];
    for (const change of result.page) {
      const who = await whoOf(change.actor, membership, eventId);
      if (change.table === "memberships") {
        const target = await membership(change.docId as Id<"memberships">);
        const targetName =
          target !== null && target.eventId === eventId
            ? target.displayName
            : "someone";
        page.push({
          changeId: change._id,
          at: change.at,
          kind: "people",
          op: change.op,
          byAssistant: false,
          who,
          summary: peopleSummary(change, targetName, event.ownerLabel),
          groupKey: null,
          groupTitle: null,
          target: null,
          canRestore: false,
        });
        continue;
      }

      const table = change.table as HistoryTable;
      const doc = (await ctx.db.get(
        table,
        change.docId as Id<HistoryTable>,
      )) as Fields | null;

      let groupTitle: string | null = null;
      if (change.groupKey !== null) {
        const n = await groupSize(change.groupKey);
        const label = change.groupLabel ? `: ${change.groupLabel}` : "";
        const count = `(${n} ${n === 1 ? "change" : "changes"})`;
        const origin = change.fromComment ? " (from a Comment)" : "";
        groupTitle = `${who}${label} ${count}${origin}`;
      }

      let canRestore = false;
      if (
        isRestorable(change) &&
        doc !== null &&
        belongsTo(table, doc, eventId) &&
        can(me.role, "history.restore")
      ) {
        const fields = restorableFields(change);
        canRestore =
          fields.length > 0 &&
          !wouldDelete(change, fields) &&
          actionsFor(
            table,
            doc,
            fields,
            event.startingSectionRenameBlocked,
          ).every((action) => can(me.role, action));
      }

      page.push({
        changeId: change._id,
        at: change.at,
        kind: "canvas",
        op: change.op,
        byAssistant: change.actor.kind === "assistant",
        who,
        summary: canvasSummary(change),
        groupKey: change.groupKey,
        groupTitle,
        target: await targetOf(ctx, change, doc),
        canRestore,
      });
    }
    return { ...result, page };
  },
});

// ---------------------------------------------------------------------------
// Restore

/** How many custom Sections an Event has live, counted up to the cap. */
async function liveCustomSections(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<number> {
  let count = 0;
  for await (const section of ctx.db
    .query("sections")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))) {
    if (section.kind === "custom" && section.deletedAt === null) count++;
    if (count >= MAX_CUSTOM_SECTIONS) break;
  }
  return count;
}

/** Grows a Section's frame to hold its live Items, writing only when it grows. */
async function fitSectionFrame(
  ctx: MutationCtx,
  sectionId: Id<"sections">,
  actor: { kind: "member"; membershipId: Id<"memberships"> },
  group: GroupOptions = {},
): Promise<void> {
  const section = await ctx.db.get("sections", sectionId);
  if (section === null) return;
  const items: Doc<"items">[] = [];
  for await (const item of ctx.db
    .query("items")
    .withIndex("by_section", (q) => q.eq("sectionId", sectionId))) {
    if (item.deletedAt === null) items.push(item);
    if (items.length >= SECTION_ITEMS_MAX) break;
  }
  const frame = fitFrame(section.frame, items);
  if (frame.w === section.frame.w && frame.h === section.frame.h) return;
  await memberWrite(ctx, {
    table: "sections",
    id: sectionId,
    patch: { frame },
    actor,
    ...group,
  });
}

/** How putting back one change went, for Restore to throw and Undo all to count. */
type Outcome =
  | {
      kind: "done";
      changed: boolean;
      /** The new change row, when one was written. */
      changeId: Id<"changes"> | null;
    }
  | { kind: "refused"; problem: HistoryProblem }
  | { kind: "denied"; reason: "wrongEvent" | "notAllowed"; action: Action };

type GroupOptions = { groupKey?: string | null; groupLabel?: string | null };

/** The newest change row of a document. */
async function latestChangeOf(
  ctx: MutationCtx,
  docId: Doc<"changes">["docId"],
): Promise<Id<"changes"> | null> {
  const row = await ctx.db
    .query("changes")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .order("desc")
    .first();
  return row?._id ?? null;
}

/**
 * Puts back the earlier values of one change as a new change (op "restore"),
 * through `memberWrite`. Shared by Restore and Undo all, which differ only in
 * what they do with a refusal and in the history group they write to.
 */
async function putBack(
  ctx: MutationCtx,
  change: Doc<"changes">,
  membership: Doc<"memberships">,
  group: GroupOptions,
): Promise<Outcome> {
  if (!isRestorable(change))
    return { kind: "refused", problem: "notRestorable" };
  const restorable = restorableFields(change);
  if (restorable.length === 0)
    return { kind: "refused", problem: "notRestorable" };
  if (wouldDelete(change, restorable))
    return { kind: "refused", problem: "useDelete" };

  const table = change.table as HistoryTable;
  const id = change.docId as Id<HistoryTable>;
  const doc = (await ctx.db.get(table, id)) as Fields | null;
  if (doc === null) return { kind: "refused", problem: "gone" };
  if (!belongsTo(table, doc, change.eventId))
    return { kind: "denied", reason: "wrongEvent", action: "history.restore" };

  const before = change.before as Fields;
  const patch: Fields = {};
  for (const field of restorable) {
    if (!sameValue(doc[field], before[field])) patch[field] = before[field];
  }
  const fields = Object.keys(patch);
  if (fields.length === 0)
    return { kind: "done", changed: false, changeId: null };

  const event = await ctx.db.get("events", change.eventId);
  for (const action of actionsFor(
    table,
    doc,
    fields,
    event?.startingSectionRenameBlocked ?? false,
  )) {
    if (!can(membership.role, action))
      return { kind: "denied", reason: "notAllowed", action };
  }

  // A row coming back needs its parent to be there.
  const after = { ...doc, ...patch };
  if (table === "items" && after.deletedAt === null) {
    const section = await ctx.db.get(
      "sections",
      after.sectionId as Id<"sections">,
    );
    if (section === null || section.deletedAt !== null)
      return { kind: "refused", problem: "sectionDeleted" };
  }
  if (table === "entries" && after.deletedAt === null) {
    const item = await ctx.db.get("items", after.itemId as Id<"items">);
    if (item === null || item.deletedAt !== null)
      return { kind: "refused", problem: "itemDeleted" };
  }
  // A custom Section coming back counts against the cap, as a new one does.
  if (
    table === "sections" &&
    after.kind === "custom" &&
    doc.deletedAt !== null &&
    after.deletedAt === null &&
    (await liveCustomSections(ctx, change.eventId)) >= MAX_CUSTOM_SECTIONS
  ) {
    return { kind: "refused", problem: "tooManySections" };
  }

  const actor = { kind: "member" as const, membershipId: membership._id };
  await memberWrite(ctx, {
    table,
    id,
    patch: patch as never,
    actor,
    op: "restore",
    ...group,
  });
  const changeId = await latestChangeOf(ctx, change.docId);
  // An Item put back somewhere grows its Section's frame to hold it, as
  // `canvas.moveItem` does.
  const placement = ["position", "size", "sectionId", "deletedAt"];
  if (
    table === "items" &&
    after.deletedAt === null &&
    fields.some((f) => placement.includes(f))
  ) {
    await fitSectionFrame(ctx, after.sectionId as Id<"sections">, actor, group);
  }
  return { kind: "done", changed: true, changeId };
}

/**
 * Puts back the earlier values of one change as a new change (op "restore"),
 * through `memberWrite`, so the version moves on, the history gets its own row
 * and the post-write hooks run. Only the fields that change changed come back,
 * so later edits to other fields stay. Restoring a delete brings the row back.
 * Members only; a field an Owner-only setter controls needs that permission
 * too. Returns `changed: false` when the values are already back.
 */
export const restore = mutation({
  args: { changeId: v.id("changes") },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get("changes", changeId);
    if (change === null) refuse("notFound");
    // The Event comes from the stored row, never from the caller.
    const { membership } = await requireAccess(
      ctx,
      change.eventId,
      "history.restore",
    );
    // Restoring one row of an Undo all is a one-row redo: it joins that Undo
    // all's chain, so the reply's own Undo all can still finish later.
    const fromUndo = change.groupKey !== null && isUndoKey(change.groupKey);
    const group: GroupOptions = fromUndo
      ? {
          groupKey: newUndoKey(change.groupKey!),
          groupLabel: undoLabel(change.groupKey!, change.groupLabel),
        }
      : {};
    const outcome = await putBack(ctx, change, membership, group);
    if (outcome.kind === "refused") refuse(outcome.problem);
    if (outcome.kind === "denied")
      throw new AccessDenied(outcome.reason, outcome.action);
    if (outcome.changed && fromUndo) {
      await ctx.db.patch("changes", change._id, {
        undoneBy: outcome.changeId,
      });
      await reopenUndone(ctx, [change]);
    }
    return { changed: outcome.changed };
  },
});

// ---------------------------------------------------------------------------
// Undo all (X11)

/**
 * An Undo all's history group is `undo:<tap>:<the group it undid>`: one group
 * per tap, so undo, redo and undo again show as three groups, while the group
 * it undid can still be read back from the key.
 */
const UNDO_PREFIX = "undo:";
/** The most later changes to one document Undo all looks through. */
const LATER_MAX = 100;
/**
 * Roughly how many documents one Undo all tap reads before it stops and asks
 * for another tap, well under Convex's per-mutation read limit. The changes
 * it already undid stay undone, so the next tap carries on where it stopped.
 */
const READ_BUDGET = 8000;
/** Reads per change besides its later history: the row, its Event, hooks. */
const READS_PER_CHANGE = 8;
/** Items every plan keeps; delete their Entries instead (as `deleteItemOp`). */
const PLAN_ITEM_KINDS: readonly string[] = ["budget", "timeline", "checklist"];

function isUndoKey(key: string): boolean {
  return parentOf(key) !== null;
}

/** The group an Undo all's group undid, or null for any other group. */
function parentOf(key: string): string | null {
  if (!key.startsWith(UNDO_PREFIX)) return null;
  const rest = key.slice(UNDO_PREFIX.length);
  const colon = rest.indexOf(":");
  return colon <= 0 ? null : rest.slice(colon + 1);
}

/** A fresh group key for one Undo all tap on `parent`. */
function newUndoKey(parent: string): string {
  const tap = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${UNDO_PREFIX}${tap}:${parent}`;
}

/** How many Undo alls deep a group is: 0 for a reply, 1 for its undo, 2 for a redo. */
function undoDepth(key: string): number {
  let depth = 0;
  for (let k: string | null = key; k !== null && isUndoKey(k); k = parentOf(k))
    depth++;
  return depth;
}

/** Whether `key` is `groupKey` or an Undo all of it, or of that, and so on. */
function inUndoChain(key: string | null, groupKey: string): boolean {
  for (let k = key; k !== null; k = parentOf(k)) {
    if (k === groupKey) return true;
  }
  return false;
}

/**
 * The history label of an Undo all of `groupKey`: "Undo all of Plan the
 * sangeet", and "Redo Plan the sangeet" when it undoes an Undo all.
 */
function undoLabel(groupKey: string, label: string | null): string {
  const base = (label ?? "").replace(/^(Undo all of |Redo )/, "");
  if (undoDepth(groupKey) % 2 === 1) return base ? `Redo ${base}` : "Redo";
  return base ? `Undo all of ${base}` : "Undo all";
}

/**
 * When the change an Undo all wrote is itself put back (by Restore, or by
 * undoing that Undo all), the change it undid counts as not undone again, so
 * the original reply's Undo all can run on it once more.
 */
async function reopenUndone(
  ctx: MutationCtx,
  changes: Doc<"changes">[],
): Promise<void> {
  const byParent = new Map<string, Set<Id<"changes">>>();
  for (const change of changes) {
    const parent = change.groupKey === null ? null : parentOf(change.groupKey);
    if (parent === null) continue;
    const ids = byParent.get(parent) ?? new Set();
    ids.add(change._id);
    byParent.set(parent, ids);
  }
  for (const [parent, ids] of byParent) {
    const rows = await ctx.db
      .query("changes")
      .withIndex("by_group", (q) => q.eq("groupKey", parent))
      .take(GROUP_COUNT_MAX);
    for (const row of rows) {
      if (row.undoneBy !== null && ids.has(row.undoneBy))
        await ctx.db.patch("changes", row._id, { undoneBy: null });
    }
  }
}

/** What a change was about, as a person names it: "Sangeet DJ", "the Budget". */
function plainName(table: HistoryTable, doc: Fields): string {
  switch (table) {
    case "entries": {
      const fields = (doc.fields ?? {}) as Fields;
      const label =
        fields.label ??
        fields.title ??
        fields.freeLabel ??
        fields.vendorCategory;
      return typeof label === "string" && label.trim() !== ""
        ? label.trim()
        : "an Entry";
    }
    case "sections":
    case "eventFunctions":
    case "vendors":
      return typeof doc.name === "string" && doc.name.trim() !== ""
        ? doc.name.trim()
        : thingOf(table, doc);
    default:
      return thingOf(table, doc);
  }
}

/**
 * Whether Undo all may delete this row again: an Item other than the plan's
 * Budget, Timeline and Vendor checklist, an Entry other than a Contingency or
 * Unallocated line, or a custom Section. Deleting anything else has its own
 * rules elsewhere.
 */
function canTakeBack(table: string, doc: Fields | null): boolean {
  if (doc === null) return false;
  switch (table) {
    case "items":
      return !PLAN_ITEM_KINDS.includes(doc.kind as string);
    case "entries": {
      const role = ((doc.fields ?? {}) as Fields).role;
      return role !== "contingency" && role !== "unallocated";
    }
    case "sections":
      return doc.kind === "custom";
    default:
      return false;
  }
}

/** Whether undoing this change deletes its row again rather than putting values back. */
function deletesAgain(change: Doc<"changes">): boolean {
  if (change.op === "create") return true;
  return isRestorable(change) && wouldDelete(change, restorableFields(change));
}

/** Whether Undo all can ever undo this change, whatever happens later. */
function undoable(change: Doc<"changes">): boolean {
  if (change.table === "memberships") return false;
  if (deletesAgain(change))
    return canTakeBack(change.table, (change.after ?? null) as Fields | null);
  return isRestorable(change) && restorableFields(change).length > 0;
}

/** Whether this change's earlier state is already back, by whoever put it there. */
async function alreadyBack(
  ctx: MutationCtx,
  change: Doc<"changes">,
): Promise<boolean> {
  const doc = (await ctx.db.get(
    change.table as HistoryTable,
    change.docId as Id<HistoryTable>,
  )) as Fields | null;
  if (doc === null) return false;
  if (deletesAgain(change)) return doc.deletedAt != null;
  const before = change.before as Fields;
  return restorableFields(change).every((f) => sameValue(doc[f], before[f]));
}

/**
 * Deletes again a row the change added (or brought back), as a soft delete
 * through `memberSoftDelete`, so Restore can bring it back. Only what
 * `canTakeBack` allows, and a custom Section only once it is empty.
 */
async function takeBack(
  ctx: MutationCtx,
  change: Doc<"changes">,
  membership: Doc<"memberships">,
  group: GroupOptions,
): Promise<Outcome> {
  const table = change.table;
  if (table !== "items" && table !== "entries" && table !== "sections")
    return { kind: "refused", problem: "notRestorable" };
  const id = change.docId as Id<SoftDeleteTable>;
  const doc = (await ctx.db.get(table, id as never)) as Fields | null;
  if (doc === null) return { kind: "refused", problem: "gone" };
  if (!belongsTo(table, doc, change.eventId))
    return { kind: "denied", reason: "wrongEvent", action: "history.restore" };
  if (!canTakeBack(table, doc))
    return { kind: "refused", problem: "notRestorable" };
  if (doc.deletedAt !== null)
    return { kind: "done", changed: false, changeId: null };

  if (table === "sections") {
    for await (const item of ctx.db
      .query("items")
      .withIndex("by_section", (q) =>
        q.eq("sectionId", id as Id<"sections">),
      )) {
      if (item.deletedAt === null)
        return { kind: "refused", problem: "sectionNotEmpty" };
    }
  }
  const event = await ctx.db.get("events", change.eventId);
  for (const action of actionsFor(
    table,
    doc,
    ["deletedAt"],
    event?.startingSectionRenameBlocked ?? false,
  )) {
    if (!can(membership.role, action))
      return { kind: "denied", reason: "notAllowed", action };
  }

  await memberSoftDelete(ctx, {
    table,
    id: id as never,
    actor: { kind: "member", membershipId: membership._id },
    ...group,
  });
  return {
    kind: "done",
    changed: true,
    changeId: await latestChangeOf(ctx, change.docId),
  };
}

const undoResultValidator = v.object({
  /** Changes undone by this tap. */
  undone: v.number(),
  /** Changes in the group. */
  total: v.number(),
  /** "Undid 7 of 8; Rohan has since edited Sangeet DJ". */
  message: v.string(),
});

/**
 * Undo all (assistant-behavior.md rule 18): puts back everything one
 * Assistant reply or accepted Proposal changed, newest first, as one new
 * history group of the Member's own changes, reusing Restore's rules per
 * change. A row the reply added is deleted again. Anything someone else edited
 * after the reply is skipped and named in the message, unless its earlier
 * state is already back. Each change undone is marked with `undoneBy`, so a
 * second tap undoes nothing new. Changes it can never undo (a shared Vendor,
 * a Function, the plan's own Items) are named. Members only, like Restore;
 * the Event comes from the stored rows, never from the caller.
 */
export const undoGroup = mutation({
  args: { groupKey: v.string() },
  returns: undoResultValidator,
  handler: async (ctx, { groupKey }) => {
    const rows = await ctx.db
      .query("changes")
      .withIndex("by_group", (q) => q.eq("groupKey", groupKey))
      .order("desc")
      .take(GROUP_COUNT_MAX);
    if (rows.length === 0) refuse("notFound");
    const eventId = rows[0]!.eventId;
    const { membership } = await requireAccess(ctx, eventId, "history.restore");
    const changes = rows.filter((r) => r.eventId === eventId);
    const group: GroupOptions = {
      groupKey: newUndoKey(groupKey),
      groupLabel: undoLabel(
        groupKey,
        changes.find((c) => c.groupLabel !== null)?.groupLabel ?? null,
      ),
    };
    const redo = undoDepth(groupKey) % 2 === 1;

    const membershipOf = cached((id: Id<"memberships">) =>
      ctx.db.get("memberships", id),
    );
    let undone = 0;
    let already = 0;
    let reads = 0;
    let unread = 0;
    const edited = new Map<string, string[]>();
    /** Newest first; reversed for the message. */
    const cannot: string[] = [];
    const putBackNow: Doc<"changes">[] = [];
    const nameOfChange = (change: Doc<"changes">) =>
      plainName(
        change.table as HistoryTable,
        (change.after ?? change.before ?? {}) as Fields,
      );
    for (const change of changes) {
      if (change.undoneBy !== null) {
        already++;
        continue;
      }
      if (!undoable(change)) {
        cannot.push(nameOfChange(change));
        continue;
      }
      if (reads > READ_BUDGET) {
        unread++;
        continue;
      }
      // Someone outside this reply (and its undos) changed the row since.
      const later = await ctx.db
        .query("changes")
        .withIndex("by_doc", (q) =>
          q.eq("docId", change.docId).gt("_creationTime", change._creationTime),
        )
        .take(LATER_MAX);
      reads += later.length + READS_PER_CHANGE;
      const other = later.find((r) => !inUndoChain(r.groupKey, groupKey));
      if (other !== undefined) {
        if (await alreadyBack(ctx, change)) {
          // Put back by hand (a per-change Restore): count it as undone.
          undone++;
          await ctx.db.patch("changes", change._id, {
            undoneBy: await latestChangeOf(ctx, change.docId),
          });
          continue;
        }
        const who = await whoOf(other.actor, membershipOf, eventId);
        const names = edited.get(who) ?? [];
        names.push(nameOfChange(change));
        edited.set(who, names);
        continue;
      }

      const outcome = deletesAgain(change)
        ? await takeBack(ctx, change, membership, group)
        : await putBack(ctx, change, membership, group);
      if (outcome.kind !== "done") {
        cannot.push(nameOfChange(change));
        continue;
      }
      undone++;
      if (outcome.changed) putBackNow.push(change);
      // Values already back count as undone, pointing at the row that has them.
      const undoneBy =
        outcome.changeId ?? (await latestChangeOf(ctx, change.docId));
      await ctx.db.patch("changes", change._id, { undoneBy });
    }
    await reopenUndone(ctx, putBackNow);

    const total = changes.length;
    const verb = redo ? "Redid" : "Undid";
    const parts = [
      undone > 0 || already === 0
        ? `${verb} ${undone} of ${total}`
        : edited.size === 0 && unread === 0
          ? redo
            ? "Already redone"
            : "Already undone"
          : redo
            ? "Nothing more to redo"
            : "Nothing more to undo",
    ];
    for (const [who, names] of edited)
      parts.push(`${who} has since edited ${listWords(names.reverse())}`);
    if (cannot.length > 0)
      parts.push(`${listWords(cannot.reverse())} can't be undone here`);
    if (unread > 0)
      parts.push(
        `${unread} more ${unread === 1 ? "change" : "changes"} left: press again to carry on`,
      );
    if (rows.length === GROUP_COUNT_MAX)
      parts.push(`only the newest ${GROUP_COUNT_MAX} changes were looked at`);
    return { undone, total, message: parts.join("; ") };
  },
});

/**
 * What the Undo all button shows for one group: whether this person may
 * press it and how many changes it can still undo. Null when the group has
 * nothing Undo all could ever undo (a reply that only talked) or the caller
 * isn't in its Event.
 */
export const groupStatus = query({
  args: { groupKey: v.string() },
  returns: v.union(
    v.object({ canUndo: v.boolean(), left: v.number(), total: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { groupKey }) => {
    const rows = await ctx.db
      .query("changes")
      .withIndex("by_group", (q) => q.eq("groupKey", groupKey))
      .take(GROUP_COUNT_MAX);
    if (rows.length === 0) return null;
    const eventId = rows[0]!.eventId;
    let role: Role;
    try {
      role = (await requireAccess(ctx, eventId, "canvas.view")).membership.role;
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
    const changes = rows.filter((r) => r.eventId === eventId);
    const undoableRows = changes.filter(undoable);
    if (undoableRows.length === 0) return null;
    return {
      canUndo: can(role, "history.restore"),
      left: undoableRows.filter((c) => c.undoneBy === null).length,
      total: changes.length,
    };
  },
});
