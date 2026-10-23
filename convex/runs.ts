import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";

/**
 * The run queue and Stop (IMPLEMENTATION_PLAN.md section 4.5,
 * assistant-behavior.md rules 14 and 21). One run at a time per Event: a
 * Member's message to the Assistant inserts a `queued` run, and
 * `internal.runs.startNext` starts the oldest queued run whenever none is
 * running. The streaming action (`internal.assistant.agent.respond`) checks the
 * run's status while it streams and ends it through `internal.runs.finish`.
 */

/** Any Member may stop someone else's run once it has run this long. */
export const STOP_ANYONE_AFTER_MS = 30_000;
/** A stop the streaming loop hasn't answered by then is ended here instead. */
const REAP_STOPPING_AFTER_MS = 20_000;
/**
 * A run still `running` after this is treated as failed: Convex actions stop
 * after 10 minutes, so its streaming loop is gone and the queue must move on.
 */
const STALE_RUN_AFTER_MS = 11 * 60_000;

type RunSource = Doc<"runs">["source"];

/**
 * Queues a run for a Member's request and asks the scheduler to start the next
 * one. Starting is idempotent, so a second request in the same second simply
 * waits behind the first.
 */
export async function enqueueRun(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    requestedBy: Id<"memberships">;
    source: RunSource;
    messageId: string | null;
    commentId: Id<"comments"> | null;
  },
): Promise<Id<"runs">> {
  const runId = await ctx.db.insert("runs", {
    ...args,
    status: "queued",
    stoppedBy: null,
    // Filled in by the streaming action with the model that actually answers.
    model: "",
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
  });
  await ctx.scheduler.runAfter(0, internal.runs.startNext, {
    eventId: args.eventId,
  });
  return runId;
}

/** One Member may have this many messages waiting in the queue at once. */
export const MAX_QUEUED_PER_MEMBER = 3;

/** Refuses a request when its sender already has a full share of the queue. */
export async function checkQueueRoom(
  ctx: MutationCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
): Promise<void> {
  let waiting = 0;
  for await (const run of ctx.db
    .query("runs")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", "queued"),
    )) {
    if (run.requestedBy !== membershipId) continue;
    waiting += 1;
    if (waiting >= MAX_QUEUED_PER_MEMBER) {
      throw new ConvexError({
        kind: "TooManyQueued",
        max: MAX_QUEUED_PER_MEMBER,
      });
    }
  }
}

/** Whether a membership may still have the Assistant answer it. */
function canAsk(membership: Doc<"memberships"> | null): boolean {
  return (
    membership !== null &&
    membership.status === "active" &&
    !membership.blocked &&
    can(membership.role, "chat.post")
  );
}

async function activeRun(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<Doc<"runs"> | null> {
  for (const status of ["running", "stopping"] as const) {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", eventId).eq("status", status),
      )
      .first();
    if (run !== null) return run;
  }
  return null;
}

/**
 * Starts the oldest queued run of the Event when none is running. Never starts
 * a run whose asker is no longer active, or is no longer allowed to ask (for
 * example switched to Viewer): such runs are cancelled and skipped.
 */
export const startNext = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.union(v.id("runs"), v.null()),
  handler: async (ctx, { eventId }) => {
    const now = Date.now();
    const current = await activeRun(ctx, eventId);
    if (current !== null) {
      const stale =
        current.status === "running" &&
        current.startedAt !== null &&
        now - current.startedAt > STALE_RUN_AFTER_MS;
      if (!stale) return null;
      await ctx.db.patch("runs", current._id, {
        status: "failed",
        endedAt: now,
      });
    }

    for await (const run of ctx.db
      .query("runs")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", eventId).eq("status", "queued"),
      )) {
      const asker = await ctx.db.get("memberships", run.requestedBy);
      if (!canAsk(asker)) {
        await ctx.db.patch("runs", run._id, {
          status: "cancelled",
          endedAt: now,
        });
        continue;
      }
      await ctx.db.patch("runs", run._id, {
        status: "running",
        startedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.assistant.agent.respond, {
        runId: run._id,
      });
      // The watchdog: a streaming action that crashes or is abandoned must not
      // leave the Event "replying" with its queue stuck behind it.
      await ctx.scheduler.runAfter(
        STALE_RUN_AFTER_MS,
        internal.runs.reapStale,
        {
          runId: run._id,
        },
      );
      return run._id;
    }
    return null;
  },
});

/**
 * Stops a running reply. The Member who asked can stop it at once; any other
 * Member once it has run for 30 seconds. Sets the run to `stopping`; the
 * streaming loop sees it within a second, ends the reply and the run becomes
 * `stopped`. Changes already made stay.
 */
export const stop = mutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null) throw new ConvexError({ kind: "NotFound", what: "run" });
    const { membership } = await requireAccess(
      ctx,
      run.eventId,
      "proposal.decide",
    );
    if (run.status === "stopping") return null;
    if (run.status !== "running") {
      throw new ConvexError({ kind: "RunNotRunning", status: run.status });
    }
    const now = Date.now();
    const ranFor = now - (run.startedAt ?? now);
    if (run.requestedBy !== membership._id && ranFor < STOP_ANYONE_AFTER_MS) {
      throw new ConvexError({
        kind: "StopTooEarly",
        secondsLeft: Math.ceil((STOP_ANYONE_AFTER_MS - ranFor) / 1000),
      });
    }
    await ctx.db.patch("runs", runId, {
      status: "stopping",
      stoppedBy: membership._id,
    });
    await ctx.scheduler.runAfter(REAP_STOPPING_AFTER_MS, internal.runs.reap, {
      runId,
    });
    return null;
  },
});

/** The sender removes their own queued message from the queue before it starts. */
export const cancelQueued = mutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null) throw new ConvexError({ kind: "NotFound", what: "run" });
    const { membership } = await requireAccess(ctx, run.eventId, "chat.post");
    if (run.requestedBy !== membership._id) {
      throw new AccessDenied("notAllowed", "chat.post");
    }
    if (run.status !== "queued") {
      throw new ConvexError({ kind: "RunNotQueued", status: run.status });
    }
    await ctx.db.patch("runs", runId, {
      status: "cancelled",
      endedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Ends a run from the streaming action. A run someone stopped ends as
 * `stopped` whatever the outcome, then the next queued run starts.
 */
export const finish = internalMutation({
  args: {
    runId: v.id("runs"),
    outcome: v.union(v.literal("done"), v.literal("failed")),
  },
  returns: v.null(),
  handler: async (ctx, { runId, outcome }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null) return null;
    if (run.status !== "running" && run.status !== "stopping") return null;
    await ctx.db.patch("runs", runId, {
      status: run.status === "stopping" ? "stopped" : outcome,
      endedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.runs.startNext, {
      eventId: run.eventId,
    });
    return null;
  },
});

/** Ends a stop that the streaming loop never answered (it crashed or timed out). */
export const reap = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null || run.status !== "stopping") return null;
    await ctx.db.patch("runs", runId, {
      status: "stopped",
      endedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.runs.startNext, {
      eventId: run.eventId,
    });
    return null;
  },
});

/**
 * Fails a run still `running` when its watchdog fires: its streaming action
 * is gone (Convex actions stop after 10 minutes). The Chat then shows the
 * failed-run notice and the next queued run starts.
 */
export const reapStale = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null || run.status !== "running") return null;
    await ctx.db.patch("runs", runId, {
      status: "failed",
      endedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.runs.startNext, {
      eventId: run.eventId,
    });
    return null;
  },
});

/** Records the model that answered, once its first token arrives. */
export const setModel = internalMutation({
  args: { runId: v.id("runs"), model: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, model }) => {
    const run = await ctx.db.get("runs", runId);
    if (run === null || run.model === model) return null;
    await ctx.db.patch("runs", runId, { model });
    return null;
  },
});

/** The run's status, which the streaming action checks while it streams. */
export const status = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("stopping"),
    v.literal("done"),
    v.literal("stopped"),
    v.literal("failed"),
    v.literal("cancelled"),
    v.null(),
  ),
  handler: async (ctx, { runId }) => {
    return (await ctx.db.get("runs", runId))?.status ?? null;
  },
});
