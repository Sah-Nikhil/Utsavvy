import { createTool } from "@convex-dev/agent";
import type { Tool } from "ai";
import { ConvexError, v, type Infer, type Value } from "convex/values";
import { z } from "zod";
import { entryAmount } from "../../../components/items/budget/rollup";
import { layoutSections } from "../../../lib/canvas/layout";
import {
  fitFrame,
  placeInFreeSpace,
  type Size,
} from "../../../lib/canvas/placement";
import {
  cleanSectionName,
  frameForNewSection,
} from "../../../lib/canvas/starting";
import { formatINR } from "../../../lib/format";
import { isTableCategory } from "../../../lib/pricing";
import type { CityTier, EventType } from "../../../lib/types";
import type { Actor, AssistantActor } from "../../../lib/types/actors";
import { themeUpdateValidator } from "../../../lib/types/brief";
import {
  commentTargetValidator,
  type EntryFields,
  type ItemKind,
} from "../../../lib/types/canvas";
import {
  pricedEstimateValidator,
  type PricedEstimate,
} from "../../../lib/types/estimates";
import type {
  ProposalOpHandler,
  ProposedChange,
} from "../../../lib/types/proposals";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { liveSections, MAX_CUSTOM_SECTIONS, placeNewItem } from "../../canvas";
import { checkNewComment, commentItem } from "../../comments";
import {
  cleanLabel,
  nextOrder,
  planItemOf,
  rescaleEstimate,
} from "../../entries";
import { estimateLines, type EstimateDeps } from "../../estimates";
import { requireAccessFor } from "../../lib/access";
import { AccessDenied } from "../../lib/errors";
import {
  assistantInsert,
  assistantSoftDelete,
  assistantWrite,
  type Patch,
} from "../../lib/write";
import type { AssistantToolCtx } from "../agent";
import { checkMemberStatedAmount } from "../amounts";
import {
  cleanDate,
  cleanOptionalNote,
  cleanTime,
  otherBudgetLines,
  priceLine,
  type ToolResult,
} from "./core";

/*
 * S10 (Proposals): the `propose` tool and the handlers for every Proposal op
 * except addQuote (S12), updateTheme (S13) and changeEssential (S14).
 *
 * The tool turns the model's changes into `ProposedChange`s against the
 * versions it read, with every amount from the estimate cascade, the asking
 * Member's own words or code arithmetic (IMPLEMENTATION_PLAN.md section 3,
 * item 1), and posts them as one Proposal. Nothing on the Canvas changes
 * until a Member accepts; then `applyProposal` (`convex/proposals.ts`) calls
 * these handlers, which write through `assistantWrite`, `assistantInsert`
 * and `assistantSoftDelete` with the Proposal as the history group.
 */

type Ctx = QueryCtx | MutationCtx;

/** A Proposal holds at most this many changes. */
export const MAX_PROPOSAL_CHANGES = 20;

/** The refusal every caller of `createProposal` can show or hand to the model. */
export function proposalRefused(message: string): never {
  throw new ConvexError({ kind: "ProposalRefused", message });
}

const NOTE_SIZE: Size = { w: 300, h: 200 };
const SUGGESTION_SIZE: Size = { w: 300, h: 220 };
const MAX_NOTE_TEXT = 4000;
const MAX_SUGGESTION_BODY = 1000;
const MAX_QUANTITY = 100_000;
/** ₹100 crore, as for a Member's own amount (`convex/entries.ts`). */
const MAX_AMOUNT = 1_000_000_000;

const PLAN_KINDS: readonly ItemKind[] = ["budget", "timeline", "checklist"];

/** Which fields an `updateEntry` change may set, per Entry kind. */
const ENTRY_PATCH_FIELDS: Record<Doc<"entries">["kind"], readonly string[]> = {
  budget: ["label", "quantity", "plannedAmount", "estimate"],
  timeline: ["title", "date", "time", "note", "done"],
  checklist: ["freeLabel", "functionKeys"],
};
/** Which data fields an `updateItem` change may set, per Item kind. */
const ITEM_PATCH_FIELDS: Partial<Record<ItemKind, readonly string[]>> = {
  note: ["text"],
  suggestion: ["title", "body"],
  budget: ["note"],
  timeline: ["note"],
  checklist: ["note"],
};

// ---------------------------------------------------------------------------
// Shared checks

async function liveDoc<T extends "items" | "entries" | "sections">(
  ctx: Ctx,
  table: T,
  id: string,
): Promise<Doc<T> | null> {
  const normalized = ctx.db.normalizeId(table, id);
  const doc = normalized === null ? null : await ctx.db.get(table, normalized);
  if (doc === null) return null;
  return (doc as unknown as { deletedAt: number | null }).deletedAt === null
    ? (doc as Doc<T>)
    : null;
}

function isText(value: unknown, max: number, nullable = false): boolean {
  if (value === null) return nullable;
  return (
    typeof value === "string" && value.trim() !== "" && value.length <= max
  );
}

/** The direct tools' own check (S7), as a refusal message or null. */
function refusalOf(check: () => unknown): string | null {
  try {
    check();
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data?.message === "string")
      return error.data.message as string;
    return "That value isn't allowed.";
  }
}

function fieldProblem(key: string, value: unknown): string | null {
  switch (key) {
    case "label":
    case "title":
      return isText(value, 120) ? null : `A ${key} is short text.`;
    case "freeLabel":
      return isText(value, 120, true) ? null : "A Vendor name is short text.";
    case "quantity":
      return typeof value === "number" && value > 0 && value <= MAX_QUANTITY
        ? null
        : "A quantity is a number above zero.";
    case "plannedAmount":
      return Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) <= MAX_AMOUNT
        ? null
        : "An amount is a whole number of rupees.";
    case "date":
      return refusalOf(() => cleanDate(value as string | null));
    case "time":
      return refusalOf(() => cleanTime(value as string | null));
    case "note":
      return refusalOf(() => cleanOptionalNote(value as string | null));
    case "done":
      return typeof value === "boolean" ? null : "Done is true or false.";
    case "functionKeys":
      return Array.isArray(value) && value.every((k) => typeof k === "string")
        ? null
        : "Function keys are a list.";
    case "text":
      return isText(value, MAX_NOTE_TEXT) ? null : "A Note needs text.";
    case "body":
      return isText(value, MAX_SUGGESTION_BODY)
        ? null
        : "A Suggestion needs text.";
    default:
      return `${key} can't be changed this way.`;
  }
}

async function functionKeysProblem(
  ctx: Ctx,
  eventId: Id<"events">,
  keys: readonly (string | null)[],
): Promise<string | null> {
  const wanted = keys.filter((k): k is string => k !== null);
  if (wanted.length === 0) return null;
  const known = new Set(
    (
      await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).map((fn) => fn.key),
  );
  const missing = wanted.find((key) => !known.has(key));
  return missing === undefined
    ? null
    : `"${missing}" isn't a Function in this Event.`;
}

async function liveItemsIn(
  ctx: Ctx,
  sectionId: Id<"sections">,
): Promise<Doc<"items">[]> {
  const rows = await ctx.db
    .query("items")
    .withIndex("by_section", (q) => q.eq("sectionId", sectionId))
    .take(1000);
  return rows.filter((i) => i.deletedAt === null);
}

/** A short, stable key for one change, so each write of an Accept has its own idempotency key. */
function changeKey(change: ProposedChange): string {
  const text = JSON.stringify(change.values);
  let hash = 5381;
  for (let i = 0; i < text.length; i++)
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${change.op}:${change.docId ?? hash.toString(36)}`;
}

/** Proposal changes are always applied as the Assistant, for the Member who asked. */
function assistantOf(actor: Actor): AssistantActor {
  if (actor.kind !== "assistant")
    throw new Error("A Proposal's changes are applied as the Assistant");
  return actor;
}

/** The write helpers' options for one change of an accepted Proposal. */
async function writeOptions(
  ctx: MutationCtx,
  change: ProposedChange,
  actor: Actor,
  n = 1,
) {
  const assistant = assistantOf(actor);
  const proposal =
    assistant.proposalId === null
      ? null
      : await ctx.db.get("proposals", assistant.proposalId);
  return {
    runId: assistant.runId,
    proposalId: assistant.proposalId,
    acceptedBy: assistant.acceptedBy,
    forMembershipId: assistant.forMembershipId,
    fromComment: proposal?.origin.kind === "comment",
    groupLabel: null,
    toolCallId: `accept:${changeKey(change)}#${n}`,
  };
}

// ---------------------------------------------------------------------------
// The op handlers

/**
 * An `estimate` patch may only move the line's Estimate amount within its own
 * range (a cut to its low end); its range, label and basis stay as they are.
 */
function estimateProblem(entry: Doc<"entries">, value: unknown): string | null {
  if (entry.kind !== "budget" || entry.fields.estimate === null)
    return "That line has no Estimate.";
  const current = entry.fields.estimate;
  const next = value as typeof current | null;
  if (next === null || typeof next !== "object") return "An Estimate stays.";
  const { amount, ...rest } = next;
  const { amount: _amount, ...same } = current;
  if (JSON.stringify(rest) !== JSON.stringify(same))
    return "Only an Estimate's amount can move, within its range.";
  if (
    !Number.isInteger(amount) ||
    amount < current.low ||
    amount > current.high
  )
    return "An Estimate's amount stays within its range.";
  return null;
}

/**
 * A budget line's fields after a Proposal's patch, exactly as Accept writes
 * them: a new quantity rescales the line's Estimate at the same price per
 * unit, unless the patch sets the Estimate itself. The card, Accept and the
 * freed-rupees count all use this, so the rupees a card shows are the rupees
 * Accept writes.
 */
export function nextBudgetFields(
  before: EntryFields<"budget">,
  patch: Record<string, unknown>,
): EntryFields<"budget"> {
  const next = { ...before, ...patch } as EntryFields<"budget">;
  if (
    "quantity" in patch &&
    !("estimate" in patch) &&
    before.estimate !== null &&
    next.quantity !== before.quantity
  )
    next.estimate = rescaleEstimate(
      before.estimate,
      before.unit,
      before.quantity,
      next.quantity,
    );
  // A Member's own amount (their words) marks the line as theirs; a cut to
  // the Estimate's low end stays an Estimate.
  if (typeof patch.plannedAmount === "number") next.editedByMember = true;
  return next;
}

export const updateEntryOp: ProposalOpHandler<"updateEntry"> = {
  validate: async (ctx, change) => {
    const entry = await liveDoc(ctx, "entries", change.docId);
    if (entry === null) return "That Entry isn't on the Canvas any more.";
    const { fields, functionKey, ...rest } = change.values.patch;
    if (Object.keys(rest).length > 0)
      return "Only an Entry's fields and Function can change.";
    const patch = (fields ?? {}) as Record<string, unknown>;
    if (typeof patch !== "object" || patch === null || Array.isArray(patch))
      return "The patch changes nothing.";
    const allowed = ENTRY_PATCH_FIELDS[entry.kind];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) return `${key} can't be changed this way.`;
      const problem =
        key === "estimate"
          ? estimateProblem(entry, value)
          : key === "plannedAmount" && value === null
            ? null
            : fieldProblem(key, value);
      if (problem) return problem;
    }
    const keys: (string | null)[] = [];
    if (functionKey !== undefined) {
      if (functionKey !== null && typeof functionKey !== "string")
        return "A Function key is text.";
      keys.push(functionKey as string | null);
    }
    if (Array.isArray(patch.functionKeys))
      keys.push(...(patch.functionKeys as string[]));
    const fnProblem = await functionKeysProblem(ctx, entry.eventId, keys);
    if (fnProblem) return fnProblem;
    if (Object.keys(patch).length === 0 && functionKey === undefined)
      return "The patch changes nothing.";
    return null;
  },
  apply: async (ctx, change, actor) => {
    const entry = (await ctx.db.get("entries", change.docId))!;
    const patch = (change.values.patch.fields ?? {}) as Record<string, unknown>;
    const fields =
      entry.kind === "budget"
        ? nextBudgetFields(entry.fields, patch)
        : { ...entry.fields, ...patch };
    const touched = Object.keys(patch);
    const extra: { functionKey?: string | null } = {};
    if ("functionKey" in change.values.patch) {
      extra.functionKey = change.values.patch.functionKey as string | null;
      touched.push("functionKey");
    }
    await assistantWrite(ctx, {
      table: "entries",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      patch: {
        ...extra,
        fields,
        assumed: entry.assumed.filter((name) => !touched.includes(name)),
      } as Patch<"entries">,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [change.docId];
  },
};

export const deleteEntryOp: ProposalOpHandler<"deleteEntry"> = {
  validate: async (ctx, change) => {
    const entry = await liveDoc(ctx, "entries", change.docId);
    if (entry === null) return "That Entry isn't on the Canvas any more.";
    if (entry.kind === "budget" && entry.fields.role !== "line")
      return "The Contingency and Unallocated lines stay; change their amount instead.";
    return null;
  },
  apply: async (ctx, change, actor) => {
    await assistantSoftDelete(ctx, {
      table: "entries",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [change.docId];
  },
};

export const addEntryOp: ProposalOpHandler<"addEntry"> = {
  validate: async (ctx, change) => {
    const item = await liveDoc(ctx, "items", change.values.itemId);
    if (item === null || item.kind !== change.values.kind)
      return `This Event has no ${change.values.kind} Item for that Entry.`;
    const fields = change.values.fields as Record<string, unknown>;
    const kindFields: Record<string, readonly string[]> = {
      budget: ["label", "quantity", "unit", "role"],
      timeline: ["title", "done"],
      checklist: ["functionKeys"],
    };
    for (const key of kindFields[change.values.kind]!) {
      if (!(key in fields)) return `That isn't a ${change.values.kind} Entry.`;
    }
    if (change.values.kind === "timeline") {
      for (const key of ["title", "date", "time", "note"] as const) {
        const problem = fieldProblem(key, fields[key]);
        if (problem) return problem;
      }
    }
    if (change.values.kind === "budget") {
      const f = fields as EntryFields<"budget">;
      if (f.role !== "line") return "A new budget line is an ordinary line.";
      const problem =
        fieldProblem("label", f.label) ??
        fieldProblem("quantity", f.quantity) ??
        (f.plannedAmount !== null
          ? fieldProblem("plannedAmount", f.plannedAmount)
          : null);
      if (problem) return problem;
    }
    const keys = [
      change.values.functionKey,
      ...((fields.functionKeys as string[] | undefined) ?? []),
    ];
    return await functionKeysProblem(ctx, item.eventId, keys);
  },
  apply: async (ctx, change, actor) => {
    const item = (await ctx.db.get("items", change.values.itemId))!;
    const { id } = await assistantInsert(ctx, {
      table: "entries",
      value: {
        eventId: item.eventId,
        itemId: item._id,
        order: await nextOrder(ctx, item._id),
        functionKey: change.values.functionKey,
        kind: change.values.kind,
        fields: change.values.fields,
        assumed: [],
        createdBy: actor,
      } as never,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [id];
  },
};

export const addItemOp: ProposalOpHandler<"addItem"> = {
  validate: async (ctx, change) => {
    const section = await liveDoc(ctx, "sections", change.values.sectionId);
    if (section === null) return "That Section isn't on the Canvas any more.";
    const problem =
      change.values.kind === "note"
        ? fieldProblem("text", change.values.data.text)
        : (fieldProblem("title", change.values.data.title) ??
          fieldProblem("body", change.values.data.body));
    if (problem) return problem;
    return await functionKeysProblem(ctx, section.eventId, [
      change.values.functionKey,
    ]);
  },
  apply: async (ctx, change, actor) => {
    const section = (await ctx.db.get("sections", change.values.sectionId))!;
    const size = change.values.kind === "note" ? NOTE_SIZE : SUGGESTION_SIZE;
    const position = placeInFreeSpace(
      section,
      await liveItemsIn(ctx, section._id),
      size,
    );
    const { id } = await assistantInsert(ctx, {
      table: "items",
      value: {
        eventId: section.eventId,
        sectionId: section._id,
        position,
        size,
        functionKey: change.values.functionKey,
        createdBy: actor,
        kind: change.values.kind,
        data: change.values.data,
      } as never,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [id];
  },
};

export const updateItemOp: ProposalOpHandler<"updateItem"> = {
  validate: async (ctx, change) => {
    const item = await liveDoc(ctx, "items", change.docId);
    if (item === null) return "That Item isn't on the Canvas any more.";
    const { data, ...rest } = change.values.patch;
    if (
      Object.keys(rest).length > 0 ||
      typeof data !== "object" ||
      data === null
    )
      return "Only an Item's text can change.";
    const allowed = ITEM_PATCH_FIELDS[item.kind];
    if (!allowed)
      return `A ${item.kind} stays as its Member made it; the Assistant can't edit it.`;
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return "The patch changes nothing.";
    for (const [key, value] of entries) {
      if (!allowed.includes(key)) return `${key} can't be changed this way.`;
      const problem = fieldProblem(key, value);
      if (problem) return problem;
    }
    return null;
  },
  apply: async (ctx, change, actor) => {
    const item = (await ctx.db.get("items", change.docId))!;
    await assistantWrite(ctx, {
      table: "items",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      patch: {
        data: { ...item.data, ...(change.values.patch.data as object) },
      } as Patch<"items">,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [change.docId];
  },
};

export const moveItemOp: ProposalOpHandler<"moveItem"> = {
  validate: async (ctx, change) => {
    const item = await liveDoc(ctx, "items", change.docId);
    if (item === null) return "That Item isn't on the Canvas any more.";
    if (change.values.sectionId === null && change.values.position === null)
      return "Say where the Item goes.";
    if (change.values.sectionId !== null) {
      const section = await liveDoc(ctx, "sections", change.values.sectionId);
      if (section === null || section.eventId !== item.eventId)
        return "That Section isn't on the Canvas any more.";
    }
    return null;
  },
  apply: async (ctx, change, actor) => {
    const item = (await ctx.db.get("items", change.docId))!;
    const target = (await ctx.db.get(
      "sections",
      change.values.sectionId ?? item.sectionId,
    ))!;
    const others = (await liveItemsIn(ctx, target._id)).filter(
      (i) => i._id !== item._id,
    );
    const size = item.size ?? NOTE_SIZE;
    const position =
      change.values.position !== null
        ? {
            x: Math.max(0, Math.round(change.values.position.x)),
            y: Math.max(0, Math.round(change.values.position.y)),
          }
        : placeInFreeSpace(target, others, size);
    await assistantWrite(ctx, {
      table: "items",
      id: item._id,
      expectedVersion: change.expectedVersion,
      patch: { sectionId: target._id, position },
      ...(await writeOptions(ctx, change, actor)),
    });
    // The Section grows to hold the Item, as a Member's drag does.
    const frame = fitFrame(target.frame, [...others, { position, size }]);
    if (frame.w !== target.frame.w || frame.h !== target.frame.h) {
      await assistantWrite(ctx, {
        table: "sections",
        id: target._id,
        expectedVersion: target.version,
        patch: { frame },
        ...(await writeOptions(ctx, change, actor, 2)),
      });
    }
    return [item._id];
  },
};

export const createSectionOp: ProposalOpHandler<"createSection"> = {
  validate: async (_ctx, change) => {
    const name = cleanSectionName(change.values.name);
    if (!name.ok)
      return name.problem === "tooLong"
        ? "That Section name is too long."
        : "Give the Section a name.";
    return null;
  },
  apply: async (ctx, change, actor) => {
    const membership = (await ctx.db.get(
      "memberships",
      assistantOf(actor).forMembershipId,
    ))!;
    const eventId = membership.eventId;
    const name = cleanSectionName(change.values.name);
    if (!name.ok) proposalRefused("Give the Section a name.");
    const sections = await liveSections(ctx, eventId);
    if (
      sections.filter((s) => s.kind === "custom").length >= MAX_CUSTOM_SECTIONS
    )
      proposalRefused("This Event has as many Sections as it can hold.");
    const items = (
      await ctx.db
        .query("items")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(1000)
    ).filter((i) => i.deletedAt === null);
    const boxes = layoutSections(sections, (s) =>
      items.filter((item) => item.sectionId === s._id),
    );
    const { id } = await assistantInsert(ctx, {
      table: "sections",
      value: {
        eventId,
        kind: "custom",
        name: name.name,
        frame: frameForNewSection([...boxes.values()]),
        order: Math.max(-1, ...sections.map((s) => s.order)) + 1,
      },
      ...(await writeOptions(ctx, change, actor)),
    });
    return [id];
  },
};

export const addCommentOp: ProposalOpHandler<"addComment"> = {
  validate: async (ctx, change) => {
    try {
      const item = await commentItem(ctx, change.values.target);
      await checkNewComment(
        ctx,
        item,
        change.values.target,
        change.values.body,
        null,
      );
      return null;
    } catch (error) {
      if (error instanceof ConvexError && error.data?.kind === "CommentRefused")
        return "That Comment can't be added there.";
      throw error;
    }
  },
  apply: async (ctx, change, actor) => {
    const assistant = assistantOf(actor);
    const proposal =
      assistant.proposalId === null
        ? null
        : await ctx.db.get("proposals", assistant.proposalId);
    if (proposal?.runId == null)
      proposalRefused("A Comment needs the reply that proposed it.");
    const item = await commentItem(ctx, change.values.target);
    const body = await checkNewComment(
      ctx,
      item,
      change.values.target,
      change.values.body,
      null,
    );
    // Comments leave no history row (#93), as for the direct tool.
    const id = await ctx.db.insert("comments", {
      eventId: item.eventId,
      itemId: item._id,
      target: change.values.target,
      rootId: null,
      author: {
        kind: "assistant",
        runId: proposal.runId,
        forMembershipId: assistant.forMembershipId,
      },
      body,
      resolved: false,
      createdAt: Date.now(),
      editedAt: null,
    });
    return [id];
  },
};

export const deleteItemOp: ProposalOpHandler<"deleteItem"> = {
  validate: async (ctx, change) => {
    const item = await liveDoc(ctx, "items", change.docId);
    if (item === null) return "That Item isn't on the Canvas any more.";
    if (PLAN_KINDS.includes(item.kind))
      return "The Budget, Timeline and Vendor checklist stay; delete their Entries instead.";
    return null;
  },
  apply: async (ctx, change, actor) => {
    await assistantSoftDelete(ctx, {
      table: "items",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      ...(await writeOptions(ctx, change, actor)),
    });
    return [change.docId];
  },
};

export const setBudgetTotalOp: ProposalOpHandler<"setBudgetTotal"> = {
  validate: async (ctx, change) => {
    const event = await ctx.db.get("events", change.docId);
    if (event === null) return "That Event isn't there.";
    const amount = change.values.budgetTotal;
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT)
      return "A Budget total is a whole number of rupees above zero.";
    return null;
  },
  apply: async (ctx, change, actor) => {
    await assistantWrite(ctx, {
      table: "events",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      patch: { budgetTotal: change.values.budgetTotal },
      ...(await writeOptions(ctx, change, actor)),
    });
    return [change.docId];
  },
};

// ---------------------------------------------------------------------------
// The `propose` tool's server side

const amountSourceValidator = v.union(
  v.object({ memberStated: v.number() }),
  v.object({ estimateLow: v.literal(true) }),
  v.object({ receiveFreedFrom: v.array(v.number()) }),
);

/** One change as the tool hands it over, before the server resolves its amounts and versions. */
export const changeSpecValidator = v.union(
  v.object({
    op: v.literal("updateEntry"),
    entryId: v.string(),
    expectedVersion: v.number(),
    functionKey: v.optional(v.union(v.string(), v.null())),
    patch: v.union(
      v.object({
        kind: v.literal("budget"),
        label: v.optional(v.string()),
        quantity: v.optional(v.number()),
        amount: v.optional(amountSourceValidator),
      }),
      v.object({
        kind: v.literal("timeline"),
        title: v.optional(v.string()),
        date: v.optional(v.union(v.string(), v.null())),
        time: v.optional(v.union(v.string(), v.null())),
        note: v.optional(v.union(v.string(), v.null())),
        done: v.optional(v.boolean()),
      }),
      v.object({
        kind: v.literal("checklist"),
        label: v.optional(v.string()),
        functionKeys: v.optional(v.array(v.string())),
      }),
    ),
  }),
  v.object({
    op: v.literal("deleteEntry"),
    entryId: v.string(),
    expectedVersion: v.number(),
  }),
  v.object({
    op: v.literal("addEntry"),
    entry: v.union(
      v.object({
        kind: v.literal("budget"),
        label: v.string(),
        functionKey: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
        quantity: v.number(),
        unit: v.string(),
        estimate: v.union(pricedEstimateValidator, v.null()),
        memberStated: v.union(v.number(), v.null()),
      }),
      v.object({
        kind: v.literal("timeline"),
        title: v.string(),
        functionKey: v.union(v.string(), v.null()),
        date: v.union(v.string(), v.null()),
        time: v.union(v.string(), v.null()),
        note: v.union(v.string(), v.null()),
      }),
      v.object({
        kind: v.literal("checklist"),
        label: v.string(),
        functionKey: v.union(v.string(), v.null()),
        functionKeys: v.array(v.string()),
      }),
    ),
  }),
  v.object({
    op: v.literal("addItem"),
    sectionId: v.union(v.string(), v.null()),
    functionKey: v.union(v.string(), v.null()),
    item: v.union(
      v.object({ kind: v.literal("note"), text: v.string() }),
      v.object({
        kind: v.literal("suggestion"),
        title: v.string(),
        body: v.string(),
        costCategory: v.union(v.string(), v.null()),
        quantity: v.union(v.number(), v.null()),
        estimate: v.union(pricedEstimateValidator, v.null()),
      }),
    ),
  }),
  v.object({
    op: v.literal("updateItem"),
    itemId: v.string(),
    expectedVersion: v.number(),
    patch: v.union(
      v.object({ kind: v.literal("note"), text: v.string() }),
      v.object({
        kind: v.literal("suggestion"),
        title: v.optional(v.string()),
        body: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("planNote"),
        note: v.union(v.string(), v.null()),
      }),
    ),
  }),
  v.object({
    op: v.literal("moveItem"),
    itemId: v.string(),
    expectedVersion: v.number(),
    sectionId: v.string(),
  }),
  v.object({
    op: v.literal("deleteItem"),
    itemId: v.string(),
    expectedVersion: v.number(),
  }),
  v.object({ op: v.literal("createSection"), name: v.string() }),
  v.object({
    op: v.literal("addComment"),
    target: commentTargetValidator,
    body: v.string(),
  }),
  v.object({
    op: v.literal("setBudgetTotal"),
    expectedVersion: v.number(),
    memberStated: v.number(),
  }),
  v.object({
    op: v.literal("updateTheme"),
    expectedVersion: v.number(),
    theme: themeUpdateValidator,
  }),
);
type ChangeSpec = Infer<typeof changeSpecValidator>;

export const callRef = {
  runId: v.id("runs"),
  eventId: v.id("events"),
  forMembershipId: v.id("memberships"),
  toolCallId: v.string(),
};

export class Refusal extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}
export function refuse(reason: string, message: string): never {
  throw new Refusal(reason, message);
}

/** The run must be this Event's and answer this Member, who may still change it (section 4.3). */
export async function gate(
  ctx: MutationCtx,
  ref: {
    runId: Id<"runs">;
    eventId: Id<"events">;
    forMembershipId: Id<"memberships">;
  },
) {
  const run = await ctx.db.get("runs", ref.runId);
  if (
    run === null ||
    run.eventId !== ref.eventId ||
    run.requestedBy !== ref.forMembershipId
  )
    throw new AccessDenied("wrongEvent", "canvas.edit");
  if (run.status !== "running")
    throw new ConvexError({
      kind: "RunStopped",
      message:
        "This reply was stopped. Read and change nothing more; end your reply in one short line.",
    });
  const { membership } = await requireAccessFor(
    ctx,
    ref.forMembershipId,
    ref.eventId,
    "chat.post",
  );
  await requireAccessFor(ctx, ref.forMembershipId, ref.eventId, "canvas.edit");
  const event = (await ctx.db.get("events", ref.eventId))!;
  return { run, membership, event };
}

/** The words of the message this run answers, for the member-stated amount check. */
async function requestText(
  ctx: MutationCtx,
  run: Doc<"runs">,
): Promise<string> {
  if (run.source === "comment" && run.commentId !== null)
    return (await ctx.db.get("comments", run.commentId))?.body ?? "";
  if (run.messageId === null) return "";
  const [doc] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [run.messageId],
  });
  return doc?.text ?? "";
}

async function versioned<T extends "entries" | "items">(
  ctx: MutationCtx,
  table: T,
  id: string,
  eventId: Id<"events">,
  expectedVersion: number,
): Promise<Doc<T>> {
  const what = table === "entries" ? "Entry" : "Item";
  const normalized = ctx.db.normalizeId(table, id);
  const doc = normalized === null ? null : await ctx.db.get(table, normalized);
  if (doc === null)
    refuse("notFound", `No such ${what}. Use IDs from readCanvas.`);
  const fields = doc as unknown as {
    eventId: Id<"events">;
    deletedAt: number | null;
    version: number;
  };
  if (fields.eventId !== eventId)
    throw new AccessDenied("wrongEvent", "canvas.edit");
  if (fields.deletedAt !== null) refuse("deleted", `That ${what} was deleted.`);
  if (fields.version !== expectedVersion)
    refuse(
      "stale",
      `That ${what} changed since you read it. Call readCanvas and propose from its current values.`,
    );
  return doc as Doc<T>;
}

function trimmed(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Turns the tool's changes into `ProposedChange`s: each against the version
 * the model read, with its guards, and every amount resolved here: the asking
 * Member's own words (checked), a line's Estimate low end, or the rupees other
 * changes in this Proposal free up.
 */
export async function resolveChanges(
  ctx: MutationCtx,
  g: Awaited<ReturnType<typeof gate>>,
  specs: readonly ChangeSpec[],
): Promise<ProposedChange[]> {
  const eventId = g.event._id;
  const text = await requestText(ctx, g.run);
  /** `lineNames`: the line the amount goes on, so "caterer quoted 2.4L, add a DJ too" can't price the DJ. */
  const stated = async (
    amount: number,
    what: string,
    lineNames: readonly string[] = [],
    except: Id<"entries"> | null = null,
  ) => {
    const others =
      lineNames.length === 0
        ? []
        : await otherBudgetLines(ctx, eventId, except);
    if (!checkMemberStatedAmount(amount, text, lineNames, others))
      refuse(
        "amountNotStated",
        `${g.membership.displayName} didn't write ${formatINR(amount)} in their message, so it can't be ${what}. Use another amount source, or ask them.`,
      );
    return amount;
  };

  const out: (ProposedChange | null)[] = specs.map(() => null);
  /** Rupees each change frees from the Budget (a lower line or a deleted one). */
  const freed: (number | null)[] = specs.map(() => null);
  const pendingFreed: number[] = [];

  for (const [i, spec] of specs.entries()) {
    switch (spec.op) {
      case "updateEntry": {
        const entry = await versioned(
          ctx,
          "entries",
          spec.entryId,
          eventId,
          spec.expectedVersion,
        );
        if (entry.kind !== spec.patch.kind)
          refuse("wrongKind", `That is a ${entry.kind} Entry.`);
        const fields: Record<string, unknown> = {};
        const patch = spec.patch;
        if (patch.kind === "budget" && entry.kind === "budget") {
          // Only what actually changes, so the card never shows "100 → 100".
          if (patch.label !== undefined) {
            const label = cleanLabel(patch.label, "line");
            if (label !== entry.fields.label) fields.label = label;
          }
          if (
            patch.quantity !== undefined &&
            patch.quantity !== entry.fields.quantity
          )
            fields.quantity = patch.quantity;
          const amount = patch.amount;
          if (
            amount === undefined &&
            Object.keys(fields).length === 0 &&
            (spec.functionKey === undefined ||
              spec.functionKey === entry.functionKey)
          )
            refuse(
              "noChange",
              `That change leaves ${entry.fields.label} as it is.`,
            );
          const before = entryAmount(entry.fields);
          if (amount && "memberStated" in amount) {
            fields.plannedAmount = await stated(
              amount.memberStated,
              "this line's amount",
              [entry.fields.label, ...(patch.label ? [patch.label] : [])],
              entry._id,
            );
          } else if (amount && "estimateLow" in amount) {
            const estimate = entry.fields.estimate;
            if (estimate === null)
              refuse(
                "noEstimate",
                `${entry.fields.label} has no Estimate to cut to.`,
              );
            if ("quantity" in fields)
              refuse(
                "cutWithQuantity",
                `Change ${entry.fields.label}'s quantity on its own first; its Estimate moves with it, and a later Proposal can cut it to the new low end.`,
              );
            if (estimate.low >= before)
              refuse(
                "notACut",
                `${entry.fields.label} is already at or below its Estimate's low end (${formatINR(estimate.low)}).`,
              );
            // The line goes back to its Estimate, at the low end: never the
            // Estimate's figure written in as a Member's own amount.
            fields.plannedAmount = null;
            fields.estimate = { ...estimate, amount: estimate.low };
          } else if (amount && "receiveFreedFrom" in amount) {
            // Freed rupees land as a fixed amount; with a new quantity the
            // Estimate would rescale under it, out of step with the line.
            if ("quantity" in fields && entry.fields.estimate !== null)
              refuse(
                "freedWithQuantity",
                `Change ${entry.fields.label}'s quantity on its own first; its Estimate moves with it, and a later Proposal can move freed rupees into it.`,
              );
            pendingFreed.push(i);
          }
          // What the line frees is what Accept will write, through the same
          // helper the card uses (a lower quantity frees rupees too).
          if (!(amount && "receiveFreedFrom" in amount)) {
            const after = entryAmount(nextBudgetFields(entry.fields, fields));
            if (after !== before) freed[i] = before - after;
          }
        } else if (patch.kind === "timeline") {
          for (const key of [
            "title",
            "date",
            "time",
            "note",
            "done",
          ] as const) {
            if (patch[key] !== undefined) fields[key] = patch[key];
          }
          // The direct tools' checks (S7), so a Proposal can't store what
          // updateEntry would refuse.
          if (typeof fields.title === "string")
            fields.title = cleanLabel(fields.title, "Timeline Entry");
          if (patch.date !== undefined) fields.date = cleanDate(patch.date);
          if (patch.time !== undefined) fields.time = cleanTime(patch.time);
          if (patch.note !== undefined)
            fields.note = cleanOptionalNote(patch.note);
        } else if (patch.kind === "checklist") {
          if (patch.label !== undefined)
            fields.freeLabel = cleanLabel(patch.label, "Vendor");
          if (patch.functionKeys !== undefined)
            fields.functionKeys = [...new Set(patch.functionKeys)];
        }
        const values: Record<string, Value> = { fields: fields as Value };
        if (spec.functionKey !== undefined)
          values.functionKey = spec.functionKey;
        out[i] = {
          op: "updateEntry",
          table: "entries",
          docId: entry._id,
          expectedVersion: entry.version,
          guards: [],
          values: { patch: values },
        };
        break;
      }
      case "deleteEntry": {
        const entry = await versioned(
          ctx,
          "entries",
          spec.entryId,
          eventId,
          spec.expectedVersion,
        );
        if (entry.kind === "budget") freed[i] = entryAmount(entry.fields);
        out[i] = {
          op: "deleteEntry",
          table: "entries",
          docId: entry._id,
          expectedVersion: entry.version,
          guards: [],
          values: {},
        };
        break;
      }
      case "addEntry": {
        const entry = spec.entry;
        const item = await planItemOf(ctx, eventId, entry.kind);
        if (item === null)
          refuse("noItem", `This Event has no ${entry.kind} Item yet.`);
        let fields: EntryFields;
        if (entry.kind === "budget") {
          const memberStated =
            entry.memberStated === null
              ? null
              : await stated(entry.memberStated, "this line's amount", [
                  entry.label,
                ]);
          fields = {
            label: cleanLabel(entry.label, "line"),
            category:
              entry.category !== null && isTableCategory(entry.category)
                ? entry.category
                : null,
            quantity: entry.quantity,
            unit: entry.unit,
            estimate: entry.estimate,
            plannedAmount: memberStated,
            role: "line",
            belowUsualRange: false,
            editedByMember: memberStated !== null,
          };
        } else if (entry.kind === "timeline") {
          fields = {
            title: cleanLabel(entry.title, "Timeline Entry"),
            date: cleanDate(entry.date),
            time: cleanTime(entry.time),
            leadKey: null,
            priority: null,
            late: false,
            note: cleanOptionalNote(entry.note),
            vendorCategory: null,
            done: false,
          };
        } else {
          fields = {
            vendorCategory: null,
            freeLabel: cleanLabel(entry.label, "Vendor"),
            functionKeys: [...new Set(entry.functionKeys)],
            bookByEntryId: null,
            budgetEntryIds: [],
          };
        }
        out[i] = {
          op: "addEntry",
          table: "entries",
          docId: null,
          expectedVersion: null,
          guards: [{ table: "items", docId: item._id, version: item.version }],
          values: {
            itemId: item._id,
            kind: entry.kind,
            functionKey: entry.functionKey,
            fields,
          },
        };
        break;
      }
      case "addItem": {
        let sectionId: Id<"sections">;
        if (spec.sectionId === null) {
          const size = spec.item.kind === "note" ? NOTE_SIZE : SUGGESTION_SIZE;
          ({ sectionId } = await placeNewItem(ctx, {
            eventId,
            kind: spec.item.kind,
            size,
          }));
        } else {
          const section = await liveDoc(ctx, "sections", spec.sectionId);
          if (section === null)
            refuse("notFound", "No such Section. Use IDs from readCanvas.");
          if (section.eventId !== eventId)
            throw new AccessDenied("wrongEvent", "canvas.edit");
          sectionId = section._id;
        }
        const section = (await ctx.db.get("sections", sectionId))!;
        const common = { sectionId, functionKey: spec.functionKey };
        const values =
          spec.item.kind === "note"
            ? {
                ...common,
                kind: "note" as const,
                data: { text: spec.item.text.trim(), citations: [] },
              }
            : {
                ...common,
                kind: "suggestion" as const,
                data: {
                  title: cleanLabel(spec.item.title, "Suggestion"),
                  body: spec.item.body.trim(),
                  costCategory: spec.item.costCategory,
                  quantity: spec.item.quantity,
                  estimate: spec.item.estimate,
                  status: "open" as const,
                },
              };
        out[i] = {
          op: "addItem",
          table: "items",
          docId: null,
          expectedVersion: null,
          guards: [
            { table: "sections", docId: section._id, version: section.version },
          ],
          values,
        };
        break;
      }
      case "updateItem": {
        const item = await versioned(
          ctx,
          "items",
          spec.itemId,
          eventId,
          spec.expectedVersion,
        );
        const patch = spec.patch;
        let data: Record<string, unknown>;
        if (patch.kind === "note") data = { text: patch.text.trim() };
        else if (patch.kind === "suggestion") {
          data = {};
          if (patch.title !== undefined) data.title = trimmed(patch.title);
          if (patch.body !== undefined) data.body = patch.body.trim();
        } else
          data = {
            note:
              patch.note === null || patch.note.trim() === ""
                ? null
                : patch.note.trim(),
          };
        const wanted =
          patch.kind === "planNote"
            ? PLAN_KINDS.includes(item.kind)
            : item.kind === patch.kind;
        if (!wanted) refuse("wrongKind", `That Item is a ${item.kind}.`);
        out[i] = {
          op: "updateItem",
          table: "items",
          docId: item._id,
          expectedVersion: item.version,
          guards: [],
          values: { patch: { data: data as Value } },
        };
        break;
      }
      case "moveItem": {
        const item = await versioned(
          ctx,
          "items",
          spec.itemId,
          eventId,
          spec.expectedVersion,
        );
        const section = await liveDoc(ctx, "sections", spec.sectionId);
        if (section === null)
          refuse("notFound", "No such Section. Use IDs from readCanvas.");
        if (section.eventId !== eventId)
          throw new AccessDenied("wrongEvent", "canvas.edit");
        out[i] = {
          op: "moveItem",
          table: "items",
          docId: item._id,
          expectedVersion: item.version,
          guards: [
            { table: "sections", docId: section._id, version: section.version },
          ],
          values: { sectionId: section._id, position: null },
        };
        break;
      }
      case "deleteItem": {
        const item = await versioned(
          ctx,
          "items",
          spec.itemId,
          eventId,
          spec.expectedVersion,
        );
        out[i] = {
          op: "deleteItem",
          table: "items",
          docId: item._id,
          expectedVersion: item.version,
          guards: [],
          values: {},
        };
        break;
      }
      case "createSection":
        out[i] = {
          op: "createSection",
          table: "sections",
          docId: null,
          expectedVersion: null,
          guards: [],
          values: { name: spec.name },
        };
        break;
      case "addComment": {
        const item = await liveDoc(ctx, "items", spec.target.itemId);
        if (item === null)
          refuse("notFound", "No such Item. Use IDs from readCanvas.");
        if (item.eventId !== eventId)
          throw new AccessDenied("wrongEvent", "comment.add");
        out[i] = {
          op: "addComment",
          table: "comments",
          docId: null,
          expectedVersion: null,
          guards: [{ table: "items", docId: item._id, version: item.version }],
          values: { target: spec.target, body: spec.body },
        };
        break;
      }
      case "setBudgetTotal": {
        if (g.event.version !== spec.expectedVersion)
          refuse(
            "stale",
            "The Event changed since you read it. Call readCanvas and propose again.",
          );
        out[i] = {
          op: "setBudgetTotal",
          table: "events",
          docId: eventId,
          expectedVersion: g.event.version,
          guards: [],
          values: {
            budgetTotal: await stated(spec.memberStated, "the Budget total"),
          },
        };
        break;
      }
      case "updateTheme": {
        if (g.event.version !== spec.expectedVersion)
          refuse(
            "stale",
            "The Event changed since you read it. Call readCanvas and propose again.",
          );
        out[i] = {
          op: "updateTheme",
          table: "events",
          docId: eventId,
          expectedVersion: g.event.version,
          guards: [],
          values: spec.theme,
        };
        break;
      }
    }
  }

  // Code, not the model, works out the rupees that move (section 3, item 1).
  // Each change's freed rupees go to one line at most, so a Proposal only
  // moves money; it never makes more.
  const claimed = new Set<number>();
  for (const i of pendingFreed) {
    const spec = specs[i] as Extract<ChangeSpec, { op: "updateEntry" }>;
    const from = (spec.patch as { amount: { receiveFreedFrom: number[] } })
      .amount.receiveFreedFrom;
    let total = 0;
    for (const j of new Set(from)) {
      if (claimed.has(j))
        refuse(
          "badFreed",
          `Change ${j}'s freed rupees already go to another line. Each change's freed rupees can go to one line only.`,
        );
      claimed.add(j);
      const amount = freed[j];
      if (j === i || amount === null || amount === undefined || amount <= 0)
        refuse(
          "badFreed",
          `Change ${j} doesn't free any rupees: name changes that lower or delete a budget line.`,
        );
      total += amount;
    }
    const change = out[i] as Extract<ProposedChange, { op: "updateEntry" }>;
    const entry = (await ctx.db.get("entries", change.docId))!;
    const fields = change.values.patch.fields as Record<string, unknown>;
    fields.plannedAmount =
      entryAmount((entry as Doc<"entries"> & { kind: "budget" }).fields) +
      total;
  }
  return out as ProposedChange[];
}

// ---------------------------------------------------------------------------
// The tool

const id = z.string().min(1);
const functionKey = z
  .string()
  .nullable()
  .describe("A Function key from readCanvas, or null for Event-wide.");
const version = z.number().int().positive();
const costLine = z
  .strictObject({
    category: z.string().optional(),
    freeLabel: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.string(),
  })
  .refine(
    (line) => (line.category === undefined) !== (line.freeLabel === undefined),
    { message: "Give exactly one of category or freeLabel." },
  );
const memberStated = z
  .number()
  .int()
  .positive()
  .describe("Only an amount the asking Member wrote in their message.");

const budgetAmount = z.union([
  z.strictObject({ memberStated }),
  z.strictObject({
    estimateLow: z
      .literal(true)
      .describe("Cut the line to the low end of its Estimate."),
  }),
  z.strictObject({
    receiveFreedFrom: z
      .array(z.number().int().min(0))
      .min(1)
      .describe(
        "Indexes of other changes in this Proposal that lower or delete budget lines; this line grows by the rupees they free (for example the Contingency).",
      ),
  }),
]);

const changeInput = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("updateEntry"),
    entryId: id,
    expectedVersion: version,
    functionKey: functionKey.optional(),
    patch: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("budget"),
        label: z.string().optional(),
        quantity: z.number().positive().optional(),
        amount: budgetAmount.optional(),
      }),
      z.strictObject({
        kind: z.literal("timeline"),
        title: z.string().optional(),
        date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        done: z.boolean().optional(),
      }),
      z.strictObject({
        kind: z.literal("checklist"),
        label: z.string().optional(),
        functionKeys: z.array(z.string()).optional(),
      }),
    ]),
  }),
  z.strictObject({
    op: z.literal("deleteEntry"),
    entryId: id,
    expectedVersion: version,
  }),
  z.strictObject({
    op: z.literal("addEntry"),
    entry: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("budget"),
        label: z.string(),
        functionKey,
        amountSource: z.union([
          z.strictObject({ estimate: costLine }),
          z.strictObject({ memberStated }),
        ]),
      }),
      z.strictObject({
        kind: z.literal("timeline"),
        title: z.string(),
        functionKey,
        date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
      z.strictObject({
        kind: z.literal("checklist"),
        label: z.string(),
        functionKey,
        functionKeys: z.array(z.string()).default([]),
      }),
    ]),
  }),
  z.strictObject({
    op: z.literal("addItem"),
    sectionId: id.nullable().optional(),
    functionKey: functionKey.optional(),
    item: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("note"), text: z.string() }),
      z.strictObject({
        kind: z.literal("suggestion"),
        title: z.string(),
        body: z.string(),
        cost: costLine.optional(),
      }),
    ]),
  }),
  z.strictObject({
    op: z.literal("updateItem"),
    itemId: id,
    expectedVersion: version,
    patch: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("note"), text: z.string() }),
      z.strictObject({
        kind: z.literal("suggestion"),
        title: z.string().optional(),
        body: z.string().optional(),
      }),
      z.strictObject({
        kind: z.literal("planNote"),
        note: z.string().nullable(),
      }),
    ]),
  }),
  z.strictObject({
    op: z.literal("moveItem"),
    itemId: id,
    expectedVersion: version,
    sectionId: id,
  }),
  z.strictObject({
    op: z.literal("deleteItem"),
    itemId: id,
    expectedVersion: version,
  }),
  z.strictObject({ op: z.literal("createSection"), name: z.string() }),
  z.strictObject({
    op: z.literal("addComment"),
    target: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("item"), itemId: id }),
      z.strictObject({ kind: z.literal("entry"), itemId: id, entryId: id }),
    ]),
    body: z.string(),
  }),
  z.strictObject({
    op: z.literal("setBudgetTotal"),
    expectedVersion: version.describe("The Event's version from readCanvas."),
    memberStated,
  }),
  z.strictObject({
    op: z.literal("updateTheme"),
    expectedVersion: version.describe("The Event's version from readCanvas."),
    addPalette: z.array(z.string()).default([]),
    removePalette: z.array(z.string()).default([]),
    addStyleWords: z.array(z.string()).default([]),
    addDecorKeywords: z.array(z.string()).default([]),
  }),
]);

const proposeInput = z.strictObject({
  summary: z
    .string()
    .describe(
      'One short line in English for the card, such as "Cut Decor to ₹2,20,000, drop the Drone shoot".',
    ),
  replaces: id
    .optional()
    .describe(
      "The open Proposal this one revises (from readCanvas), when a Member asked to change it.",
    ),
  changes: z.array(changeInput).min(1).max(MAX_PROPOSAL_CHANGES),
});
type ProposeInput = z.infer<typeof proposeInput>;
type ChangeInput = z.infer<typeof changeInput>;

export type ProposeToolOptions = {
  /** For tests and the scripted cases: the estimate cascade's research and knowledge calls. */
  estimateDeps?: Partial<EstimateDeps>;
};

/** Typed loosely, like the core tools, so `api.d.ts` stays shallow. */
export type ProposeTools = {
  propose: Tool<Record<string, never>, ToolResult>;
};

type PricingContext = {
  stored: ToolResult | null;
  city: string | null;
  tier: CityTier;
  eventType: EventType;
};

async function priced(
  ctx: AssistantToolCtx,
  context: PricingContext,
  line: {
    category?: string | undefined;
    freeLabel?: string | undefined;
    quantity: number;
    unit: string;
  },
  deps: Partial<EstimateDeps> | undefined,
): Promise<PricedEstimate | null> {
  if (context.city === null) return null;
  const [range] = await estimateLines(
    ctx,
    {
      eventId: ctx.eventId,
      city: context.city,
      tier: context.tier,
      eventType: context.eventType,
      lines: [
        {
          category: line.category ?? line.freeLabel ?? "",
          quantity: line.quantity,
          unit: line.unit,
        },
      ],
    },
    deps,
  );
  return range ? priceLine(range, line.quantity) : null;
}

function guardedError(error: unknown): ToolResult {
  const data =
    error instanceof ConvexError
      ? (error.data as Record<string, unknown>)
      : null;
  if (data && data.kind === "AccessDenied")
    return {
      ok: false,
      reason: "accessDenied",
      error: "AccessDenied",
      message:
        data.reason === "wrongEvent"
          ? "That isn't in this Event. Use IDs from readCanvas."
          : "The Member you are answering can no longer change this Event (removed, left, or now a Viewer). Read and change nothing more for them; end your reply in one short line.",
    };
  if (data && typeof data.kind === "string")
    return {
      ok: false,
      reason: data.kind,
      error: data.kind,
      message:
        typeof data.message === "string"
          ? data.message
          : `Refused (${data.kind}).`,
    };
  console.error("propose failed", error);
  return {
    ok: false,
    reason: "failed",
    message: "That didn't work. Tell the Member briefly and don't retry it.",
  };
}

/** The `propose` tool, with the estimate cascade's dependencies injectable for tests. */
export function buildProposeTools(
  options: ProposeToolOptions = {},
): ProposeTools {
  const deps = options.estimateDeps;
  const propose = createTool<ProposeInput, ToolResult, AssistantToolCtx>({
    description:
      "Post a Proposal: a bundle of changes the Members must Accept before anything happens. Each change names the version you read. A budget amount is memberStated (the asking Member's words), estimateLow (lowers the line to its Estimate's low end, never raises it; not in the same change as a new quantity) or receiveFreedFrom (indexes of changes in this Proposal that lower or delete lines; each change's freed rupees go to one line only; not in the same change as a new quantity on an Estimate line); never your own number.",
    inputSchema: proposeInput,
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> => {
      try {
        const ref = {
          runId: ctx.runId,
          eventId: ctx.eventId,
          forMembershipId: ctx.forMembershipId,
          toolCallId,
        };
        let context: PricingContext | null = null;
        const pricing = async () => {
          context ??= (await ctx.runQuery(
            internal.assistant.tools.core.pricingContext,
            ref,
          )) as PricingContext;
          return context;
        };
        const changes: ChangeSpec[] = [];
        for (const change of input.changes) {
          const spec = await toSpec(change, async (line) => {
            const c = await pricing();
            return await priced(ctx, c, line, deps);
          });
          changes.push(spec);
        }
        if (context && (context as PricingContext).stored)
          return (context as PricingContext).stored!;
        return (await ctx.runMutation(internal.proposals.proposeForRun, {
          ...ref,
          summary: input.summary,
          replaces: (input.replaces as Id<"proposals"> | undefined) ?? null,
          changes,
        })) as ToolResult;
      } catch (error) {
        return guardedError(error);
      }
    },
  });
  return { propose } as unknown as ProposeTools;
}

/** One model change as the mutation's spec, pricing a new line or Suggestion through the cascade. */
async function toSpec(
  change: ChangeInput,
  price: (line: z.infer<typeof costLine>) => Promise<PricedEstimate | null>,
): Promise<ChangeSpec> {
  switch (change.op) {
    case "updateEntry": {
      const patch = Object.fromEntries(
        Object.entries(change.patch).filter(([, value]) => value !== undefined),
      ) as Extract<ChangeSpec, { op: "updateEntry" }>["patch"];
      return {
        op: "updateEntry",
        entryId: change.entryId,
        expectedVersion: change.expectedVersion,
        ...(change.functionKey !== undefined
          ? { functionKey: change.functionKey }
          : {}),
        patch,
      };
    }
    case "addEntry": {
      const entry = change.entry;
      if (entry.kind === "budget") {
        if ("estimate" in entry.amountSource) {
          const line = entry.amountSource.estimate;
          return {
            op: "addEntry",
            entry: {
              kind: "budget",
              label: entry.label,
              functionKey: entry.functionKey,
              category: line.category ?? null,
              quantity: line.quantity,
              unit: line.unit,
              estimate: await price(line),
              memberStated: null,
            },
          };
        }
        return {
          op: "addEntry",
          entry: {
            kind: "budget",
            label: entry.label,
            functionKey: entry.functionKey,
            category: null,
            quantity: 1,
            unit: "per_event",
            estimate: null,
            memberStated: entry.amountSource.memberStated,
          },
        };
      }
      if (entry.kind === "timeline")
        return {
          op: "addEntry",
          entry: {
            kind: "timeline",
            title: entry.title,
            functionKey: entry.functionKey,
            date: entry.date ?? null,
            time: entry.time ?? null,
            note: entry.note ?? null,
          },
        };
      return {
        op: "addEntry",
        entry: {
          kind: "checklist",
          label: entry.label,
          functionKey: entry.functionKey,
          functionKeys: entry.functionKeys,
        },
      };
    }
    case "addItem": {
      const common = {
        op: "addItem" as const,
        sectionId: change.sectionId ?? null,
        functionKey: change.functionKey ?? null,
      };
      if (change.item.kind === "note")
        return { ...common, item: { kind: "note", text: change.item.text } };
      const cost = change.item.cost;
      return {
        ...common,
        item: {
          kind: "suggestion",
          title: change.item.title,
          body: change.item.body,
          costCategory: cost?.category ?? cost?.freeLabel ?? null,
          quantity: cost?.quantity ?? null,
          estimate: cost ? await price(cost) : null,
        },
      };
    }
    case "updateItem": {
      const patch = Object.fromEntries(
        Object.entries(change.patch).filter(([, value]) => value !== undefined),
      ) as Extract<ChangeSpec, { op: "updateItem" }>["patch"];
      return {
        op: "updateItem",
        itemId: change.itemId,
        expectedVersion: change.expectedVersion,
        patch,
      };
    }
    case "addComment":
      return {
        op: "addComment",
        body: change.body,
        target:
          change.target.kind === "item"
            ? { kind: "item", itemId: change.target.itemId as Id<"items"> }
            : {
                kind: "entry",
                itemId: change.target.itemId as Id<"items">,
                entryId: change.target.entryId as Id<"entries">,
              },
      };
    case "updateTheme":
      return {
        op: "updateTheme",
        expectedVersion: change.expectedVersion,
        theme: {
          addPalette: change.addPalette,
          removePalette: change.removePalette,
          addStyleWords: change.addStyleWords,
          addDecorKeywords: change.addDecorKeywords,
          fromInspiration: null,
        },
      };
    default:
      return change as ChangeSpec;
  }
}

export const proposeTools: ProposeTools = buildProposeTools();
