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
import { checkQueueRoom, enqueueRun } from "./runs";
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

/** A message may point at this many things at once. */
export const MAX_POINTED = 5;
/** A pointed passage longer than this is refused; it goes into the prompt. */
export const MAX_POINTED_QUOTE = 500;
/** A passage's field name longer than this is refused; it goes into the prompt too. */
export const MAX_POINTED_FIELD = 64;

/** Refuses pointing at too much, or at anything outside this Event or deleted. */
async function checkPointing(
  ctx: QueryCtx,
  eventId: Id<"events">,
  pointing: Doc<"chatAnnotations">["pointing"],
): Promise<void> {
  if (pointing.length > MAX_POINTED) {
    throw new ConvexError({ kind: "TooManyPointed", max: MAX_POINTED });
  }
  for (const target of pointing) {
    if (target.kind === "passage" && target.quote.length > MAX_POINTED_QUOTE) {
      throw new ConvexError({ kind: "QuoteTooLong", max: MAX_POINTED_QUOTE });
    }
    if (target.kind === "passage" && target.field.length > MAX_POINTED_FIELD) {
      throw new ConvexError({ kind: "FieldTooLong", max: MAX_POINTED_FIELD });
    }
    const item = await ctx.db.get("items", target.itemId);
    if (item === null || item.eventId !== eventId || item.deletedAt !== null) {
      throw new AccessDenied("wrongEvent", "chat.post");
    }
    if (target.kind !== "item" && target.entryId !== null) {
      const entry = await ctx.db.get("entries", target.entryId);
      if (
        entry === null ||
        entry.itemId !== item._id ||
        entry.deletedAt !== null
      ) {
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
    const replies = pointing.length > 0 || !dontReply;
    if (replies) await checkQueueRoom(ctx, eventId, membership._id);

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

const annotationValidator = v.object({
  ...schema.tables.chatAnnotations.validator.fields,
  _id: v.id("chatAnnotations"),
  _creationTime: v.number(),
  authorName: v.string(),
});

/** How many recent runs and annotations the Chat loads beside its messages. */
const RECENT_RUNS = 100;
const RECENT_ANNOTATIONS = 300;
/** At most this many of each for one stretch of older Chat. */
const HISTORY_LIMIT = 1000;
/**
 * A message's annotation and run are written in the same mutation as the
 * message, a moment after it; this margin makes sure a range that starts at
 * the message's creation time still finds them.
 */
const HISTORY_MARGIN_MS = 1000;

/** Single letters from other scripts that pass for Latin ones in "Utsavvy". */
const CONFUSABLES: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  ѕ: "s",
  і: "i",
  т: "t",
  в: "v",
  ν: "v",
  α: "a",
  ο: "o",
  υ: "u",
  τ: "t",
  ι: "i",
  ρ: "p",
  ʋ: "v",
  ѵ: "v",
};

/**
 * Whether a name could pass for the Assistant's: compared after NFKC
 * normalisation, with invisible characters, spaces and punctuation removed,
 * case folded and common Cyrillic and Greek lookalikes mapped to Latin.
 */
export function looksLikeAssistant(name: string): boolean {
  const folded = [...name.normalize("NFKC").toLowerCase()]
    .map((char) => CONFUSABLES[char] ?? char)
    .join("")
    .replace(/[^a-z]/g, "");
  return folded.includes(ASSISTANT_NAME.toLowerCase());
}

/**
 * A Member's name as the Chat and the prompt show it: invisible characters
 * removed, and "(a Member)" added when it could pass for the Assistant's, so
 * nobody can post as "Utsavvy for Meera".
 */
export function memberName(displayName: string): string {
  const visible = displayName.replace(/\p{Cf}/gu, "").trim() || "A Member";
  return looksLikeAssistant(visible) ? `${visible} (a Member)` : visible;
}

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
        ? memberName(membership.displayName)
        : `${memberName(membership.displayName)} (left)`;
  cache.set(membershipId, name);
  return name;
}

async function withAuthor(
  ctx: QueryCtx,
  annotation: Doc<"chatAnnotations">,
  names: Map<string, string>,
) {
  return {
    ...annotation,
    authorName: await nameOf(ctx, annotation.authorMembershipId, names),
  };
}

async function runSummary(
  ctx: QueryCtx,
  run: Doc<"runs">,
  names: Map<string, string>,
) {
  return {
    _id: run._id,
    messageId: run.messageId,
    status: run.status,
    requestedBy: run.requestedBy,
    requestedByName: await nameOf(ctx, run.requestedBy, names),
    stoppedByName:
      run.stoppedBy === null ? null : await nameOf(ctx, run.stoppedBy, names),
    model: run.model,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
  };
}

/** The caller's membership when they can read the Event's Chat, or null. */
async function chatReader(
  ctx: QueryCtx,
  rawEventId: string,
): Promise<{ eventId: Id<"events">; membership: Doc<"memberships"> } | null> {
  const eventId = ctx.db.normalizeId("events", rawEventId);
  if (eventId === null) return null;
  try {
    const { membership } = await requireAccess(ctx, eventId, "canvas.view");
    return { eventId, membership };
  } catch (error) {
    if (error instanceof AccessDenied) return null;
    throw error;
  }
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
      annotations: v.array(annotationValidator),
      runs: v.array(runSummaryValidator),
      /**
       * Annotations and runs from before this time may be missing (a recent
       * window is full); `history` fills them in for older messages. Null
       * when nothing is missing.
       */
      historyFrom: v.union(v.number(), v.null()),
      latestModel: v.union(
        v.object({ model: v.string(), fallback: v.boolean() }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const reader = await chatReader(ctx, args.eventId);
    if (reader === null) return null;
    const { eventId, membership } = reader;
    const event = await loadEvent(ctx, eventId);
    const names = new Map<string, string>();

    const recentAnnotations = await ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(RECENT_ANNOTATIONS);
    const annotations = [];
    for (const annotation of [...recentAnnotations].reverse()) {
      annotations.push(await withAuthor(ctx, annotation, names));
    }

    const recentRuns = await ctx.db
      .query("runs")
      .withIndex("by_event_created", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(RECENT_RUNS);
    const runs = [];
    for (const run of [...recentRuns].reverse()) {
      runs.push(await runSummary(ctx, run, names));
    }

    // Where each full window starts; anything older may be missing.
    const windowStarts = [
      recentAnnotations.length === RECENT_ANNOTATIONS
        ? recentAnnotations.at(-1)!._creationTime
        : null,
      recentRuns.length === RECENT_RUNS ? recentRuns.at(-1)!.createdAt : null,
    ].filter((time) => time !== null);

    const answered = runs.findLast((run) => run.model !== "");
    return {
      threadId: event.agentThreadId,
      me: {
        membershipId: membership._id,
        canPost: can(membership.role, "chat.post"),
      },
      annotations,
      runs,
      historyFrom: windowStarts.length > 0 ? Math.max(...windowStarts) : null,
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
 * The annotations and runs for a stretch of older Chat, from `since` (the
 * oldest loaded message's creation time) to `until` (`details.historyFrom`),
 * so messages loaded with "Show earlier messages" keep their author, Don't
 * reply state, run notices and Undo all. Null without access, like `details`.
 */
export const history = query({
  args: { eventId: v.string(), since: v.number(), until: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      annotations: v.array(annotationValidator),
      runs: v.array(runSummaryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const reader = await chatReader(ctx, args.eventId);
    if (reader === null) return null;
    const { eventId } = reader;
    const from = args.since - HISTORY_MARGIN_MS;
    const names = new Map<string, string>();

    const olderAnnotations = await ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) =>
        q
          .eq("eventId", eventId)
          .gte("_creationTime", from)
          .lte("_creationTime", args.until),
      )
      .take(HISTORY_LIMIT);
    const annotations = [];
    for (const annotation of olderAnnotations) {
      annotations.push(await withAuthor(ctx, annotation, names));
    }

    const olderRuns = await ctx.db
      .query("runs")
      .withIndex("by_event_created", (q) =>
        q
          .eq("eventId", eventId)
          .gte("createdAt", from)
          .lte("createdAt", args.until),
      )
      .take(HISTORY_LIMIT);
    const runs = [];
    for (const run of olderRuns) {
      runs.push(await runSummary(ctx, run, names));
    }
    return { annotations, runs };
  },
});

/**
 * Posts a message as Utsavvy without a model call: Nudges (S17), Proposal
 * cards (S10) and notices. `card` picks the card the Chat renders from the
 * card registry; `text` is the line shown with it and the Assistant reads it
 * in later replies. With `promptMessageId` the line joins that message's
 * reply, at the same place in the thread, instead of going to the end.
 */
export const postSystem = internalMutation({
  args: {
    eventId: v.id("events"),
    card: cardValidator,
    text: v.optional(v.string()),
    promptMessageId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { eventId, card, text, promptMessageId }) => {
    const threadId = await ensureThread(ctx, await loadEvent(ctx, eventId));
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      agentName: ASSISTANT_NAME,
      message: { role: "assistant", content: text ?? "" },
      promptMessageId,
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
 *
 * Null for a run with no Chat message, so `respond` fails it: S5 only queues
 * Chat runs. A slice that queues runs from a Comment, Nudge or Brief without a
 * Chat message (S10, S17) must post that message first or extend this.
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
          /** A line the app posted (`postSystem`), not a Member's or a reply. */
          notice: v.boolean(),
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
    // The request's own annotation, however far back it is, so the model
    // always knows who asked and what they pointed at.
    const own = await ctx.db
      .query("chatAnnotations")
      .withIndex("by_message", (q) => q.eq("messageId", run.messageId!))
      .unique();
    if (own !== null && !recent.some((row) => row._id === own._id)) {
      recent.push(own);
    }
    for (const annotation of recent) {
      const notice = annotation.authorMembershipId === null;
      labels.push({
        messageId: annotation.messageId,
        authorName: notice
          ? ""
          : await nameOf(ctx, annotation.authorMembershipId, names),
        dontReply: annotation.dontReply,
        pointing: annotation.pointing,
        notice,
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
