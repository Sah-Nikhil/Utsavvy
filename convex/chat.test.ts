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
    // Past its first Brief, so a Chat message asks Utsavvy.
    await ctx.db.patch("events", eventId, { briefState: "summary" });
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
        .withIndex("by_message", (q) => q.eq("messageId", messageId!))
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
        .withIndex("by_message", (q) => q.eq("messageId", messageId!))
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

  it("marks a Member whose name looks like the Assistant's (L4)", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.rohan, {
        displayName: "Utsavvy for Meera",
      }),
    );
    await send(s.asRohan, s.eventId, "Plan the sangeet", { dontReply: true });
    const details = await s.asAditi.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(details?.annotations.at(-1)?.authorName).toBe(
      "Utsavvy for Meera (a Member)",
    );
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

describe("chat.list", () => {
  it("refuses another Event's thread to a Member of a different Event", async () => {
    const s = await setUp();
    await send(s.asRohan, s.eventId, "Plan the sangeet");
    const threadId = (await s.asRohan.query(api.chat.details, {
      eventId: s.eventId,
    }))!.threadId!;
    // Meera plans her own Event and tries to read Rohan's thread through it.
    const meeraEvent = await s.t.run(async (ctx) => {
      const { eventId } = await seedMembership(ctx, { clerkId: "Meera" });
      return eventId;
    });
    const asMeera = s.t.withIdentity(identityFor("Meera"));
    expect(
      await denialOf(
        asMeera.query(api.chat.list, {
          eventId: meeraEvent,
          threadId,
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "wrongEvent" });
    expect(
      await denialOf(
        asMeera.query(api.chat.list, {
          eventId: s.eventId,
          threadId,
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "notAMember" });
  });

  it("lets a Viewer read the Chat", async () => {
    const s = await setUp();
    await send(s.asRohan, s.eventId, "Plan the sangeet");
    const threadId = (await s.asPapa.query(api.chat.details, {
      eventId: s.eventId,
    }))!.threadId!;
    const page = await s.asPapa.query(api.chat.list, {
      eventId: s.eventId,
      threadId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((message) => message.text)).toEqual([
      "Plan the sangeet",
    ]);
  });
});

describe("chat.send limits", () => {
  it("refuses pointing at more than 5 things at once", async () => {
    const s = await setUp();
    const target = { kind: "item" as const, itemId: s.noteId };
    expect(
      await denialOf(
        send(s.asRohan, s.eventId, "These?", {
          pointing: Array.from({ length: 6 }, () => target),
        }),
      ),
    ).toMatchObject({ kind: "TooManyPointed", max: 5 });
  });

  it("refuses a pointed passage longer than 500 characters", async () => {
    const s = await setUp();
    expect(
      await denialOf(
        s.asRohan.mutation(api.chat.send, {
          eventId: s.eventId,
          text: "This bit?",
          dontReply: false,
          pointing: [
            {
              kind: "passage",
              itemId: s.noteId,
              entryId: null,
              field: "text",
              start: 0,
              end: 501,
              quote: "a".repeat(501),
            },
          ],
        }),
      ),
    ).toMatchObject({ kind: "QuoteTooLong", max: 500 });
  });

  it("refuses a pointed passage whose field name is over 64 characters", async () => {
    const s = await setUp();
    const passage = (field: string) => ({
      kind: "passage" as const,
      itemId: s.noteId,
      entryId: null,
      field,
      start: 0,
      end: 3,
      quote: "Mom",
    });
    expect(
      await denialOf(
        s.asRohan.mutation(api.chat.send, {
          eventId: s.eventId,
          text: "This bit?",
          dontReply: false,
          pointing: [passage("f".repeat(65))],
        }),
      ),
    ).toMatchObject({ kind: "FieldTooLong", max: 64 });
    const { runId } = await s.asRohan.mutation(api.chat.send, {
      eventId: s.eventId,
      text: "This bit?",
      dontReply: false,
      pointing: [passage("f".repeat(64))],
    });
    expect(runId).not.toBeNull();
  });

  it("refuses pointing at a deleted Entry", async () => {
    const s = await setUp();
    const entryId = await s.t.run((ctx) =>
      ctx.db.insert("entries", {
        eventId: s.eventId,
        itemId: s.noteId,
        kind: "checklist",
        order: 0,
        functionKey: null,
        assumed: [],
        createdBy: { kind: "member", membershipId: s.rohan },
        version: 1,
        deletedAt: 1,
        fields: {
          vendorCategory: "decorator",
          freeLabel: null,
          functionKeys: [],
          bookByEntryId: null,
          budgetEntryIds: [],
        },
      }),
    );
    expect(
      await denialOf(
        s.asRohan.mutation(api.chat.send, {
          eventId: s.eventId,
          text: "This one?",
          dontReply: false,
          pointing: [{ kind: "entry", itemId: s.noteId, entryId }],
        }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "wrongEvent" });
  });

  it("keeps at most 3 queued messages per Member", async () => {
    const s = await setUp();
    for (const text of ["One", "Two", "Three"]) {
      await send(s.asRohan, s.eventId, text);
    }
    expect(await denialOf(send(s.asRohan, s.eventId, "Four"))).toMatchObject({
      kind: "TooManyQueued",
      max: 3,
    });
    // A Don't-reply message queues nothing, so it still goes through.
    const { runId } = await send(s.asRohan, s.eventId, "For the family", {
      dontReply: true,
    });
    expect(runId).toBeNull();
    // Someone else's request isn't held up by Rohan's.
    expect((await send(s.asAditi, s.eventId, "Five")).runId).not.toBeNull();
  });
});

describe("a run nobody finished", () => {
  it("is watched from the moment it starts", async () => {
    const s = await setUp();
    const { runId } = await send(s.asRohan, s.eventId, "Plan the sangeet");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    const watchdogs = await s.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name.includes("reapStale"),
      ),
    );
    expect(watchdogs).toHaveLength(1);
    expect(watchdogs[0]?.args).toEqual([{ runId }]);
  });

  it("is failed by the watchdog, and the next queued run starts", async () => {
    const s = await setUp();
    const rohan = await send(s.asRohan, s.eventId, "Plan the sangeet");
    const aditi = await send(s.asAditi, s.eventId, "Find a mehendi artist");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });

    await s.t.mutation(internal.runs.reapStale, { runId: rohan.runId! });
    expect((await runOf(s, rohan.runId!))?.status).toBe("failed");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    expect((await runOf(s, aditi.runId!))?.status).toBe("running");
  });

  it("leaves a run that already ended alone", async () => {
    const s = await setUp();
    const { runId } = await send(s.asRohan, s.eventId, "Plan the sangeet");
    await s.t.mutation(internal.runs.startNext, { eventId: s.eventId });
    await s.t.mutation(internal.runs.finish, {
      runId: runId!,
      outcome: "done",
    });
    await s.t.mutation(internal.runs.reapStale, { runId: runId! });
    expect((await runOf(s, runId!))?.status).toBe("done");
  });
});

describe("older messages keep their details (L9)", () => {
  it("has no window to fill in while the Chat is short", async () => {
    const s = await setUp();
    await send(s.asRohan, s.eventId, "Plan the sangeet");
    const details = await s.asAditi.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(details?.historyFrom).toBeNull();
  });

  it("fills in the author and run of a message older than the details' window", async () => {
    const s = await setUp();
    const first = await send(s.asRohan, s.eventId, "Who handles the haldi?");
    for (let i = 1; i <= 300; i += 1) {
      vi.setSystemTime(T0 + i * 1000);
      await send(s.asAditi, s.eventId, `note ${i}`, { dontReply: true });
    }
    const details = await s.asAditi.query(api.chat.details, {
      eventId: s.eventId,
    });
    expect(
      details?.annotations.some((a) => a.messageId === first.messageId),
    ).toBe(false);
    expect(details?.historyFrom).not.toBeNull();

    const history = await s.asAditi.query(api.chat.history, {
      eventId: s.eventId,
      since: T0,
      until: details!.historyFrom!,
    });
    expect(
      history?.annotations.find((a) => a.messageId === first.messageId),
    ).toMatchObject({ authorName: "Rohan", dontReply: false });
    expect(history?.runs.find((run) => run._id === first.runId)).toMatchObject({
      requestedByName: "Rohan",
      status: "queued",
    });
  }, 120_000);

  it("shows nothing to someone outside the Event", async () => {
    const s = await setUp();
    await s.t.run((ctx) => seedMembership(ctx, { clerkId: "Stranger" }));
    const asStranger = s.t.withIdentity(identityFor("Stranger"));
    expect(
      await asStranger.query(api.chat.history, {
        eventId: s.eventId,
        since: T0,
        until: T0 + 1000,
      }),
    ).toBeNull();
  });
});
