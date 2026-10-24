import { createThread, createTool, saveMessage } from "@convex-dev/agent";
import type { Tool } from "ai";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { functionsNamedIn } from "../../../lib/inspirations/functions";
import { ownSetKeys, searchLibrary } from "../../../lib/inspirations/library";
import { parseStripCard, stripCardId } from "../../../lib/inspirations/strip";
import {
  asksForTheme,
  mergeTheme,
  themeUpdateProblem,
} from "../../../lib/inspirations/theme";
import type { Action } from "../../../lib/types/roles";
import type { ProposalOpHandler } from "../../../lib/types/proposals";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  env,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { afterThemeChange } from "../../inspirations";
import { requireAccessFor } from "../../lib/access";
import { AccessDenied } from "../../lib/errors";
import { once } from "../../lib/idempotency";
import { assistantWrite } from "../../lib/write";
import type { AssistantToolCtx } from "../agent";
import type { ToolResult } from "./core";

// S13 (Inspirations) owns this file: searchStockImages, updateTheme,
// tagInspiration and the updateTheme Proposal op handler
// (docs/design/inspirations.md, "Tools"). As in S7's tools, each call checks
// its run and Member fresh, refusals come back as results the model can
// explain, and writes are version-checked and idempotent per toolCallId.

export { parseStripCard };

type Ctx = QueryCtx | MutationCtx;

function refusal(reason: string, message: string): ToolResult {
  return { ok: false, reason, message };
}

/** A thrown Convex error as a result the model can read. */
function errorResult(error: unknown): ToolResult {
  const data =
    error instanceof ConvexError
      ? (error.data as Record<string, unknown> | string)
      : typeof error === "object" && error !== null && "data" in error
        ? (error as { data: unknown }).data
        : null;
  if (typeof data === "object" && data !== null && "kind" in data) {
    const kind = String((data as { kind: unknown }).kind);
    if (kind === "AccessDenied")
      return {
        ok: false,
        reason: "accessDenied",
        error: "AccessDenied",
        message:
          (data as { reason?: unknown }).reason === "wrongEvent"
            ? "That isn't in this Event. Use IDs from readCanvas."
            : "The Member you are answering can no longer change this Event. Change nothing more; end your reply in one short line.",
      };
    if (kind === "VersionConflict")
      return {
        ok: false,
        reason: "VersionConflict",
        error: "VersionConflict",
        message:
          "It changed since you read it. Call readCanvas again and retry once with the new version.",
      };
    const message = (data as { message?: unknown }).message;
    return {
      ok: false,
      reason: kind,
      error: kind,
      message: typeof message === "string" ? message : `Refused (${kind}).`,
    };
  }
  console.error("Assistant image tool failed", error);
  return {
    ok: false,
    reason: "failed",
    message: "That didn't work. Tell the Member briefly and don't retry it.",
  };
}

async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return errorResult(error);
  }
}

// ---------------------------------------------------------------------------
// The run's gate (the same rules as S7's tools)

const callRef = {
  runId: v.id("runs"),
  eventId: v.id("events"),
  forMembershipId: v.id("memberships"),
  toolCallId: v.string(),
};
type CallRef = {
  runId: Id<"runs">;
  eventId: Id<"events">;
  forMembershipId: Id<"memberships">;
  toolCallId: string;
};

type Gate = {
  run: Doc<"runs">;
  membership: Doc<"memberships">;
  event: Doc<"events">;
};

async function gate(ctx: Ctx, ref: CallRef, action: Action): Promise<Gate> {
  const run = await ctx.db.get("runs", ref.runId);
  if (
    run === null ||
    run.eventId !== ref.eventId ||
    run.requestedBy !== ref.forMembershipId
  )
    throw new AccessDenied("wrongEvent", action);
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
    action,
  );
  const event = await ctx.db.get("events", ref.eventId);
  if (event === null) throw new AccessDenied("wrongEvent", action);
  return { run, membership, event };
}

/** Only a Member's own message (or @Utsavvy in a Comment) asks for a change; a Nudge or Brief run doesn't. */
function asked(run: Doc<"runs">): boolean {
  return run.source === "chat" || run.source === "comment";
}

/** The text of the message this run answers. */
async function requestText(ctx: Ctx, run: Doc<"runs">): Promise<string> {
  if (run.source === "comment" && run.commentId !== null)
    return (await ctx.db.get("comments", run.commentId))?.body ?? "";
  if (run.messageId === null) return "";
  const [doc] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [run.messageId],
  });
  return doc?.text ?? "";
}

async function functionsOf(ctx: Ctx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventFunctions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(100);
}

const callKey = (ref: CallRef) => `${ref.runId}:${ref.toolCallId}`;

// ---------------------------------------------------------------------------
// searchStockImages (rule 3)

const NOTHING_IN_LIBRARY =
  "I don't have stock photos for that yet. You can upload your own.";

export const searchForRun = internalMutation({
  args: { ...callRef, query: v.string() },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "chat.post");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      const photos = searchLibrary(args.query, {
        setKeys: ownSetKeys(g.event),
      });
      if (photos.length === 0)
        return {
          ok: true,
          found: 0,
          message: `The stock library has nothing for that. Say: "${NOTHING_IN_LIBRARY}" Don't show, describe or suggest other photos instead.`,
        };
      // The Function the Member's message names, so a tapped photo lands tagged
      // with it (rule 8); a Nudge or Brief run names none.
      const named = asked(g.run)
        ? functionsNamedIn(
            await requestText(ctx, g.run),
            await functionsOf(ctx, args.eventId),
          )
        : [];
      const functionKey = named[0] ?? null;
      await ctx.runMutation(internal.chat.postSystem, {
        eventId: args.eventId,
        card: {
          kind: "stockStrip",
          id: stripCardId({
            pexelsIds: photos.map((p) => p.pexelsId),
            functionKey,
            query: args.query.slice(0, 100),
          }),
        },
        ...(g.run.messageId ? { promptMessageId: g.run.messageId } : {}),
      });
      return {
        ok: true,
        found: photos.length,
        functionKey,
        photos: photos.map((p) => ({ alt: p.alt, tags: p.tags })),
        message:
          "The Chat now shows these photos as a strip. Members tap the ones they like; nothing is added until they do. Say so in one short line; don't list the photos.",
      };
    });
  },
});

// ---------------------------------------------------------------------------
// updateTheme (rule 16)

const NOT_ASKED_THEME =
  "No Member asked to change the Theme. Don't change it directly: use propose with an updateTheme change, and say in one line what you would change.";

const themeUpdateArgs = {
  addPalette: v.array(v.string()),
  removePalette: v.array(v.string()),
  addStyleWords: v.array(v.string()),
  addDecorKeywords: v.array(v.string()),
  fromInspiration: v.union(v.id("items"), v.null()),
};

export const updateThemeForRun = internalMutation({
  args: { ...callRef, expectedVersion: v.number(), ...themeUpdateArgs },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "canvas.edit");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      if (!asked(g.run) || !asksForTheme(await requestText(ctx, g.run)))
        return refusal("notAsked", NOT_ASKED_THEME);
      const update = {
        addPalette: args.addPalette,
        removePalette: args.removePalette,
        addStyleWords: args.addStyleWords,
        addDecorKeywords: args.addDecorKeywords,
        fromInspiration: args.fromInspiration,
      };
      const problem = themeUpdateProblem(update);
      if (problem) return refusal("invalid", problem);
      if (update.fromInspiration !== null) {
        const item = await ctx.db.get("items", update.fromInspiration);
        if (item === null || item.eventId !== args.eventId)
          return refusal("invalid", "That Inspiration isn't in this Event.");
        if (item.kind !== "inspiration" || item.deletedAt !== null)
          return refusal("invalid", "That isn't a live Inspiration.");
      }
      const theme = mergeTheme(g.event.theme, update);
      const { version } = await assistantWrite(ctx, {
        table: "events",
        id: args.eventId,
        expectedVersion: args.expectedVersion,
        patch: { theme },
        runId: g.run._id,
        forMembershipId: g.membership._id,
        toolCallId: `${args.toolCallId}#1`,
        fromComment: g.run.source === "comment",
        groupLabel: "Update the Theme",
      });
      await afterThemeChange(ctx, {
        eventId: args.eventId,
        forMembershipId: g.membership._id,
        scope: { kind: "run", runId: g.run._id, toolCallId: args.toolCallId },
      });
      return {
        ok: true,
        theme,
        version,
        message:
          "Theme updated. Decor Suggestions that fit it will appear on the Canvas in a moment; mention that in one line.",
      };
    });
  },
});

/**
 * The `updateTheme` Proposal op (IMPLEMENTATION_PLAN.md section 6): the
 * Assistant's own idea for the Theme, applied when a Member accepts it. `docId`
 * is the Event and `expectedVersion` its version when the Proposal was made.
 */
export const updateThemeOp: ProposalOpHandler<"updateTheme"> = {
  validate: async (ctx, change) => {
    const event = await ctx.db.get("events", change.docId);
    if (event === null) return "That Event is gone.";
    if (event.version !== change.expectedVersion)
      return "The Theme changed since this Proposal was made.";
    return themeUpdateProblem(change.values);
  },
  apply: async (ctx, change, actor) => {
    if (actor.kind !== "assistant" || actor.proposalId === null)
      throw new Error("The updateTheme op applies only from a Proposal.");
    const event = await ctx.db.get("events", change.docId);
    if (event === null) throw new AccessDenied("wrongEvent");
    await assistantWrite(ctx, {
      table: "events",
      id: change.docId,
      expectedVersion: change.expectedVersion,
      patch: { theme: mergeTheme(event.theme, change.values) },
      runId: null,
      proposalId: actor.proposalId,
      acceptedBy: actor.acceptedBy,
      forMembershipId: actor.forMembershipId,
      toolCallId: `updateTheme@${change.expectedVersion}`,
    });
    await afterThemeChange(ctx, {
      eventId: change.docId,
      forMembershipId: actor.forMembershipId,
      scope: {
        kind: "proposal",
        proposalId: actor.proposalId,
        acceptedBy: actor.acceptedBy,
      },
    });
    return [change.docId];
  },
};

// ---------------------------------------------------------------------------
// tagInspiration (rule 8)

const NOT_ASKED_TAG =
  "Only tag an Inspiration with a Function the Member's own message names. Suggest the tag in your reply instead; a Member can tap the Function chip on the card.";
const NO_CLEARING_TAG =
  "You can't clear an Inspiration's Function; you can only tag it (rule 8). Say in one line that a Member can clear it with the Function chip on the card.";

export const tagForRun = internalMutation({
  args: {
    ...callRef,
    itemId: v.id("items"),
    functionKey: v.union(v.string(), v.null()),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const g = await gate(ctx, args, "canvas.edit");
    return await once(ctx, callKey(args), async (): Promise<ToolResult> => {
      if (!asked(g.run)) return refusal("notAsked", NOT_ASKED_TAG);
      if (args.functionKey === null)
        return refusal("notAsked", NO_CLEARING_TAG);
      const functions = await functionsOf(ctx, args.eventId);
      const named = functionsNamedIn(await requestText(ctx, g.run), functions);
      if (!named.includes(args.functionKey))
        return refusal("notAsked", NOT_ASKED_TAG);
      const item = await ctx.db.get("items", args.itemId);
      if (item === null || item.eventId !== args.eventId)
        throw new AccessDenied("wrongEvent", "canvas.edit");
      if (item.kind !== "inspiration" || item.deletedAt !== null)
        return refusal("invalid", "That isn't a live Inspiration.");
      const { version } = await assistantWrite(ctx, {
        table: "items",
        id: item._id,
        expectedVersion: args.expectedVersion,
        patch: { functionKey: args.functionKey },
        runId: g.run._id,
        forMembershipId: g.membership._id,
        toolCallId: `${args.toolCallId}#1`,
        fromComment: g.run.source === "comment",
      });
      return { ok: true, itemId: item._id, version };
    });
  },
});

// ---------------------------------------------------------------------------
// The tools

function refOf(ctx: AssistantToolCtx, toolCallId: string): CallRef {
  return {
    runId: ctx.runId,
    eventId: ctx.eventId,
    forMembershipId: ctx.forMembershipId,
    toolCallId,
  };
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const word = z.string().min(1).max(40);

export type ImageToolName =
  "searchStockImages" | "updateTheme" | "tagInspiration";

/**
 * Typed loosely on purpose, as S7's are: `convex/_generated/api.d.ts` walks
 * every export of this module, and the zod-typed tools make that walk too deep.
 */
export type ImageTools = Record<
  ImageToolName,
  Tool<Record<string, never>, ToolResult>
>;

const tools = {
  searchStockImages: createTool<
    { query: string },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      'Search the stock library (hand-picked Pexels photos) by a few decor words, such as "haldi decor" or "marigold mandap". Up to 6 matching photos appear in the Chat as a strip; Members tap the ones they want. Nothing is added until they tap. Never pad with unrelated photos.',
    inputSchema: z.strictObject({ query: z.string().min(1).max(100) }),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.images.searchForRun, {
          ...refOf(ctx, toolCallId),
          query: input.query,
        }),
      ),
  }),

  updateTheme: createTool<
    {
      addPalette: string[];
      removePalette: string[];
      addStyleWords: string[];
      addDecorKeywords: string[];
      fromInspirationId?: string | undefined;
      expectedVersion: number;
    },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      "Change the Event's Theme at once, only when the Member's message asks you to. Colours are # and six hex digits. The Theme keeps at most 5 colours, 4 style words and 6 decor keywords; new ones replace the oldest. expectedVersion is the Event's version from readCanvas. A Theme change you think of yourself goes through propose instead.",
    inputSchema: z.strictObject({
      addPalette: z.array(hex).max(5),
      removePalette: z.array(hex).max(5),
      addStyleWords: z.array(word).max(4),
      addDecorKeywords: z.array(word).max(6),
      fromInspirationId: z.string().min(1).optional(),
      expectedVersion: z.number().int(),
    }),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.images.updateThemeForRun, {
          ...refOf(ctx, toolCallId),
          expectedVersion: input.expectedVersion,
          addPalette: input.addPalette,
          removePalette: input.removePalette,
          addStyleWords: input.addStyleWords,
          addDecorKeywords: input.addDecorKeywords,
          fromInspiration: (input.fromInspirationId ??
            null) as Id<"items"> | null,
        }),
      ),
  }),

  tagInspiration: createTool<
    { itemId: string; functionKey: string | null; expectedVersion: number },
    ToolResult,
    AssistantToolCtx
  >({
    description:
      "Tag one Inspiration with a Function key. Only when the Member's message names that Function (\"find mehendi decor\"); otherwise suggest it in your reply. You can't clear a tag: a Member does that with the chip on the card.",
    inputSchema: z.strictObject({
      itemId: z.string().min(1),
      functionKey: z.string().min(1).nullable(),
      expectedVersion: z.number().int(),
    }),
    execute: async (ctx, input, { toolCallId }): Promise<ToolResult> =>
      guarded(() =>
        ctx.runMutation(internal.assistant.tools.images.tagForRun, {
          ...refOf(ctx, toolCallId),
          itemId: input.itemId as Id<"items">,
          functionKey: input.functionKey,
          expectedVersion: input.expectedVersion,
        }),
      ),
  }),
};

export const imageTools: ImageTools = tools as unknown as ImageTools;

// ---------------------------------------------------------------------------
// Local browser checks only

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

/**
 * What "find some haldi decor ideas" leaves behind, without a model: the
 * request from the person with `email`, a haldi Function if the Event has
 * none, and the real `searchStockImages` mutation's strip. For
 * e2e/inspirations.spec.ts against `bun run dev`; refuses anything but a
 * local deployment.
 */
export const stripForLocalCheck = internalMutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (ctx, { eventId, email }): Promise<ToolResult> => {
    refuseOutsideLocal();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    const membership =
      user &&
      (await ctx.db
        .query("memberships")
        .withIndex("by_event_user", (q) =>
          q.eq("eventId", eventId).eq("userId", user._id),
        )
        .unique());
    if (!membership) throw new Error(`${email} is not in that Event`);
    const functions = await functionsOf(ctx, eventId);
    if (!functions.some((f) => f.key === "haldi")) {
      await ctx.db.insert("eventFunctions", {
        eventId,
        key: "haldi",
        name: "Haldi",
        date: null,
        guests: null,
        assumed: [],
        order: functions.length,
        version: 1,
      });
    }
    const event = (await ctx.db.get("events", eventId))!;
    let threadId = event.agentThreadId;
    if (threadId === null) {
      threadId = await createThread(ctx, components.agent, {
        title: event.name,
      });
      await ctx.db.patch("events", eventId, { agentThreadId: threadId });
    }
    const request = await saveMessage(ctx, components.agent, {
      threadId,
      userId: membership._id,
      prompt: "find some haldi decor ideas",
    });
    await ctx.db.insert("chatAnnotations", {
      eventId,
      messageId: request.messageId,
      authorMembershipId: membership._id,
      dontReply: false,
      mentions: [],
      pointing: [],
      card: null,
    });
    const runId = await ctx.db.insert("runs", {
      eventId,
      requestedBy: membership._id,
      source: "chat",
      messageId: request.messageId,
      commentId: null,
      status: "running",
      stoppedBy: null,
      model: "check",
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
    });
    const result: ToolResult = await ctx.runMutation(
      internal.assistant.tools.images.searchForRun,
      {
        runId,
        eventId,
        forMembershipId: membership._id,
        toolCallId: "check_strip",
        query: "haldi decor",
      },
    );
    await ctx.db.patch("runs", runId, { status: "done", endedAt: Date.now() });
    return result;
  },
});
