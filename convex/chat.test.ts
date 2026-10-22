/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S5 seams (issue #38): sending to the Chat, the run queue, Stop and
// cancelling a queued message. The model never runs here: scheduled functions
// stay parked behind fake timers, and the tests start and end runs through
// the internal functions the scheduler would call.

const T0 = Date.UTC(2026, 9, 23, 10, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

async function insertNote(
  ctx: MutationCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
) {
  const sectionId = await ctx.db.insert("sections", {
    eventId,
    kind: "notes",
    name: "Notes",
    frame: { x: 0, y: 0, w: 400, h: 300 },
    order: 3,
    version: 1,
    deletedAt: null,
  });
  return await ctx.db.insert("items", {
    eventId,
    sectionId,
    kind: "note",
    position: { x: 10, y: 10 },
    size: null,
    functionKey: null,
    createdBy: { kind: "member", membershipId },
    data: { text: "Mom says absolutely no DJ", citations: [] },
    version: 1,
    deletedAt: null,
  });
}

/** The Jaipur wedding from assistant-behavior.md: Rohan and Aditi plan it, Papa views it. */
async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const seeded = await t.run(async (ctx) => {
    const eventId = await insertEvent(ctx, "Meera weds Rohan");
    const rohan = await seedMembership(ctx, { clerkId: "Rohan", eventId });
    const aditi = await seedMembership(ctx, { clerkId: "Aditi", eventId });
    const papa = await seedMembership(ctx, {
      clerkId: "Papa",
      eventId,
      role: "viewer",
    });
    const noteId = await insertNote(ctx, eventId, rohan.membershipId);
    return {
      eventId,
      rohan: rohan.membershipId,
      aditi: aditi.membershipId,
      papa: papa.membershipId,
      noteId,
    };
  });
  return {
    t,
    ...seeded,
    asRohan: t.withIdentity(identityFor("Rohan")),
    asAditi: t.withIdentity(identityFor("Aditi")),
    asPapa: t.withIdentity(identityFor("Papa")),
  };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

async function runOf(s: Setup, runId: Id<"runs">) {
  return await s.t.run((ctx) => ctx.db.get("runs", runId));
}

async function send(
  as: Setup["asRohan"],
  eventId: Id<"events">,
  text: string,
  extra: Partial<{
    dontReply: boolean;
    pointing: { kind: "item"; itemId: Id<"items"> }[];
  }> = {},
) {
  return await as.mutation(api.chat.send, {
    eventId,
    text,
    dontReply: extra.dontReply ?? false,
    pointing: extra.pointing ?? [],
  });
}

async function denialOf(promise: Promise<unknown>) {
  return await promise.then(
    () => null,
    (error: unknown) => (error as { data?: unknown }).data,
  );
}

describe("chat.send", () => {
  it("posts the message and queues a run for it", async () => {
    const s = await setUp();
    const { messageId, runId } = await send(
      s.asRohan,
      s.eventId,
      "Add a mehendi artist, around ₹15,000.",
    );
    expect(runId).not.toBeNull();
    const run = await runOf(s, runId!);
    expect(run).toMatchObject({
      eventId: s.eventId,
      requestedBy: s.rohan,
      source: "chat",
      messageId,
      status: "queued",
    });
    const annotation = await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .unique(),
    );
    expect(annotation).toMatchObject({
      eventId: s.eventId,
      authorMembershipId: s.rohan,
      dontReply: false,
      card: null,
    });
  });

  it("starts no run for a Don't-reply message, but keeps it in the Chat", async () => {
    const s = await setUp();
    const { messageId, runId } = await send(
      s.asRohan,
      s.eventId,
      "Mom says absolutely no DJ",
      { dontReply: true },
    );
    expect(runId).toBeNull();
    const runs = await s.t.run((ctx) => ctx.db.query("runs").collect());
    expect(runs).toEqual([]);
    const annotation = await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .unique(),
    );
    expect(annotation?.dontReply).toBe(true);
  });

  it("always starts a run for a pointed message, even with Don't reply on", async () => {
    const s = await setUp();
    const { runId } = await send(s.asRohan, s.eventId, "What about this?", {
      dontReply: true,
      pointing: [{ kind: "item", itemId: s.noteId }],
    });
    expect(runId).not.toBeNull();
    expect((await runOf(s, runId!))?.status).toBe("queued");
  });

  it("refuses a Viewer", async () => {
    const s = await setUp();
    expect(
      await denialOf(send(s.asPapa, s.eventId, "Can I ask something?")),
    ).toMatchObject({ kind: "AccessDenied", reason: "notAllowed" });
  });

  it("refuses an empty message", async () => {
    const s = await setUp();
    expect(await denialOf(send(s.asRohan, s.eventId, "   "))).toMatchObject({
      kind: "EmptyMessage",
    });
  });

  it("refuses pointing at an Item of another Event", async () => {
    const s = await setUp();
    const otherNote = await s.t.run(async (ctx) => {
      const other = await seedMembership(ctx, { clerkId: "Stranger" });
      return await insertNote(ctx, other.eventId, other.membershipId);
    });
    expect(
      await denialOf(
        send(s.asRohan, s.eventId, "This one?", {
          pointing: [{ kind: "item", itemId: otherNote }],
        }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "wrongEvent" });
  });
});

describe("chat.details", () => {
  it("is null for someone outside the Event and for a mistyped Event ID", async () => {
    const s = await setUp();
    const asStranger = s.t.withIdentity(identityFor("Stranger"));
    await s.t.run((ctx) => seedMembership(ctx, { clerkId: "Stranger" }));
    expect(
      await asStranger.query(api.chat.details, { eventId: s.eventId }),
    ).toBeNull();
    expect(
      await s.asRohan.query(api.chat.details, { eventId: "smoke-test-event" }),
    ).toBeNull();
  });

  it("lets a Viewer read but not post", async () => {
    const s = await setUp();
    const details = await s.asPapa.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(details?.me).toEqual({ membershipId: s.papa, canPost: false });
  });
});

describe("the run queue", () => {
  it("runs two messages sent in the same second in order", async () => {
    const s = await setUp();
    const rohan = await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");

    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, rohan.runId!))?.status).toBe("running");
    expect((await runOf(s, aditi.runId!))?.status).toBe("queued");

    // A second start while Rohan's run is going changes nothing.
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, aditi.runId!))?.status).toBe("queued");

    const details = await s.asAditi.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(details?.runs.find((run) => run._id === aditi.runId)?.status).toBe(
      "queued",
    );

    await s.t.mutation(internal.runs.finish, {
      runId: rohan.runId!,
      outcome: "done",
    });
    expect((await runOf(s, rohan.runId!))?.status).toBe("done");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, aditi.runId!))?.status).toBe("running");
  });

  it("never starts a run whose asker is no longer active", async () => {
    const s = await setUp();
    const rohan = await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");
    // Rohan is switched to Viewer before his run starts.
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.rohan, { role: "viewer" }),
    );
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, rohan.runId!))?.status).toBe("cancelled");
    expect((await runOf(s, aditi.runId!))?.status).toBe("running");
  });
});

describe("runs.stop", () => {
  async function running(s: Setup) {
    const rohan = await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    return { rohanRun: rohan.runId!, aditiRun: aditi.runId! };
  }

  it("lets the asker stop at once", async () => {
    const s = await setUp();
    const { rohanRun } = await running(s);
    await s.asRohan.mutation(api.runs.stop, { runId: rohanRun });
    expect(await runOf(s, rohanRun)).toMatchObject({
      status: "stopping",
      stoppedBy: s.rohan,
    });
  });

  it("refuses another Member before 30 seconds and lets them after; the next queued run starts", async () => {
    const s = await setUp();
    const { rohanRun, aditiRun } = await running(s);
    const startedAt = (await runOf(s, rohanRun))!.startedAt!;

    vi.setSystemTime(startedAt + 29_000);
    expect(
      await denialOf(s.asAditi.mutation(api.runs.stop, { runId: rohanRun })),
    ).toMatchObject({ kind: "StopTooEarly" });
    expect((await runOf(s, rohanRun))?.status).toBe("running");

    vi.setSystemTime(startedAt + 30_000);
    await s.asAditi.mutation(api.runs.stop, { runId: rohanRun });
    expect(await runOf(s, rohanRun)).toMatchObject({
      status: "stopping",
      stoppedBy: s.aditi,
    });

    // The streaming loop notices and ends the run.
    await s.t.mutation(internal.runs.finish, {
      runId: rohanRun,
      outcome: "done",
    });
    expect((await runOf(s, rohanRun))?.status).toBe("stopped");
    const details = await s.asRohan.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(details?.runs.find((run) => run._id === rohanRun)).toMatchObject({
      status: "stopped",
      stoppedByName: "Aditi",
    });

    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, aditiRun))?.status).toBe("running");
  });

  it("ends a stop the streaming loop never answered", async () => {
    const s = await setUp();
    const { rohanRun } = await running(s);
    await s.asRohan.mutation(api.runs.stop, { runId: rohanRun });
    await s.t.mutation(internal.runs.reap, { runId: rohanRun });
    expect((await runOf(s, rohanRun))?.status).toBe("stopped");
  });

  it("refuses a Viewer", async () => {
    const s = await setUp();
    const { rohanRun } = await running(s);
    vi.setSystemTime(T0 + 60_000);
    expect(
      await denialOf(s.asPapa.mutation(api.runs.stop, { runId: rohanRun })),
    ).toMatchObject({ kind: "AccessDenied", reason: "notAllowed" });
  });
});

describe("runs.cancelQueued", () => {
  it("lets the sender remove a queued run", async () => {
    const s = await setUp();
    await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });

    await s.asAditi.mutation(api.runs.cancelQueued, { runId: aditi.runId! });
    expect((await runOf(s, aditi.runId!))?.status).toBe("cancelled");
  });

  it("refuses anyone else", async () => {
    const s = await setUp();
    await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });

    expect(
      await denialOf(
        s.asRohan.mutation(api.runs.cancelQueued, { runId: aditi.runId! }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "notAllowed" });
    expect((await runOf(s, aditi.runId!))?.status).toBe("queued");
  });
});
