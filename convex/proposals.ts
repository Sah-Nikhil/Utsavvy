import { saveMessage } from "@convex-dev/agent";
import { ConvexError, v, type Infer } from "convex/values";
import { entryAmount } from "../components/items/budget/rollup";
import { can } from "../lib/access/permissions";
import { formatINR } from "../lib/format";
import type { AssistantActor } from "../lib/types/actors";
import type { EntryFields } from "../lib/types/canvas";
import type { HistoryTable } from "../lib/types/history";
import {
  proposalOriginValidator,
  type Guard,
  type ProposedChange,
} from "../lib/types/proposals";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess, requireAccessFor } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { handlerFor } from "./lib/proposalOps";
import { PROPOSAL_EXPIRY_MS } from "./lib/settings";
import type { ToolResult } from "./assistant/tools/core";
import {
  callRef,
  changeSpecValidator,
  gate,
  MAX_PROPOSAL_CHANGES,
  proposalRefused,
  Refusal,
  refuse,
  resolveChanges,
} from "./assistant/tools/propose";
import { once } from "./lib/idempotency";
import { checkQueueRoom, enqueueRun } from "./runs";

export { MAX_PROPOSAL_CHANGES, proposalRefused };

/*
 * S10: Proposals (IMPLEMENTATION_PLAN.md sections 5.4 and 6,
 * assistant-behavior.md rules 10 to 13, 16 and 19, ADR 0009).
 *
 * A Proposal is a bundle of changes the Assistant prepared but didn't make.
 * Any Member can Accept it (all of it, in one mutation) or Reject it; Viewers
 * see it live without buttons. It closes when accepted, rejected or replaced
 * by a newer Proposal, when anything it touches changes (out of date), or 24
 * hours after it was posted.
 *
 * - `createProposal` stores one and posts its card in the Chat through
 *   `internal.chat.postSystem` (also used by S12's pasted Quotes, S14's
 *   Brief edits and S17's Comment threads).
 * - `applyProposal` re-checks every `expectedVersion` and guard, asks each
 *   op handler (`convex/lib/proposalOps.ts`) to validate, and only then
 *   applies them all through `assistantWrite` and friends with the Proposal
 *   as the history group. A refusal writes nothing.
 */

type Ctx = QueryCtx | MutationCtx;
type Origin = Infer<typeof proposalOriginValidator>;
type Status = Doc<"proposals">["status"];

const MAX_SUMMARY = 300;

// ---------------------------------------------------------------------------
// Reading the documents a change touches

function tableOf(change: ProposedChange): HistoryTable | null {
  return change.table === "comments" ? null : change.table;
}

async function loadDoc(
  ctx: Ctx,
  table: HistoryTable,
  id: string,
): Promise<Record<string, unknown> | null> {
  const normalized = ctx.db.normalizeId(table, id);
  if (normalized === null) return null;
  return (await ctx.db.get(table, normalized)) as Record<
    string,
    unknown
  > | null;
}

function eventIdOf(table: HistoryTable, doc: Record<string, unknown>) {
  return table === "events" ? doc._id : doc.eventId;
}

/** Every document and guard a change names must be in this Event. */
async function checkInEvent(
  ctx: Ctx,
  eventId: Id<"events">,
  change: ProposedChange,
): Promise<void> {
  const table = tableOf(change);
  if (table !== null && change.docId !== null) {
    const doc = await loadDoc(ctx, table, change.docId);
    if (doc === null) proposalRefused("That isn't on the Canvas any more.");
    if (eventIdOf(table, doc) !== eventId)
      throw new AccessDenied("wrongEvent", "canvas.edit");
  }
  for (const guard of change.guards) {
    const doc = await loadDoc(ctx, guard.table, guard.docId);
    if (doc === null) proposalRefused("That isn't on the Canvas any more.");
    if (eventIdOf(guard.table, doc) !== eventId)
      throw new AccessDenied("wrongEvent", "canvas.edit");
  }
}

/** The documents a Proposal depends on, each with the version it was made against. */
function dependencies(
  proposal: Pick<Doc<"proposals">, "changes">,
): (Guard & { kind: "change" | "guard" })[] {
  const deps: (Guard & { kind: "change" | "guard" })[] = [];
  for (const change of proposal.changes) {
    const table = tableOf(change);
    if (table !== null && change.docId !== null && change.expectedVersion !== null) {
      deps.push({
        kind: "change",
        table,
        docId: change.docId,
        version: change.expectedVersion,
      });
    }
    for (const guard of change.guards) deps.push({ kind: "guard", ...guard });
  }
  return deps;
}

/** The documents that moved on since the Proposal was made: changed, deleted or gone. */
async function staleDependencies(
  ctx: Ctx,
  proposal: Pick<Doc<"proposals">, "changes">,
): Promise<string[]> {
  const stale: string[] = [];
  for (const dep of dependencies(proposal)) {
    const doc = await loadDoc(ctx, dep.table, dep.docId);
    const version = (doc as { version?: number } | null)?.version;
    const deleted =
      dep.kind === "change" &&
      (doc as { deletedAt?: number | null } | null)?.deletedAt != null;
    if (doc === null || version !== dep.version || deleted) stale.push(dep.docId);
  }
  return stale;
}

async function memberDisplayName(
  ctx: Ctx,
  id: Id<"memberships"> | null,
): Promise<string> {
  if (id === null) return "Someone";
  return (await ctx.db.get("memberships", id))?.displayName ?? "Someone";
}

/** "Meera" (or "Utsavvy"): who changed one of these documents most recently since `since`. */
async function changedBy(
  ctx: Ctx,
  docIds: readonly string[],
  since: number,
): Promise<string> {
  let latest: Doc<"changes"> | null = null;
  for (const docId of docIds) {
    const [row] = await ctx.db
      .query("changes")
      .withIndex("by_doc", (q) => q.eq("docId", docId as Id<"entries">))
      .order("desc")
      .take(1);
    if (row && row.at >= since && (latest === null || row.at > latest.at))
      latest = row;
  }
  if (latest === null) return "Someone";
  if (latest.actor.kind === "assistant") return "Utsavvy";
  return await memberDisplayName(ctx, latest.actor.membershipId);
}

// ---------------------------------------------------------------------------
// Creating a Proposal

export type NewProposal = {
  eventId: Id<"events">;
  /** null for a Proposal from a Brief edit. */
  runId: Id<"runs"> | null;
  /** The Member it is for ("Utsavvy for Rohan"). */
  requestedBy: Id<"memberships">;
  origin: Origin;
  summary: string;
  changes: ProposedChange[];
  /** An open Proposal this one revises ("keep the drone shoot"). */
  replaces?: Id<"proposals"> | null;
};

/**
 * Stores a Proposal, closes the open ones it replaces, schedules its expiry
 * and posts its card in the Chat. Refuses (`ProposalRefused`) a change whose
 * document moved on since it was read, a document named twice, or a change
 * its op handler refuses; refuses (`AccessDenied`) anything outside the
 * Event. A newer Proposal replaces `replaces` and every open one that touches
 * the same documents.
 */
export async function createProposal(
  ctx: MutationCtx,
  args: NewProposal,
): Promise<Id<"proposals">> {
  await requireAccessFor(ctx, args.requestedBy, args.eventId, "chat.post");
  const summary = args.summary.trim().replace(/\s+/g, " ");
  if (summary === "") proposalRefused("Give the Proposal a short summary.");
  if (summary.length > MAX_SUMMARY)
    proposalRefused(`Keep the summary under ${MAX_SUMMARY} characters.`);
  if (args.changes.length === 0)
    proposalRefused("A Proposal needs at least one change.");
  if (args.changes.length > MAX_PROPOSAL_CHANGES)
    proposalRefused(
      `A Proposal holds at most ${MAX_PROPOSAL_CHANGES} changes. Split it.`,
    );

  const touched = new Set<string>();
  for (const change of args.changes) {
    await checkInEvent(ctx, args.eventId, change);
    if (change.docId !== null) {
      if (touched.has(change.docId))
        proposalRefused(
          "Each Item or Entry can appear only once in a Proposal. Combine the changes to it.",
        );
      touched.add(change.docId);
    }
  }
  const stale = await staleDependencies(ctx, { changes: args.changes });
  if (stale.length > 0)
    proposalRefused(
      "Something in this Proposal changed since you read it. Call readCanvas and propose again from the current values.",
    );
  for (const change of args.changes) {
    const refusal = await handlerFor(change.op).validate(ctx, change as never);
    if (refusal !== null) proposalRefused(refusal);
  }

  const now = Date.now();
  const proposalId = await ctx.db.insert("proposals", {
    eventId: args.eventId,
    runId: args.runId,
    requestedBy: args.requestedBy,
    origin: args.origin,
    summary,
    changes: args.changes,
    status: "open",
    decidedBy: null,
    decidedAt: null,
    replacedBy: null,
    expiresAt: now + PROPOSAL_EXPIRY_MS,
    createdAt: now,
  });

  // Rule 12: a revised Proposal replaces the one it revises.
  for await (const open of ctx.db
    .query("proposals")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", args.eventId).eq("status", "open"),
    )) {
    if (open._id === proposalId) continue;
    const overlaps = open.changes.some(
      (c) => c.docId !== null && touched.has(c.docId),
    );
    if (open._id !== args.replaces && !overlaps) continue;
    await ctx.db.patch("proposals", open._id, {
      status: "replaced",
      replacedBy: proposalId,
      decidedAt: now,
    });
  }

  await ctx.scheduler.runAt(now + PROPOSAL_EXPIRY_MS, internal.proposals.expire, {
    proposalId,
  });

  const run = args.runId === null ? null : await ctx.db.get("runs", args.runId);
  // A Comment thread shows its own card (S17); the Chat gets the card otherwise.
  if (args.origin.kind !== "comment") {
    await ctx.runMutation(internal.chat.postSystem, {
      eventId: args.eventId,
      card: { kind: "proposal", id: proposalId },
      text: `Proposal: ${summary}`,
      ...(run?.messageId ? { promptMessageId: run.messageId } : {}),
    });
  }
  return proposalId;
}

/** The `propose` tool's one mutation (`convex/assistant/tools/propose.ts`): checks, resolves and posts the Proposal. */
export const proposeForRun = internalMutation({
  args: {
    ...callRef,
    summary: v.string(),
    replaces: v.union(v.id("proposals"), v.null()),
    changes: v.array(changeSpecValidator),
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args);
    return await once(ctx, `${args.runId}:${args.toolCallId}`, async (): Promise<ToolResult> => {
      try {
        if (args.changes.length > MAX_PROPOSAL_CHANGES)
          refuse("tooMany", `A Proposal holds at most ${MAX_PROPOSAL_CHANGES} changes.`);
        if (args.replaces !== null) {
          const old = await ctx.db.get("proposals", args.replaces);
          if (old === null || old.eventId !== args.eventId)
            throw new AccessDenied("wrongEvent", "canvas.edit");
        }
        const changes = await resolveChanges(ctx, g, args.changes);
        const proposalId = await createProposal(ctx, {
          eventId: args.eventId,
          runId: args.runId,
          requestedBy: g.membership._id,
          origin:
            g.run.source === "comment" && g.run.commentId !== null
              ? { kind: "comment", commentId: g.run.commentId }
              : { kind: "chat" },
          summary: args.summary,
          changes,
          replaces: args.replaces,
        });
        const proposal = (await ctx.db.get("proposals", proposalId))!;
        return {
          ok: true,
          proposalId,
          changes: await describeProposal(ctx, proposal),
          note: "The Proposal card is in the Chat. Nothing has changed yet: say in one line what it would change and that a Member needs to Accept it.",
        };
      } catch (error) {
        if (error instanceof Refusal)
          return { ok: false, reason: error.reason, message: error.message };
        if (error instanceof ConvexError && error.data?.kind === "ProposalRefused")
          return {
            ok: false,
            reason: "refused",
            message: String(error.data.message),
          };
        throw error;
      }
    });
  },
});

// ---------------------------------------------------------------------------
// Applying a Proposal

export type ApplyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "outOfDate" | "refused" | "closed";
      message: string;
    };

/**
 * Applies every change of an open Proposal for `acceptedBy`, or none: first
 * every `expectedVersion` and guard, then every handler's `validate`, and
 * only then each `apply`. A stale document or a refusal marks the Proposal
 * out of date and writes nothing else; a handler that throws while applying
 * rolls back the whole mutation.
 */
export async function applyProposal(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
  acceptedBy: Id<"memberships">,
): Promise<ApplyResult> {
  const proposal = await ctx.db.get("proposals", proposalId);
  if (proposal === null) throw new AccessDenied("wrongEvent", "proposal.decide");
  if (proposal.status !== "open")
    return {
      ok: false,
      reason: "closed",
      message: closedMessage(proposal.status),
    };

  const outOfDate = async (message: string): Promise<ApplyResult> => {
    await ctx.db.patch("proposals", proposalId, {
      status: "outOfDate",
      decidedAt: Date.now(),
    });
    return { ok: false, reason: "outOfDate", message };
  };

  const stale = await staleDependencies(ctx, proposal);
  if (stale.length > 0) {
    const who = await changedBy(ctx, stale, proposal.createdAt);
    return await outOfDate(`Out of date: ${who} changed this since.`);
  }
  for (const change of proposal.changes) {
    await checkInEvent(ctx, proposal.eventId, change);
    const refusal = await handlerFor(change.op).validate(ctx, change as never);
    if (refusal !== null) return await outOfDate(refusal);
  }

  const actor: AssistantActor = {
    kind: "assistant",
    forMembershipId: proposal.requestedBy,
    runId: null,
    proposalId,
    acceptedBy,
  };
  for (const change of proposal.changes) {
    await handlerFor(change.op).apply(ctx, change as never, actor);
  }
  await ctx.db.patch("proposals", proposalId, {
    status: "accepted",
    decidedBy: acceptedBy,
    decidedAt: Date.now(),
  });
  return { ok: true };
}

function closedMessage(status: Status): string {
  switch (status) {
    case "accepted":
      return "This Proposal was already accepted.";
    case "rejected":
      return "This Proposal was rejected.";
    case "replaced":
      return "A newer Proposal replaced this one.";
    case "expired":
      return "This Proposal expired.";
    case "outOfDate":
      return "This Proposal is out of date. Ask again for a fresh one.";
    default:
      return "This Proposal is closed.";
  }
}

const applyResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("outOfDate"),
      v.literal("refused"),
      v.literal("closed"),
    ),
    message: v.string(),
  }),
);

async function loadForDecision(
  ctx: MutationCtx,
  eventId: Id<"events">,
  proposalId: Id<"proposals">,
) {
  const { membership } = await requireAccess(ctx, eventId, "proposal.decide");
  const proposal = await ctx.db.get("proposals", proposalId);
  if (proposal === null || proposal.eventId !== eventId)
    throw new AccessDenied("wrongEvent", "proposal.decide");
  return { membership, proposal };
}

/**
 * A Member accepts a Proposal: all of it applies in this one mutation, or
 * none. Accepting one that is already accepted changes nothing again.
 */
export const accept = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("proposals") },
  returns: applyResultValidator,
  handler: async (ctx, { eventId, proposalId }): Promise<ApplyResult> => {
    const { membership, proposal } = await loadForDecision(
      ctx,
      eventId,
      proposalId,
    );
    if (proposal.status === "accepted") return { ok: true };
    return await applyProposal(ctx, proposalId, membership._id);
  },
});

/** A Member rejects an open Proposal; nothing it holds is applied. */
export const reject = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("proposals") },
  returns: applyResultValidator,
  handler: async (ctx, { eventId, proposalId }): Promise<ApplyResult> => {
    const { membership, proposal } = await loadForDecision(
      ctx,
      eventId,
      proposalId,
    );
    if (proposal.status === "rejected") return { ok: true };
    if (proposal.status !== "open")
      return {
        ok: false,
        reason: "closed",
        message: closedMessage(proposal.status),
      };
    await ctx.db.patch("proposals", proposalId, {
      status: "rejected",
      decidedBy: membership._id,
      decidedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** The words the asker used, for "Ask again"; the summary when there is no Chat request. */
async function requestTextOf(
  ctx: MutationCtx,
  proposal: Doc<"proposals">,
): Promise<string | null> {
  const run = proposal.runId ? await ctx.db.get("runs", proposal.runId) : null;
  if (run?.source === "comment" && run.commentId !== null)
    return (await ctx.db.get("comments", run.commentId))?.body ?? null;
  if (!run?.messageId) return null;
  const [doc] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [run.messageId],
  });
  return doc?.text?.trim() || null;
}

/**
 * "Ask again" on an out-of-date Proposal: sends the original request again,
 * as the Member who tapped it, so the Assistant reads the Canvas fresh and
 * proposes from the current values (assistant-behavior.md, "Collision").
 */
export const askAgain = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("proposals") },
  returns: v.object({ messageId: v.string(), runId: v.id("runs") }),
  handler: async (ctx, { eventId, proposalId }) => {
    const { membership } = await requireAccess(ctx, eventId, "chat.post");
    const proposal = await ctx.db.get("proposals", proposalId);
    if (proposal === null || proposal.eventId !== eventId)
      throw new AccessDenied("wrongEvent", "chat.post");
    if (proposal.status === "open") {
      if ((await staleDependencies(ctx, proposal)).length === 0)
        throw new ConvexError({
          kind: "ProposalStillOpen",
          message: "This Proposal can still be accepted.",
        });
      await ctx.db.patch("proposals", proposalId, {
        status: "outOfDate",
        decidedAt: Date.now(),
      });
    } else if (proposal.status !== "outOfDate") {
      throw new ConvexError({
        kind: "ProposalClosed",
        message: closedMessage(proposal.status),
      });
    }
    await checkQueueRoom(ctx, eventId, membership._id);
    const event = await ctx.db.get("events", eventId);
    if (event === null || event.agentThreadId === null)
      throw new AccessDenied("wrongEvent", "chat.post");

    const request = (await requestTextOf(ctx, proposal)) ?? proposal.summary;
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: event.agentThreadId,
      userId: membership._id,
      prompt: `Ask again: ${request}`,
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId,
      authorMembershipId: membership._id,
      dontReply: false,
      mentions: [],
      pointing: [],
      card: null,
    });
    const runId = await enqueueRun(ctx, {
      eventId,
      requestedBy: membership._id,
      source: "chat",
      messageId,
      commentId: null,
    });
    return { messageId, runId };
  },
});

/** 24 hours after it was posted, an open Proposal closes as expired. */
export const expire = internalMutation({
  args: { proposalId: v.id("proposals") },
  returns: v.null(),
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get("proposals", proposalId);
    if (proposal === null || proposal.status !== "open") return null;
    await ctx.db.patch("proposals", proposalId, {
      status: "expired",
      decidedAt: Date.now(),
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// The card

/** The document as it was at `version`: now if it hasn't moved, else from its history. */
async function docAt(
  ctx: Ctx,
  table: HistoryTable,
  docId: string,
  version: number | null,
): Promise<Record<string, unknown> | null> {
  const now = await loadDoc(ctx, table, docId);
  if (version === null || (now as { version?: number } | null)?.version === version)
    return now;
  const rows = await ctx.db
    .query("changes")
    .withIndex("by_doc", (q) => q.eq("docId", docId as Id<"entries">))
    .order("desc")
    .take(50);
  for (const row of rows) {
    for (const side of [row.before, row.after] as const) {
      if ((side as { version?: number } | null)?.version === version)
        return side as Record<string, unknown>;
    }
  }
  return now;
}

function quoted(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return `"${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}"`;
}

function entryName(entry: Record<string, unknown> | null): string {
  const kind = entry?.kind;
  const fields = (entry?.fields ?? {}) as Record<string, unknown>;
  if (kind === "budget") return String(fields.label ?? "a budget line");
  if (kind === "timeline") return String(fields.title ?? "a Timeline Entry");
  if (kind === "checklist")
    return String(fields.freeLabel ?? fields.vendorCategory ?? "a Vendor");
  return "an Entry";
}

function itemName(item: Record<string, unknown> | null): string {
  const data = (item?.data ?? {}) as Record<string, unknown>;
  switch (item?.kind) {
    case "note":
      return `the Note ${quoted(String(data.text ?? ""), 40)}`;
    case "suggestion":
      return `the Suggestion ${quoted(String(data.title ?? ""))}`;
    case "budget":
      return "the Budget";
    case "timeline":
      return "the Timeline";
    case "checklist":
      return "the Vendor checklist";
    case "inspiration":
      return "an Inspiration";
    case "vendor":
      return "a Vendor card";
    case "googlePlace":
      return "a Google place";
    default:
      return "an Item";
  }
}

const show = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "nothing"
    : typeof value === "boolean"
      ? value
        ? "done"
        : "not done"
      : Array.isArray(value)
        ? value.join(", ") || "nothing"
        : String(value);

/** One change in plain words with its before and after: "Decor ₹3,00,000 → ₹2,20,000". */
async function describeChange(
  ctx: Ctx,
  change: ProposedChange,
): Promise<string> {
  switch (change.op) {
    case "updateEntry": {
      const before = await docAt(ctx, "entries", change.docId, change.expectedVersion);
      const name = entryName(before);
      const fields = (before?.fields ?? {}) as Record<string, unknown>;
      const patch = (change.values.patch.fields ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (before?.kind === "budget" && "plannedAmount" in patch) {
        const from = entryAmount(fields as EntryFields<"budget">);
        const to = patch.plannedAmount as number;
        parts.push(`${name} ${formatINR(from)} → ${formatINR(to)}`);
      }
      for (const [key, value] of Object.entries(patch)) {
        if (key === "plannedAmount" || key === "estimate") continue;
        const label = key === "freeLabel" || key === "label" || key === "title" ? "name" : key;
        parts.push(`${name}: ${label} ${show(fields[key])} → ${show(value)}`);
      }
      if ("functionKey" in change.values.patch)
        parts.push(
          `${name}: Function ${show(before?.functionKey ?? "Event-wide")} → ${show(change.values.patch.functionKey ?? "Event-wide")}`,
        );
      return parts.join("; ") || `Change ${name}`;
    }
    case "deleteEntry": {
      const before = await docAt(ctx, "entries", change.docId, change.expectedVersion);
      const amount =
        before?.kind === "budget"
          ? ` (${formatINR(entryAmount(before.fields as EntryFields<"budget">))})`
          : "";
      return `Delete ${quoted(entryName(before))}${amount}`;
    }
    case "addEntry": {
      const f = change.values.fields as Record<string, unknown>;
      if (change.values.kind === "budget") {
        const fields = f as EntryFields<"budget">;
        const amount = entryAmount(fields);
        const source = fields.plannedAmount !== null ? "" : fields.estimate ? " (Estimate)" : "";
        return `Add ${quoted(fields.label)} ${amount > 0 ? formatINR(amount) : "with no Estimate yet"}${source}`;
      }
      if (change.values.kind === "timeline")
        return `Add ${quoted(String(f.title))} to the Timeline${f.date ? ` on ${String(f.date)}` : ""}`;
      return `Add ${quoted(String(f.freeLabel ?? f.vendorCategory ?? "Vendor"))} to the Vendor checklist`;
    }
    case "addItem":
      return change.values.kind === "note"
        ? `Add a Note ${quoted(change.values.data.text)}`
        : `Add the Suggestion ${quoted(change.values.data.title)}`;
    case "updateItem": {
      const before = await docAt(ctx, "items", change.docId, change.expectedVersion);
      const data = (change.values.patch.data ?? {}) as Record<string, unknown>;
      const old = (before?.data ?? {}) as Record<string, unknown>;
      const parts = Object.entries(data).map(
        ([key, value]) => `${key} ${quoted(show(old[key]), 40)} → ${quoted(show(value), 40)}`,
      );
      return `Edit ${itemName(before)}${parts.length ? `: ${parts.join("; ")}` : ""}`;
    }
    case "moveItem": {
      const before = await docAt(ctx, "items", change.docId, change.expectedVersion);
      const section =
        change.values.sectionId === null
          ? null
          : await ctx.db.get("sections", change.values.sectionId);
      return `Move ${itemName(before)}${section ? ` to ${section.name}` : ""}`;
    }
    case "deleteItem": {
      const before = await docAt(ctx, "items", change.docId, change.expectedVersion);
      return `Delete ${itemName(before)}`;
    }
    case "createSection":
      return `New Section ${quoted(change.values.name)}`;
    case "addComment":
      return `Comment ${quoted(change.values.body)}`;
    case "setBudgetTotal": {
      const before = await docAt(ctx, "events", change.docId, change.expectedVersion);
      const from = (before?.budgetTotal as number | null) ?? null;
      return `Budget total ${from === null ? "not set" : formatINR(from)} → ${formatINR(change.values.budgetTotal)}`;
    }
    case "addQuote":
      return `Add a Quote of ${formatINR(change.values.amount)}`;
    case "updateTheme":
      return "Update the Theme";
    case "changeEssential":
      return `Change the ${change.values.field}`;
  }
}

/** Each change of a Proposal in plain words, in order. */
export async function describeProposal(
  ctx: Ctx,
  proposal: Pick<Doc<"proposals">, "changes">,
): Promise<string[]> {
  const lines: string[] = [];
  for (const change of proposal.changes) lines.push(await describeChange(ctx, change));
  return lines;
}

const statusKindValidator = v.union(
  v.literal("open"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("replaced"),
  v.literal("outOfDate"),
  v.literal("expired"),
);

const cardValidator = v.object({
  proposalId: v.id("proposals"),
  summary: v.string(),
  requestedByName: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  lines: v.array(v.string()),
  status: v.object({ kind: statusKindValidator, text: v.string() }),
  /** Whether the caller may Accept or Reject it now: a Member, while it is open. */
  canDecide: v.boolean(),
  /** Whether the caller may tap "Ask again": a Member, while it is out of date. */
  canAskAgain: v.boolean(),
});
export type ProposalCardView = Infer<typeof cardValidator>;

/**
 * One Proposal as its card shows it, live: its changes in plain words, and
 * its state. An open Proposal whose documents moved on shows as out of date
 * at once ("Out of date: Meera changed this since"), before anyone taps
 * Accept. Everyone in the Event can read it; only Members get the buttons.
 */
export const get = query({
  args: { eventId: v.id("events"), proposalId: v.id("proposals") },
  returns: cardValidator,
  handler: async (ctx, { eventId, proposalId }): Promise<ProposalCardView> => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.view");
    const proposal = await ctx.db.get("proposals", proposalId);
    if (proposal === null || proposal.eventId !== eventId)
      throw new AccessDenied("wrongEvent", "canvas.view");

    let kind: Status = proposal.status;
    let text: string;
    if (kind === "open" || kind === "outOfDate") {
      const stale = await staleDependencies(ctx, proposal);
      if (stale.length > 0) {
        kind = "outOfDate";
        text = `Out of date: ${await changedBy(ctx, stale, proposal.createdAt)} changed this since`;
      } else if (kind === "outOfDate") {
        text = "Out of date";
      } else {
        text = "Waiting for a Member to accept or reject";
      }
    } else if (kind === "accepted") {
      text = `Accepted by ${await memberDisplayName(ctx, proposal.decidedBy)}`;
    } else if (kind === "rejected") {
      text = `Rejected by ${await memberDisplayName(ctx, proposal.decidedBy)}`;
    } else if (kind === "replaced") {
      text = "Replaced";
    } else {
      text = "Expired";
    }

    const member = can(membership.role, "proposal.decide");
    return {
      proposalId,
      summary: proposal.summary,
      requestedByName: await memberDisplayName(ctx, proposal.requestedBy),
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
      lines: await describeProposal(ctx, proposal),
      status: { kind, text },
      canDecide: member && kind === "open",
      canAskAgain: member && kind === "outOfDate",
    };
  },
});
