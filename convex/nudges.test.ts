/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "@convex-dev/agent/react";
import { buildTimeline } from "../components/chat/timeline";
import type { EntryFields } from "../lib/types/canvas";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildProposeTools } from "./assistant/tools/propose";
import type { ToolResult } from "./assistant/tools/core";
import { createStartingSections } from "./canvas";
import { stubEstimateDeps } from "./estimates";
import { stubCallCount } from "./lib/models";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";
import { memberInsert, memberWrite } from "./lib/write";
import { inspirationLine, nudgeRequest } from "./nudges";

// S17 seams (issue #50): the three Nudges, posted by plain code after a
// Canvas write (the contract's post-write hook) and by the daily sweep, and
// `act`, the Nudge's one button. The worked examples are from
// docs/design/assistant-behavior.md rules 6 to 8 and the "Nudge" example.

/** Wednesday 28 October 2026, 10:00 IST. */
const T0 = Date.UTC(2026, 9, 28, 4, 30, 0);
const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Name = "Meera" | "Rohan" | "Aditi" | "Papa";

function line(label: string, planned: number): EntryFields<"budget"> {
  return {
    label,
    category: null,
    quantity: 1,
    unit: "per_event",
    estimate: null,
    plannedAmount: planned,
    role: "line",
    belowUsualRange: false,
    editedByMember: true,
  };
}

function task(title: string, date: string | null): EntryFields<"timeline"> {
  return {
    title,
    date,
    time: null,
    leadKey: null,
    priority: null,
    late: false,
    note: null,
    vendorCategory: null,
    done: false,
  };
}

/**
 * The Jaipur wedding on a ₹12,00,000 Budget. The lines add up to
 * ₹11,65,000, so the sangeet caterer at ₹2,85,000 instead of ₹2,10,000 puts
 * the Budget ₹40,000 over. Meera, Rohan and Aditi plan; Papa views.
 */
async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    budgetTotal: 1_200_000,
    briefState: "planned",
  });
  const people = {} as Record<Name, Id<"memberships">>;
  for (const name of ["Meera", "Rohan", "Aditi", "Papa"] as const) {
    const { membershipId } = await seedMembership(ctx, {
      clerkId: name,
      eventId,
      role: name === "Papa" ? "viewer" : name === "Meera" ? "owner" : "member",
    });
    await ctx.db.patch("memberships", membershipId, { displayName: name });
    people[name] = membershipId;
  }
  const actor = { kind: "member" as const, membershipId: people.Meera };
  const sections = await createStartingSections(ctx, eventId, actor);
  const item = (kind: "budget" | "timeline", y: number) =>
    ctx.db.insert("items", {
      eventId,
      sectionId: sections.money,
      kind,
      position: { x: 0, y },
      size: null,
      functionKey: null,
      data: { note: null },
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  const budget = await item("budget", 0);
  const timeline = await item("timeline", 600);
  const budgetLine = (order: number, fields: EntryFields<"budget">) =>
    ctx.db.insert("entries", {
      eventId,
      itemId: budget,
      kind: "budget",
      order,
      functionKey: null,
      fields,
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  const caterer = await budgetLine(0, line("Caterer", 210_000));
  const decor = await budgetLine(1, line("Decor", 300_000));
  const venue = await budgetLine(2, line("Venue", 655_000));
  const timelineEntry = (order: number, fields: EntryFields<"timeline">) =>
    ctx.db.insert("entries", {
      eventId,
      itemId: timeline,
      kind: "timeline",
      order,
      functionKey: null,
      fields,
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
  // Friday is two days after T0; the mehendi artist is a week away.
  const bookDecorator = await timelineEntry(
    0,
    task("Book decorator", "2026-11-05"),
  );
  const mehendiArtist = await timelineEntry(
    1,
    task("Book mehendi artist", "2026-11-04"),
  );
  const note = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.notes,
    kind: "note",
    position: { x: 0, y: 0 },
    size: null,
    functionKey: null,
    data: { text: "Ask about parking", citations: [] },
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  return {
    eventId,
    people,
    sections,
    budget,
    timeline,
    caterer,
    decor,
    venue,
    bookDecorator,
    mehendiArtist,
    note,
  };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const w = await t.run(seedWedding);
  return {
    t,
    ...w,
    as: (name: Name) => t.withIdentity(identityFor(name)),
  };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

/** The functions waiting in the scheduler, by name. */
const scheduledNames = (s: Setup) =>
  s.t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.state.kind === "pending")
      .map((job) => job.name),
  );
const checksScheduled = async (s: Setup) =>
  (await scheduledNames(s)).filter((name) => name === "nudges:check").length;

/** Runs everything the scheduler holds, as the deployment would. */
const settle = (s: Setup) => s.t.finishAllScheduledFunctions(vi.runAllTimers);

/** The text of every Nudge posted in the Chat, oldest first. */
async function nudgeLines(s: Setup): Promise<string[]> {
  const annotations = await s.t.run((ctx) =>
    ctx.db
      .query("chatAnnotations")
      .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
      .collect(),
  );
  const nudges = annotations.filter((a) => a.card?.kind === "nudge");
  if (nudges.length === 0) return [];
  const docs = await s.t.query(components.agent.messages.getMessagesByIds, {
    messageIds: nudges.map((a) => a.messageId),
  });
  return docs.map((doc) => doc?.text ?? "");
}

const nudgeRows = (s: Setup) =>
  s.t.run((ctx) => ctx.db.query("nudges").collect());

const typeCaterer = (s: Setup, amount: number, who: Name = "Rohan") =>
  s.as(who).mutation(api.entries.update, {
    entryId: s.caterer,
    patch: { kind: "budget", plannedAmount: amount },
  });

/** Calls `propose` as the Agent would, for a run already running. */
async function propose(
  s: Setup,
  runId: Id<"runs">,
  forMembershipId: Id<"memberships">,
  input: unknown,
): Promise<ToolResult> {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  const ctx = {
    runQuery: s.t.query as Call,
    runMutation: s.t.mutation as Call,
    runAction: s.t.action as Call,
    runId,
    eventId: s.eventId,
    forMembershipId,
  };
  const tools = buildProposeTools({
    estimateDeps: { ...stubEstimateDeps, now: () => T0 },
  });
  const tool = { ...tools.propose, ctx } as unknown as {
    execute: (input: unknown, options: unknown) => Promise<ToolResult>;
  };
  return await tool.execute(input, { toolCallId: "toolu_p1", messages: [] });
}

/** A JPEG's first bytes: enough for `addUpload`'s type check. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

/**
 * A Member uploads a photo through `api.inspirations.addUpload`, the only
 * place that knows its arguments, so a change to them is made here.
 */
async function uploadPhoto(s: Setup, who: Name) {
  await s.t.run((ctx) =>
    ctx.db.patch("events", s.eventId, { uploadRightsOn: true }),
  );
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(new Blob([JPEG], { type: "image/jpeg" })),
  );
  return await s.as(who).action(api.inspirations.addUpload, {
    eventId: s.eventId,
    fileId,
    rightsTicked: false,
    palette: [],
  });
}

// ---------------------------------------------------------------------------

describe("the post-write hook", () => {
  it("schedules the check when a Member types a budget line's amount, and the index keeps it to one Nudge", async () => {
    const s = await setUp();
    await typeCaterer(s, 285_000);
    expect(await checksScheduled(s)).toBe(1);
    await settle(s);
    await typeCaterer(s, 290_000);
    expect(await checksScheduled(s)).toBe(1);
    await settle(s);
    expect(await nudgeRows(s)).toHaveLength(1);
  });

  it("schedules the check when a Member edits or ticks a Timeline Entry", async () => {
    const s = await setUp();
    await s.as("Aditi").mutation(api.entries.update, {
      entryId: s.mehendiArtist,
      patch: { kind: "timeline", date: "2026-10-29" },
    });
    expect(await checksScheduled(s)).toBe(1);
    await settle(s);
    await s
      .as("Aditi")
      .mutation(api.entries.tick, { entryId: s.mehendiArtist, done: true });
    expect(await checksScheduled(s)).toBe(1);
    await settle(s);
    // The mehendi artist was due tomorrow and is now ticked: one Nudge from
    // the first check, none after the tick.
    const rows = await nudgeRows(s);
    expect(rows.map((r) => r.trigger)).toEqual(["dueSoon"]);
  });

  it("schedules the check when the Event's Budget total changes", async () => {
    const s = await setUp();
    // A Brief edit or an accepted setBudgetTotal Proposal writes it this way.
    await s.t.run((ctx) =>
      memberWrite(ctx, {
        table: "events",
        id: s.eventId,
        patch: { budgetTotal: 1_100_000 },
        actor: { kind: "member", membershipId: s.people.Meera },
      }),
    );
    expect(await checksScheduled(s)).toBe(1);
  });

  it("schedules the check when a Member adds an Inspiration from the library or an upload", async () => {
    const s = await setUp();
    await s.as("Meera").mutation(api.inspirations.addFromLibrary, {
      eventId: s.eventId,
      pexelsId: 31002035,
    });
    expect(await checksScheduled(s)).toBe(1);
    await settle(s);

    await uploadPhoto(s, "Aditi");
    expect(await checksScheduled(s)).toBe(1);
  });

  it("schedules the check when an accepted Proposal changes a budget line, and the index keeps it to one Nudge", async () => {
    const s = await setUp();
    // Rohan asks in the Chat; his run is started as the scheduler would start it.
    const { runId } = await s.as("Rohan").mutation(api.chat.send, {
      eventId: s.eventId,
      text: "Make the caterer ₹2,85,000.",
      dontReply: false,
      pointing: [],
    });
    await s.t.run((ctx) =>
      ctx.db.patch("runs", runId!, { status: "running", startedAt: T0 }),
    );
    const result = await propose(s, runId!, s.people.Rohan, {
      summary: "Caterer at ₹2,85,000",
      changes: [
        {
          op: "updateEntry",
          entryId: s.caterer,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { memberStated: 285_000 } },
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const { proposalId } = result as unknown as {
      proposalId: Id<"proposals">;
    };
    expect(await checksScheduled(s)).toBe(0);
    await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(await checksScheduled(s)).toBe(1);
    await s.t.run(async (ctx) => {
      // A second, identical check (another write in the same second) posts nothing more.
      await ctx.scheduler.runAfter(0, internal.nudges.check, {
        eventId: s.eventId,
      });
    });
    await s.t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
    expect(await nudgeLines(s)).toEqual([
      "The Budget is now ₹40,000 over. Want me to suggest cuts?",
    ]);
  });

  // S12 (#45) is still open, so its Quote path is tested through the typed
  // amount above (IMPLEMENTATION_PLAN.md section 10). Add this once S12 merges.
  it.skip("schedules the check when api.quotes.useAsAmount sets a line's amount from a Quote", () => {});

  it("schedules nothing for a Note edit or a write to anything else", async () => {
    const s = await setUp();
    await s
      .as("Aditi")
      .mutation(api.notes.update, { itemId: s.note, text: "Ask about valet" });
    await s.as("Meera").mutation(api.events.rename, {
      eventId: s.eventId,
      name: "Meera and Rohan's wedding",
    });
    expect(await checksScheduled(s)).toBe(0);
  });
});

describe("the Budget Nudge", () => {
  it('posts "The Budget is now ₹40,000 over. Want me to suggest cuts?" once that IST day', async () => {
    const s = await setUp();
    await typeCaterer(s, 285_000);
    await settle(s);
    expect(await nudgeLines(s)).toEqual([
      "The Budget is now ₹40,000 over. Want me to suggest cuts?",
    ]);

    // Later the same IST day, another over-budget write posts nothing.
    vi.setSystemTime(T0 + 5 * 60 * MINUTE);
    await typeCaterer(s, 300_000, "Aditi");
    await settle(s);
    expect(await nudgeLines(s)).toHaveLength(1);
  });

  it("starts its own turn in the Chat, so it never merges into the message before it", async () => {
    const s = await setUp();
    await s.t.mutation(internal.chat.postSystem, {
      eventId: s.eventId,
      card: { kind: "system", id: null },
      text: "An earlier line from Utsavvy.",
    });
    await typeCaterer(s, 285_000);
    await settle(s);
    const threadId = await s.t.run(
      async (ctx) => (await ctx.db.get("events", s.eventId))!.agentThreadId!,
    );
    const page = await s.t.query(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId,
        order: "asc",
        paginationOpts: { numItems: 10, cursor: null },
      },
    );
    const [earlier, nudge] = page.page;
    expect(nudge?.text).toBe(
      "The Budget is now ₹40,000 over. Want me to suggest cuts?",
    );
    expect(nudge!.order).toBeGreaterThan(earlier!.order);
  });

  it("counts days in IST, not UTC", async () => {
    const s = await setUp();
    // 23:50 IST on Wednesday (18:20 UTC) and 00:10 IST on Thursday (18:40
    // UTC) fall on the same UTC day but on two IST days.
    vi.setSystemTime(Date.UTC(2026, 9, 28, 18, 20));
    await typeCaterer(s, 285_000);
    await settle(s);
    vi.setSystemTime(Date.UTC(2026, 9, 28, 18, 40));
    await typeCaterer(s, 290_000);
    await settle(s);
    const rows = await nudgeRows(s);
    expect(rows.map((r) => r.dayIst)).toEqual(["2026-10-28", "2026-10-29"]);
    expect(await nudgeLines(s)).toEqual([
      "The Budget is now ₹40,000 over. Want me to suggest cuts?",
      "The Budget is now ₹45,000 over. Want me to suggest cuts?",
    ]);
  });

  it("posts nothing while the Budget is within its total", async () => {
    const s = await setUp();
    await typeCaterer(s, 240_000);
    await settle(s);
    expect(await nudgeLines(s)).toEqual([]);
  });
});

describe("the due-soon Nudge", () => {
  it('posts "Book decorator is due Friday and still open." for an unticked Entry due within 3 days', async () => {
    const s = await setUp();
    await s.as("Aditi").mutation(api.entries.update, {
      entryId: s.bookDecorator,
      patch: { kind: "timeline", date: "2026-10-30" },
    });
    await settle(s);
    expect(await nudgeLines(s)).toEqual([
      "Book decorator is due Friday and still open.",
    ]);
  });

  it("leaves ticked Entries and Entries due later alone", async () => {
    const s = await setUp();
    await s
      .as("Aditi")
      .mutation(api.entries.tick, { entryId: s.bookDecorator, done: true });
    await s.as("Aditi").mutation(api.entries.update, {
      entryId: s.bookDecorator,
      patch: { kind: "timeline", date: "2026-10-30" },
    });
    await s.as("Aditi").mutation(api.entries.update, {
      entryId: s.mehendiArtist,
      patch: { kind: "timeline", date: "2026-11-01" },
    });
    await settle(s);
    expect(await nudgeLines(s)).toEqual([]);
  });

  it("is found by the daily sweep without any write, once a day", async () => {
    const s = await setUp();
    await s.t.run(async (ctx) => {
      const entry = await ctx.db.get("entries", s.bookDecorator);
      if (entry?.kind !== "timeline") throw new Error("no Entry");
      await ctx.db.patch("entries", s.bookDecorator, {
        fields: { ...entry.fields, date: "2026-10-28" },
      });
    });
    await s.t.mutation(internal.nudges.dueSoonSweep, {});
    await settle(s);
    await s.t.mutation(internal.nudges.dueSoonSweep, {});
    await settle(s);
    expect(await nudgeLines(s)).toEqual([
      "Book decorator is due today and still open.",
    ]);
  });
});

describe("the new Inspiration Nudge", () => {
  async function addInspiration(
    s: Setup,
    who: Name,
    seen: string | null,
    groupLabel: string | null = null,
  ) {
    return await s.t.run(async (ctx) => {
      const actor = { kind: "member" as const, membershipId: s.people[who] };
      const { id } = await memberInsert(ctx, {
        table: "items",
        actor,
        groupLabel,
        value: {
          eventId: s.eventId,
          sectionId: s.sections.inspirations,
          kind: "inspiration",
          position: { x: 0, y: 0 },
          size: null,
          functionKey: null,
          createdBy: actor,
          data: {
            source: {
              kind: "upload",
              fileId: await ctx.storage.store(new Blob(["x"])),
              fromReference: null,
              remixRightsTicked: false,
            },
            addedBy: s.people[who],
            memberNote: null,
            seen:
              seen === null
                ? null
                : { description: seen, palette: [], decorKeywords: [] },
          },
        },
      });
      return id;
    });
  }

  it('posts "Meera added a pastel lehenga photo. Want me to update the Theme to match?"', async () => {
    const s = await setUp();
    await addInspiration(s, "Meera", "Pastel lehenga");
    await settle(s);
    expect(await nudgeLines(s)).toEqual([
      "Meera added a pastel lehenga photo. Want me to update the Theme to match?",
    ]);
  });

  it('words an upload "Aditi added a photo.": the Nudge goes out before the photo is described', async () => {
    const s = await setUp();
    await uploadPhoto(s, "Aditi");
    await settle(s);
    expect(await nudgeLines(s)).toEqual([
      "Aditi added a photo. Want me to update the Theme to match?",
    ]);
  });

  it("leaves out photos the vibe pick added, which already set the Theme", async () => {
    const s = await setUp();
    await addInspiration(s, "Meera", "Pastel lehenga", "The vibe pick");
    await settle(s);
    expect(await nudgeLines(s)).toEqual([]);
  });

  it("words a long description, no description and a library photo plainly", () => {
    expect(
      inspirationLine("Rohan", {
        description: "A pastel pink mandap with lounge seating outdoors.",
        kind: "photo",
      }),
    ).toBe(
      "Rohan added a photo of a pastel pink mandap with lounge seating outdoors. Want me to update the Theme to match?",
    );
    expect(inspirationLine("Rohan", { description: null, kind: "photo" })).toBe(
      "Rohan added a photo. Want me to update the Theme to match?",
    );
    expect(
      inspirationLine("Aditi", { description: "orange haldi", kind: "photo" }),
    ).toBe(
      "Aditi added an orange haldi photo. Want me to update the Theme to match?",
    );
  });
});

describe("a Nudge", () => {
  it("makes no model call and changes nothing on the Canvas", async () => {
    const s = await setUp();
    await typeCaterer(s, 285_000);
    const calls = stubCallCount();
    const changes = await s.t.run(
      async (ctx) => (await ctx.db.query("changes").collect()).length,
    );
    await settle(s);
    await s.t.mutation(internal.nudges.dueSoonSweep, {});
    await settle(s);
    expect(await nudgeLines(s)).toHaveLength(1);
    expect(stubCallCount()).toBe(calls);
    expect(
      await s.t.run(
        async (ctx) => (await ctx.db.query("changes").collect()).length,
      ),
    ).toBe(changes);
  });
});

describe("act", () => {
  async function overBudget(s: Setup): Promise<Id<"nudges">> {
    await typeCaterer(s, 285_000);
    await settle(s);
    const [row] = await nudgeRows(s);
    return row!._id;
  }

  it("sends the ready-made request as the Member who tapped it, and changes nothing itself", async () => {
    const s = await setUp();
    const nudgeId = await overBudget(s);
    const changes = await s.t.run(
      async (ctx) => (await ctx.db.query("changes").collect()).length,
    );

    const { runId, messageId } = await s
      .as("Meera")
      .mutation(api.nudges.act, { nudgeId });

    const run = await s.t.run((ctx) => ctx.db.get("runs", runId));
    expect(run).toMatchObject({
      requestedBy: s.people.Meera,
      source: "nudge",
      messageId,
      status: "queued",
    });
    const annotation = await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .unique(),
    );
    expect(annotation?.authorMembershipId).toBe(s.people.Meera);
    const [doc] = await s.t.query(components.agent.messages.getMessagesByIds, {
      messageIds: [messageId],
    });
    expect(doc?.text).toBe(nudgeRequest("budgetOver"));
    expect(
      await s.t.run(
        async (ctx) => (await ctx.db.query("changes").collect()).length,
      ),
    ).toBe(changes);
  });

  it("sends one request however many taps, and the card says who asked", async () => {
    const s = await setUp();
    const nudgeId = await overBudget(s);
    const first = await s.as("Meera").mutation(api.nudges.act, { nudgeId });
    const second = await s.as("Aditi").mutation(api.nudges.act, { nudgeId });
    expect(second).toEqual(first);
    const card = await s.as("Rohan").query(api.nudges.card, { nudgeId });
    expect(card).toMatchObject({
      trigger: "budgetOver",
      button: "Suggest cuts",
      askedBy: "Meera",
      canAct: true,
    });
  });

  it("is refused for a Viewer, whose card shows no button", async () => {
    const s = await setUp();
    const nudgeId = await overBudget(s);
    await expect(
      s.as("Papa").mutation(api.nudges.act, { nudgeId }),
    ).rejects.toThrow();
    const card = await s.as("Papa").query(api.nudges.card, { nudgeId });
    expect(card).toMatchObject({ canAct: false, askedBy: null });
  });

  it("points the due-soon request at its Entry, without the Entry's own words", async () => {
    const s = await setUp();
    await s.as("Aditi").mutation(api.entries.update, {
      entryId: s.bookDecorator,
      patch: { kind: "timeline", date: "2026-10-30" },
    });
    await settle(s);
    const [row] = await nudgeRows(s);
    const { messageId } = await s
      .as("Rohan")
      .mutation(api.nudges.act, { nudgeId: row!._id });
    const annotation = await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .unique(),
    );
    expect(annotation?.pointing).toEqual([
      { kind: "entry", itemId: s.timeline, entryId: s.bookDecorator },
    ]);
    const [doc] = await s.t.query(components.agent.messages.getMessagesByIds, {
      messageIds: [messageId],
    });
    expect(doc?.text).toBe(nudgeRequest("dueSoon"));
    expect(doc?.text).not.toContain("decorator");
  });
});

describe("postSystem (contract change for S17)", () => {
  it("gives a line without promptMessageId its own turn, so the Chat shows its card instead of merging it", async () => {
    const s = await setUp();
    // An Utsavvy line, then a stock strip posted the way a Comment run posts
    // it (no Chat message to join).
    await s.t.mutation(internal.chat.postSystem, {
      eventId: s.eventId,
      card: { kind: "system", id: null },
      text: "Utsavvy answered Aditi in a Comment on Caterer",
    });
    await s.t.mutation(internal.chat.postSystem, {
      eventId: s.eventId,
      card: { kind: "stockStrip", id: null },
      text: "A few mehendi decor ideas from the library.",
    });

    const asMeera = s.as("Meera");
    const details = (await asMeera.query(api.chat.details, {
      eventId: s.eventId,
    }))!;
    const page = await asMeera.query(api.chat.list, {
      eventId: s.eventId,
      threadId: details.threadId!,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const messages = (page.page as UIMessage[]).sort(
      (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
    );
    // useUIMessages combines assistant messages that share an order.
    expect(new Set(messages.map((m) => m.order)).size).toBe(2);
    const rows = buildTimeline(messages, details);
    expect(
      rows.map((row) =>
        row.kind === "system" ? row.annotation.card?.kind : row.kind,
      ),
    ).toEqual(["system", "stockStrip"]);
  });
});
