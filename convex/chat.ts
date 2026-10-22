import {
  createThread,
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import { selectionTargetValidator } from "../lib/types/canvas";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { defaultModel } from "./lib/models";
import { enqueueRun } from "./runs";
import schema from "./schema";

/**
 * The Chat (IMPLEMENTATION_PLAN.md sections 4.5 and 5.4, assistant-behavior.md
 * rules 1 to 4 and 14 to 21). Message text and the streamed replies live in
 * the Event's one Agent thread; `chatAnnotations` adds who wrote each message,
 * its Don't reply toggle, what it points at and any card.
 */

/** Long enough for a pasted Quote or a detailed request; longer is refused. */
export const MAX_MESSAGE_LENGTH = 4000;
/** The Assistant's name in the Chat and in history (assistant-behavior.md rule 25). */
export const ASSISTANT_NAME = "Utsavvy";

const cardValidator = schema.tables.chatAnnotations.validator.fields.card;
const pointingValidator = v.array(selectionTargetValidator);

/**
 * The Event's Agent thread, made on first use. S1 creates it with the Event;
 * this covers Events made before that (seeded or test Events). The thread ID
 * is plumbing, not Canvas content, so it is set directly without a version
 * bump or a history row.
 */
async function ensureThread(
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<string> {
  if (event.agentThreadId !== null) return event.agentThreadId;
  const threadId = await createThread(ctx, components.agent, {
    title: event.name,
  });
  await ctx.db.patch("events", event._id, { agentThreadId: threadId });
  return threadId;
}

async function loadEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId);
  if (event === null)
    throw new ConvexError({ kind: "NotFound", what: "event" });
  return event;
}

/** Refuses pointing at anything outside this Event. */
async function checkPointing(
  ctx: QueryCtx,
  eventId: Id<"events">,
  pointing: Doc<"chatAnnotations">["pointing"],
): Promise<void> {
  for (const target of pointing) {
    const item = await ctx.db.get("items", target.itemId);
    if (item === null || item.eventId !== eventId || item.deletedAt !== null) {
      throw new AccessDenied("wrongEvent", "chat.post");
    }
    if (target.kind !== "item" && target.entryId !== null) {
      const entry = await ctx.db.get("entries", target.entryId);
      if (entry === null || entry.itemId !== item._id) {
        throw new AccessDenied("wrongEvent", "chat.post");
      }
    }
  }
}

/**
 * Posts a Member's message. It goes to the Assistant unless Don't reply is on;
 * a message pointing at something always goes to the Assistant (rule 3).
 * Don't-reply messages are still read by the Assistant as background (rule 4).
 * Viewers can't post.
 */
export const send = mutation({
  args: {
    eventId: v.id("events"),
    text: v.string(),
    dontReply: v.boolean(),
    pointing: pointingValidator,
  },
  returns: v.object({
    messageId: v.string(),
    runId: v.union(v.id("runs"), v.null()),
  }),
  handler: async (ctx, { eventId, text, dontReply, pointing }) => {
    const { membership } = await requireAccess(ctx, eventId, "chat.post");
    const body = text.trim();
    if (body.length === 0) throw new ConvexError({ kind: "EmptyMessage" });
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError({
        kind: "MessageTooLong",
        max: MAX_MESSAGE_LENGTH,
      });
    }
    await checkPointing(ctx, eventId, pointing);

    const threadId = await ensureThread(ctx, await loadEvent(ctx, eventId));
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: membership._id,
      prompt: body,
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId,
      authorMembershipId: membership._id,
      dontReply,
      // @mentions arrive with X4.
      mentions: [],
      pointing,
      card: null,
    });

    const replies = pointing.length > 0 || !dontReply;
    const runId = replies
      ? await enqueueRun(ctx, {
          eventId,
          requestedBy: membership._id,
          source: "chat",
          messageId,
          commentId: null,
        })
      : null;
    return { messageId, runId };
  },
});

/**
 * The Event's Chat messages with their live stream deltas, in the shape
 * `useUIMessages` from `@convex-dev/agent/react` reads. A browser that joins
 * or reloads mid-reply picks the stream up from the stored deltas.
 */
export const list = query({
  args: {
    eventId: v.id("events"),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, { eventId, threadId, paginationOpts, streamArgs }) => {
    await requireAccess(ctx, eventId, "canvas.view");
    const event = await loadEvent(ctx, eventId);
    if (event.agentThreadId !== threadId) {
      throw new AccessDenied("wrongEvent", "canvas.view");
    }
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId,
      paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId,
      streamArgs,
    });
    return { ...paginated, streams };
  },
});

const runSummaryValidator = v.object({
  _id: v.id("runs"),
  messageId: v.union(v.string(), v.null()),
  status: schema.tables.runs.validator.fields.status,
  requestedBy: v.id("memberships"),
  requestedByName: v.string(),
  stoppedByName: v.union(v.string(), v.null()),
  model: v.string(),
  createdAt: v.number(),
  startedAt: v.union(v.number(), v.null()),
  endedAt: v.union(v.number(), v.null()),
});

/** How many recent runs and annotations the Chat loads beside its messages. */
const RECENT_RUNS = 100;
const RECENT_ANNOTATIONS = 300;

/** A membership's name as the Chat shows it, "Aditi (left)" once they've gone. */
async function nameOf(
  ctx: QueryCtx,
  membershipId: Id<"memberships"> | null,
  cache: Map<string, string>,
): Promise<string> {
  if (membershipId === null) return ASSISTANT_NAME;
  const cached = cache.get(membershipId);
  if (cached !== undefined) return cached;
  const membership = await ctx.db.get("memberships", membershipId);
  const name =
    membership === null
      ? "Someone"
      : membership.status === "active"
        ? membership.displayName
        : `${membership.displayName} (left)`;
  cache.set(membershipId, name);
  return name;
}

/**
 * Everything the Chat shows beside the message text: the thread, the caller's
 * own membership, who wrote each message and with which toggles, the recent
 * runs (queued, replying, stopped, failed) and the model that answered the
 * latest reply.
 */
export const details = query({
  // A string, so a mistyped workspace URL or a lost membership reads as "no
  // access" (null) instead of an error the page has to catch.
  args: { eventId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      threadId: v.union(v.string(), v.null()),
      me: v.object({
        membershipId: v.id("memberships"),
        canPost: v.boolean(),
      }),
      annotations: v.array(
        v.object({
          ...schema.tables.chatAnnotations.validator.fields,
          _id: v.id("chatAnnotations"),
          _creationTime: v.number(),
          authorName: v.string(),
        }),
      ),
      runs: v.array(runSummaryValidator),
      latestModel: v.union(
        v.object({ model: v.string(), fallback: v.boolean() }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return null;
    let membership: Doc<"memberships">;
    try {
      ({ membership } = await requireAccess(ctx, eventId, "canvas.view"));
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
    const event = await loadEvent(ctx, eventId);
    const names = new Map<string, string>();

    const annotations = [];
    const recentAnnotations = await ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(RECENT_ANNOTATIONS);
    for (const annotation of recentAnnotations.reverse()) {
      annotations.push({
        ...annotation,
        authorName: await nameOf(ctx, annotation.authorMembershipId, names),
      });
    }

    const runs = [];
    const recentRuns = await ctx.db
      .query("runs")
      .withIndex("by_event_created", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(RECENT_RUNS);
    for (const run of recentRuns.reverse()) {
      runs.push({
        _id: run._id,
        messageId: run.messageId,
        status: run.status,
        requestedBy: run.requestedBy,
        requestedByName: await nameOf(ctx, run.requestedBy, names),
        stoppedByName:
          run.stoppedBy === null
            ? null
            : await nameOf(ctx, run.stoppedBy, names),
        model: run.model,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
      });
    }

    const answered = runs.findLast((run) => run.model !== "");
    return {
      threadId: event.agentThreadId,
      me: {
        membershipId: membership._id,
        canPost: can(membership.role, "chat.post"),
      },
      annotations,
      runs,
      latestModel: answered
        ? {
            model: answered.model,
            // The configured default didn't answer: Claude was unavailable and
            // the automatic fallback took over (ADR 0003).
            fallback: answered.model !== defaultModel(),
          }
        : null,
    };
  },
});

/**
 * Posts a message as Utsavvy without a model call: Nudges (S17), Proposal
 * cards (S10) and notices. `card` picks the card the Chat renders from the
 * card registry; `text` is the line shown with it and the Assistant reads it
 * in later replies.
 */
export const postSystem = internalMutation({
  args: {
    eventId: v.id("events"),
    card: cardValidator,
    text: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { eventId, card, text }) => {
    const threadId = await ensureThread(ctx, await loadEvent(ctx, eventId));
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      agentName: ASSISTANT_NAME,
      message: { role: "assistant", content: text ?? "" },
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId,
      authorMembershipId: null,
      dontReply: false,
      mentions: [],
      pointing: [],
      card,
    });
    return messageId;
  },
});

/**
 * What the streaming action needs to answer a run: the thread, the message it
 * answers, the asker, and labels for recent messages (who wrote each, and
 * whether it was a Don't-reply message), so the model reads the Chat with each
 * author's name (section 4.5, "Context").
 */
export const runContext = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({
      eventId: v.id("events"),
      threadId: v.string(),
      promptMessageId: v.string(),
      status: schema.tables.runs.validator.fields.status,
      askerMembershipId: v.id("memberships"),
      askerName: v.string(),
      askerActive: v.boolean(),
      labels: v.array(
        v.object({
          messageId: v.string(),
          authorName: v.string(),
          dontReply: v.boolean(),
          pointing: pointingValidator,
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null || run.messageId === null) return null;
    const event = await ctx.db.get("events", run.eventId);
    if (event === null || event.agentThreadId === null) return null;
    const asker = await ctx.db.get("memberships", run.requestedBy);
    const names = new Map<string, string>();
    const labels = [];
    const recent = await ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", run.eventId))
      .order("desc")
      .take(RECENT_ANNOTATIONS);
    for (const annotation of recent) {
      if (annotation.authorMembershipId === null) continue;
      labels.push({
        messageId: annotation.messageId,
        authorName: await nameOf(ctx, annotation.authorMembershipId, names),
        dontReply: annotation.dontReply,
        pointing: annotation.pointing,
      });
    }
    return {
      eventId: run.eventId,
      threadId: event.agentThreadId,
      promptMessageId: run.messageId,
      status: run.status,
      askerMembershipId: run.requestedBy,
      askerName: asker?.displayName ?? "Someone",
      askerActive:
        asker !== null &&
        asker.status === "active" &&
        !asker.blocked &&
        can(asker.role, "chat.post"),
      labels,
    };
  },
});
