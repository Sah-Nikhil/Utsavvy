/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entryAmount } from "../components/items/budget/rollup";
import { referenceTableBasis } from "../lib/pricing";
import type { EntryFields } from "../lib/types/canvas";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildProposeTools } from "./assistant/tools/propose";
import type { ToolResult } from "./assistant/tools/core";
import { createStartingSections, MAX_CUSTOM_SECTIONS } from "./canvas";
import { MAX_COMMENTS_PER_ITEM } from "./comments";
import { stubEstimateDeps } from "./estimates";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S10 seams (issue #43): Proposals made by the `propose` tool, decided with
// api.proposals.accept / reject / askAgain, and closed by expiry. The worked
// examples are docs/design/assistant-behavior.md's "Risky request" and
// "Collision".

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

function line(
  label: string,
  planned: number,
  role: EntryFields<"budget">["role"] = "line",
): EntryFields<"budget"> {
  return {
    label,
    category: null,
    quantity: 1,
    unit: "per_event",
    estimate: null,
    plannedAmount: planned,
    role,
    belowUsualRange: false,
    editedByMember: true,
  };
}

/**
 * Meera and Rohan's Jaipur wedding with a ₹25,00,000 Budget: Decor at
 * ₹3,00,000, a ₹60,000 Drone shoot and ₹1,00,000 Contingency. Rohan, Aditi
 * and Meera are Members; Papa is a Viewer.
 */
async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    budgetTotal: 2_500_000,
  });
  const people = {} as Record<
    "Rohan" | "Aditi" | "Meera" | "Papa",
    Id<"memberships">
  >;
  for (const name of ["Rohan", "Aditi", "Meera", "Papa"] as const) {
    const { membershipId } = await seedMembership(ctx, {
      clerkId: name,
      eventId,
      role: name === "Papa" ? "viewer" : "member",
    });
    await ctx.db.patch("memberships", membershipId, { displayName: name });
    people[name] = membershipId;
  }
  const actor = { kind: "member" as const, membershipId: people.Meera };
  const sections = await createStartingSections(ctx, eventId, actor);
  const budget = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.money,
    kind: "budget",
    position: { x: 0, y: 0 },
    size: null,
    functionKey: null,
    data: { note: null },
    createdBy: actor,
    version: 1,
    deletedAt: null,
  });
  const entry = (order: number, fields: EntryFields<"budget">) =>
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
  const decor = await entry(0, line("Decor", 300_000));
  const drone = await entry(1, line("Drone shoot", 60_000));
  const contingency = await entry(
    2,
    line("Contingency", 100_000, "contingency"),
  );
  return { eventId, people, sections, budget, decor, drone, contingency };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const w = await t.run(seedWedding);
  return {
    t,
    ...w,
    as: (name: "Rohan" | "Aditi" | "Meera" | "Papa") =>
      t.withIdentity(identityFor(name)),
  };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

/** A Member asks in the Chat; their run is started as the scheduler would start it. */
async function ask(
  s: Setup,
  who: "Rohan" | "Aditi" | "Meera",
  text: string,
): Promise<Id<"runs">> {
  const { runId } = await s.as(who).mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: false,
    pointing: [],
  });
  await s.t.run((ctx) =>
    ctx.db.patch("runs", runId!, { status: "running", startedAt: Date.now() }),
  );
  return runId!;
}

/** Calls `propose` as the Agent would: the run's context injected, a tool-call ID given. */
async function propose(
  s: Setup,
  runId: Id<"runs">,
  forMembershipId: Id<"memberships">,
  input: unknown,
  toolCallId = "toolu_p1",
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
  return await tool.execute(input, { toolCallId, messages: [] });
}

/** Rohan's risky request: cut Decor, drop the Drone shoot, the ₹80,000 to Contingency. */
async function riskyProposal(s: Setup): Promise<Id<"proposals">> {
  const runId = await ask(
    s,
    "Rohan",
    "Cut decor to ₹2,20,000 and drop the drone shoot.",
  );
  const result = await propose(s, runId, s.people.Rohan, {
    summary: "Cut Decor to ₹2,20,000, drop the Drone shoot",
    changes: [
      {
        op: "updateEntry",
        entryId: s.decor,
        expectedVersion: 1,
        patch: { kind: "budget", amount: { memberStated: 220_000 } },
      },
      { op: "deleteEntry", entryId: s.drone, expectedVersion: 1 },
      {
        op: "updateEntry",
        entryId: s.contingency,
        expectedVersion: 1,
        patch: { kind: "budget", amount: { receiveFreedFrom: [0] } },
      },
    ],
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return (result as unknown as { proposalId: Id<"proposals"> }).proposalId;
}

const plannedOf = (s: Setup, id: Id<"entries">) =>
  s.t.run(async (ctx) => {
    const entry = await ctx.db.get("entries", id);
    return entry?.kind === "budget" ? entry.fields.plannedAmount : null;
  });

const card = (
  s: Setup,
  who: "Rohan" | "Aditi" | "Meera" | "Papa",
  proposalId: Id<"proposals">,
) => s.as(who).query(api.proposals.get, { eventId: s.eventId, proposalId });

// ---------------------------------------------------------------------------

describe("Accept", () => {
  it("applies every change in one go and history shows who accepted it", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);

    // Nothing changes until a Member accepts.
    expect(await plannedOf(s, s.decor)).toBe(300_000);

    const result = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(result).toEqual({ ok: true });

    expect(await plannedOf(s, s.decor)).toBe(220_000);
    expect(await plannedOf(s, s.contingency)).toBe(180_000);
    const drone = await s.t.run((ctx) => ctx.db.get("entries", s.drone));
    expect(drone?.deletedAt).not.toBeNull();

    const history = await s.as("Meera").query(api.history.list, {
      eventId: s.eventId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const titles = new Set(history.page.map((row) => row.groupTitle));
    expect(titles).toContain(
      "Utsavvy for Rohan, accepted by Aditi (3 changes)",
    );

    expect((await card(s, "Meera", proposalId)).status).toEqual({
      kind: "accepted",
      text: "Accepted by Aditi",
    });
  });
});

describe("Out of date", () => {
  it("refuses Accept after a Member edits what it touches, applies nothing, and offers Ask again", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);

    // While the Proposal is open, Meera sets Decor to ₹2,50,000 herself.
    await s.as("Meera").mutation(api.entries.update, {
      entryId: s.decor,
      patch: { kind: "budget", plannedAmount: 250_000 },
    });

    // The card turns out of date at once, before anyone taps Accept.
    const live = await card(s, "Rohan", proposalId);
    expect(live.status).toEqual({
      kind: "outOfDate",
      text: "Out of date: Meera changed this since",
    });
    expect(live.canDecide).toBe(false);
    expect(live.canAskAgain).toBe(true);

    const result = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(result).toEqual({
      ok: false,
      reason: "outOfDate",
      message: "Out of date: Meera changed this since.",
    });
    expect(await plannedOf(s, s.decor)).toBe(250_000);
    expect(await plannedOf(s, s.contingency)).toBe(100_000);
    const drone = await s.t.run((ctx) => ctx.db.get("entries", s.drone));
    expect(drone?.deletedAt).toBeNull();

    // Rohan taps "Ask again": his request goes to the Assistant again.
    const { runId } = await s
      .as("Rohan")
      .mutation(api.proposals.askAgain, { eventId: s.eventId, proposalId });
    const run = await s.t.run((ctx) => ctx.db.get("runs", runId));
    expect(run?.requestedBy).toBe(s.people.Rohan);
    expect(run?.status).toBe("queued");
    const [message] = await s.t.run((ctx) =>
      ctx.runQuery(components.agent.messages.getMessagesByIds, {
        messageIds: [run!.messageId!],
      }),
    );
    expect(message?.text).toBe(
      "Ask again: Cut decor to ₹2,20,000 and drop the drone shoot.",
    );
  });

  it("is out of date when a guarded parent changed, too", async () => {
    const s = await setUp();
    const runId = await ask(
      s,
      "Rohan",
      "Add a note about the band, just a suggestion.",
    );
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Note the band",
      changes: [
        {
          op: "addItem",
          item: { kind: "note", text: "Ask the band for a sample set" },
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const proposalId = (result as unknown as { proposalId: Id<"proposals"> })
      .proposalId;

    // Aditi renames the Notes Section the Note would go in.
    await s.as("Aditi").mutation(api.canvas.renameSection, {
      sectionId: s.sections.notes,
      name: "Ideas",
    });
    expect((await card(s, "Aditi", proposalId)).status).toEqual({
      kind: "outOfDate",
      text: "Out of date: Aditi changed this since",
    });
  });
});

describe("All or nothing", () => {
  it("applies none of the changes when the third one's handler refuses", async () => {
    const s = await setUp();
    const runId = await ask(
      s,
      "Rohan",
      "Cut decor to ₹2,20,000, drop the drone shoot and leave a Comment on the Budget.",
    );
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Cut Decor, drop the Drone shoot, note why",
      changes: [
        {
          op: "updateEntry",
          entryId: s.decor,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { memberStated: 220_000 } },
        },
        { op: "deleteEntry", entryId: s.drone, expectedVersion: 1 },
        {
          op: "addComment",
          target: { kind: "item", itemId: s.budget },
          body: "Cut to keep the Contingency healthy.",
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const proposalId = (result as unknown as { proposalId: Id<"proposals"> })
      .proposalId;

    // Before anyone accepts, the Budget fills up with Comments, so the
    // addComment handler refuses in validate.
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_COMMENTS_PER_ITEM; i++) {
        await ctx.db.insert("comments", {
          eventId: s.eventId,
          itemId: s.budget,
          target: { kind: "item", itemId: s.budget },
          rootId: null,
          author: { kind: "member", membershipId: s.people.Papa },
          body: `Comment ${i}`,
          resolved: false,
          createdAt: Date.now(),
          editedAt: null,
        });
      }
    });

    const accepted = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(accepted.ok).toBe(false);
    expect(await plannedOf(s, s.decor)).toBe(300_000);
    const drone = await s.t.run((ctx) => ctx.db.get("entries", s.drone));
    expect(drone?.deletedAt).toBeNull();
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_group", (q) => q.eq("groupKey", proposalId))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("Replaced", () => {
  it("a revised Proposal from a reply replaces the old one", async () => {
    const s = await setUp();
    const first = await riskyProposal(s);

    const runId = await ask(s, "Aditi", "Keep the drone shoot.");
    const noEstimate = await propose(
      s,
      runId,
      s.people.Aditi,
      {
        summary: "Cut Decor to its Estimate, keep the Drone shoot",
        replaces: first,
        changes: [
          {
            op: "updateEntry",
            entryId: s.decor,
            expectedVersion: 1,
            patch: { kind: "budget", amount: { estimateLow: true } },
          },
        ],
      },
      "toolu_p2",
    );
    // Decor has no Estimate to cut to, and Aditi didn't write an amount.
    expect(noEstimate).toMatchObject({ ok: false, reason: "noEstimate" });
    expect((await card(s, "Meera", first)).status.kind).toBe("open");

    const revised = await propose(
      s,
      runId,
      s.people.Aditi,
      {
        summary: "Keep the Drone shoot; rename the Contingency",
        replaces: first,
        changes: [
          {
            op: "updateEntry",
            entryId: s.contingency,
            expectedVersion: 1,
            patch: { kind: "budget", label: "Contingency fund" },
          },
        ],
      },
      "toolu_p3",
    );
    expect(revised.ok, JSON.stringify(revised)).toBe(true);

    expect((await card(s, "Meera", first)).status).toEqual({
      kind: "replaced",
      text: "Replaced",
    });
    const refused = await s.as("Meera").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: first,
    });
    expect(refused).toMatchObject({ ok: false, reason: "closed" });
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });
});

describe("Expiry", () => {
  it("closes an open Proposal 24 hours after it was posted", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = await setUp();
    const proposalId = await riskyProposal(s);

    vi.advanceTimersByTime(24 * HOUR);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await card(s, "Meera", proposalId)).status).toEqual({
      kind: "expired",
      text: "Expired",
    });

    const refused = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(refused).toMatchObject({ ok: false, reason: "closed" });
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });

  it("is still open a minute before the 24 hours are up", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    vi.advanceTimersByTime(24 * HOUR - 60_000);
    await s.t.finishInProgressScheduledFunctions();
    expect((await card(s, "Meera", proposalId)).status.kind).toBe("open");
  });
});

describe("Who may decide", () => {
  it("shows a Viewer the card without buttons and refuses their Accept and Reject", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);

    const seen = await card(s, "Papa", proposalId);
    expect(seen.lines).toEqual([
      "Decor ₹3,00,000 → ₹2,20,000",
      'Delete "Drone shoot" (₹60,000)',
      "Contingency ₹1,00,000 → ₹1,80,000",
    ]);
    expect(seen.canDecide).toBe(false);
    expect((await card(s, "Aditi", proposalId)).canDecide).toBe(true);

    for (const fn of [api.proposals.accept, api.proposals.reject]) {
      await expect(
        s.as("Papa").mutation(fn, { eventId: s.eventId, proposalId }),
      ).rejects.toThrow(/AccessDenied/);
    }
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });

  it("refuses a removed or blocked Member, and anyone outside the Event", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    await s.t.run(async (ctx) => {
      await ctx.db.patch("memberships", s.people.Meera, {
        status: "removed",
        endedAt: 1,
      });
      await ctx.db.patch("memberships", s.people.Aditi, { blocked: true });
    });
    for (const who of ["Meera", "Aditi"] as const) {
      await expect(
        s
          .as(who)
          .mutation(api.proposals.accept, { eventId: s.eventId, proposalId }),
      ).rejects.toThrow(/AccessDenied/);
    }
    // A Member of another Event can't reach it through their own Event.
    const other = await s.t.run((ctx) =>
      seedMembership(ctx, { clerkId: "Kabir" }),
    );
    const kabir = s.t.withIdentity(identityFor("Kabir"));
    await expect(
      kabir.mutation(api.proposals.accept, {
        eventId: other.eventId,
        proposalId,
      }),
    ).rejects.toThrow(/AccessDenied/);
    await expect(
      kabir.query(api.proposals.get, { eventId: other.eventId, proposalId }),
    ).rejects.toThrow(/AccessDenied/);
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });

  it("writes once when two Members tap Accept", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    const args = { eventId: s.eventId, proposalId };
    expect(await s.as("Aditi").mutation(api.proposals.accept, args)).toEqual({
      ok: true,
    });
    expect(await s.as("Meera").mutation(api.proposals.accept, args)).toEqual({
      ok: true,
    });
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_group", (q) => q.eq("groupKey", proposalId))
        .collect(),
    );
    expect(rows).toHaveLength(3);
    expect((await card(s, "Rohan", proposalId)).status.text).toBe(
      "Accepted by Aditi",
    );
  });

  it("lets a Member reject it, applying nothing", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    expect(
      await s
        .as("Meera")
        .mutation(api.proposals.reject, { eventId: s.eventId, proposalId }),
    ).toEqual({ ok: true });
    expect((await card(s, "Papa", proposalId)).status).toEqual({
      kind: "rejected",
      text: "Rejected by Meera",
    });
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });
});

describe("The propose tool", () => {
  it("posts the card in the Chat as a notice, never as Utsavvy's own words", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    const annotations = await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect(),
    );
    const row = annotations.find((a) => a.card?.kind === "proposal");
    expect(row?.card).toEqual({ kind: "proposal", id: proposalId });
    expect(row?.authorMembershipId).toBeNull();
  });

  it("refuses an amount the asking Member didn't write", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Trim the decor a bit.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Trim Decor",
      changes: [
        {
          op: "updateEntry",
          entryId: s.decor,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { memberStated: 250_000 } },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "amountNotStated" });
  });

  it("refuses a version the model didn't read, and another Event's Item", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Drop the drone shoot.");
    const stale = await propose(s, runId, s.people.Rohan, {
      summary: "Drop the Drone shoot",
      changes: [{ op: "deleteEntry", entryId: s.drone, expectedVersion: 2 }],
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale" });

    const foreign = await s.t.run(async (ctx) => {
      const { eventId, membershipId } = await seedMembership(ctx, {
        clerkId: "Kabir",
      });
      const sections = await createStartingSections(ctx, eventId, {
        kind: "member",
        membershipId,
      });
      return await ctx.db.insert("items", {
        eventId,
        sectionId: sections.notes,
        kind: "note",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { text: "Kabir's note", citations: [] },
        createdBy: { kind: "member", membershipId },
        version: 1,
        deletedAt: null,
      });
    });
    const wrong = await propose(
      s,
      runId,
      s.people.Rohan,
      {
        summary: "Delete a Note",
        changes: [{ op: "deleteItem", itemId: foreign, expectedVersion: 1 }],
      },
      "toolu_p9",
    );
    expect(wrong).toMatchObject({ ok: false, error: "AccessDenied" });
  });

  it("returns the first result when the same tool call repeats", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Drop the drone shoot.");
    const input = {
      summary: "Drop the Drone shoot",
      changes: [{ op: "deleteEntry", entryId: s.drone, expectedVersion: 1 }],
    };
    const a = await propose(s, runId, s.people.Rohan, input);
    const b = await propose(s, runId, s.people.Rohan, input);
    expect(b).toEqual(a);
    const proposals = await s.t.run((ctx) =>
      ctx.db.query("proposals").collect(),
    );
    expect(proposals).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Review of #105 (H1, M1 to M4) and the orchestrator's decisions of 2026-10-24

const sumOf = async (s: Setup, ids: Id<"entries">[]) =>
  await s.t.run(async (ctx) => {
    let sum = 0;
    for (const id of ids) {
      const entry = await ctx.db.get("entries", id);
      if (entry?.kind === "budget" && entry.deletedAt === null)
        sum += entryAmount(entry.fields);
    }
    return sum;
  });

const proposalIdOf = (result: ToolResult) =>
  (result as unknown as { proposalId: Id<"proposals"> }).proposalId;

describe("Freed rupees (H1)", () => {
  it("refuses a second claim on the same freed rupees", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Cut decor to ₹2,20,000.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Cut Decor",
      changes: [
        {
          op: "updateEntry",
          entryId: s.decor,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { memberStated: 220_000 } },
        },
        {
          op: "updateEntry",
          entryId: s.contingency,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { receiveFreedFrom: [0] } },
        },
        {
          op: "updateEntry",
          entryId: s.drone,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { receiveFreedFrom: [0, 0] } },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "badFreed" });
    expect(await s.t.run((ctx) => ctx.db.query("proposals").collect())).toEqual(
      [],
    );
  });

  it("an accepted Proposal that only moves money never raises the lines it touches", async () => {
    const s = await setUp();
    const touched = [s.decor, s.drone, s.contingency];
    const before = await sumOf(s, touched);
    const proposalId = await riskyProposal(s);
    await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    // ₹4,60,000 before; Decor ₹2,20,000 + Contingency ₹1,80,000 after.
    expect(before).toBe(460_000);
    expect(await sumOf(s, touched)).toBe(400_000);
  });
});

describe("Identical changes (M1)", () => {
  it("refuses two identical changes, so the card never lists one Accept would drop", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Add two reminder notes.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Two notes",
      changes: [
        { op: "addItem", item: { kind: "note", text: "Call the florist" } },
        { op: "addItem", item: { kind: "note", text: "Call the florist" } },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "refused" });
  });
});

describe("Timeline fields (M2)", () => {
  async function withTimeline(s: Setup) {
    return await s.t.run((ctx) =>
      ctx.db.insert("items", {
        eventId: s.eventId,
        sectionId: s.sections.money,
        kind: "timeline",
        position: { x: 0, y: 400 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: { kind: "member", membershipId: s.people.Meera },
        version: 1,
        deletedAt: null,
      }),
    );
  }

  it("refuses a date, time or note the direct tools would refuse", async () => {
    const s = await setUp();
    await withTimeline(s);
    const runId = await ask(s, "Rohan", "Add a mehendi rehearsal.");
    const bad = [
      { date: "next tuesday" },
      { date: "2027-02-31" },
      { time: "25:99" },
      { note: "x".repeat(20_000) },
    ];
    for (const [n, fields] of bad.entries()) {
      const result = await propose(
        s,
        runId,
        s.people.Rohan,
        {
          summary: "Add the rehearsal",
          changes: [
            {
              op: "addEntry",
              entry: {
                kind: "timeline",
                title: "Rehearsal",
                functionKey: null,
                ...fields,
              },
            },
          ],
        },
        `toolu_m2_${n}`,
      );
      expect(result, JSON.stringify(fields).slice(0, 40)).toMatchObject({
        ok: false,
      });
    }
    expect(await s.t.run((ctx) => ctx.db.query("proposals").collect())).toEqual(
      [],
    );
  });

  it("refuses a date that isn't on the calendar in an updateEntry", async () => {
    const s = await setUp();
    const itemId = await withTimeline(s);
    const entryId = await s.t.run((ctx) =>
      ctx.db.insert("entries", {
        eventId: s.eventId,
        itemId,
        kind: "timeline",
        order: 0,
        functionKey: null,
        fields: {
          title: "Book the photographer",
          date: null,
          time: null,
          leadKey: null,
          priority: null,
          late: false,
          note: null,
          vendorCategory: null,
          done: false,
        },
        assumed: [],
        createdBy: { kind: "member", membershipId: s.people.Meera },
        version: 1,
        deletedAt: null,
      }),
    );
    const runId = await ask(s, "Rohan", "Move the photographer booking.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Move it",
      changes: [
        {
          op: "updateEntry",
          entryId,
          expectedVersion: 1,
          patch: { kind: "timeline", date: "2027-02-31" },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("Ask again (M3)", () => {
  it("queues one run however many Members tap it", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    await s.as("Meera").mutation(api.entries.update, {
      entryId: s.decor,
      patch: { kind: "budget", plannedAmount: 250_000 },
    });
    const args = { eventId: s.eventId, proposalId };
    const a = await s.as("Rohan").mutation(api.proposals.askAgain, args);
    const b = await s.as("Aditi").mutation(api.proposals.askAgain, args);
    expect(b.runId).toBe(a.runId);
    expect((await card(s, "Aditi", proposalId)).canAskAgain).toBe(false);
  });
});

describe("Estimate low end (M4)", () => {
  async function decorWithEstimate(s: Setup, low: number, high: number) {
    await s.t.run(async (ctx) => {
      const entry = (await ctx.db.get("entries", s.decor))!;
      if (entry.kind !== "budget") return;
      await ctx.db.patch("entries", s.decor, {
        fields: {
          ...entry.fields,
          estimate: {
            low,
            high,
            amount: Math.round((low + high) / 2),
            label: "Estimate",
            basis: referenceTableBasis({
              unit: "per_event",
              unitLow: low,
              unitHigh: high,
              tier: "Y",
            }),
          },
        },
      });
    });
  }

  it("refuses to raise a line to its Estimate's low end", async () => {
    const s = await setUp();
    await decorWithEstimate(s, 350_000, 500_000);
    const runId = await ask(s, "Rohan", "Trim decor.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Trim Decor",
      changes: [
        {
          op: "updateEntry",
          entryId: s.decor,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { estimateLow: true } },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "notACut" });
  });

  it("cuts a line to its Estimate's low end as an Estimate, not as the Member's amount", async () => {
    const s = await setUp();
    await decorWithEstimate(s, 200_000, 350_000);
    const runId = await ask(s, "Rohan", "Trim decor.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Trim Decor",
      changes: [
        {
          op: "updateEntry",
          entryId: s.decor,
          expectedVersion: 1,
          patch: { kind: "budget", amount: { estimateLow: true } },
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const proposalId = proposalIdOf(result);
    expect((await card(s, "Aditi", proposalId)).lines).toEqual([
      "Decor ₹3,00,000 → ₹2,00,000",
    ]);
    await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    const decor = await s.t.run((ctx) => ctx.db.get("entries", s.decor));
    if (decor?.kind !== "budget") throw new Error("Decor is a budget line");
    expect(decor.fields.plannedAmount).toBeNull();
    expect(decor.fields.estimate?.amount).toBe(200_000);
    expect(decor.fields.estimate?.label).toBe("Estimate");
    expect(entryAmount(decor.fields)).toBe(200_000);
  });
});

describe("Accept's own checks (decided 2026-10-24)", () => {
  it("refuses an expired Proposal even before the expiry job runs", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    vi.setSystemTime(T0 + 25 * HOUR);
    const result = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(result).toEqual({
      ok: false,
      reason: "closed",
      message: "This Proposal expired.",
    });
    expect((await card(s, "Aditi", proposalId)).status.kind).toBe("expired");
    expect(await plannedOf(s, s.decor)).toBe(300_000);
  });

  it("refuses and closes a Proposal whose asker is no longer an active Member", async () => {
    const s = await setUp();
    const proposalId = await riskyProposal(s);
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.people.Rohan, {
        status: "removed",
        endedAt: T0,
      }),
    );
    const result = await s
      .as("Aditi")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    expect(result).toEqual({
      ok: false,
      reason: "outOfDate",
      message: "The Member who asked for this has left; ask Utsavvy again.",
    });
    expect(await plannedOf(s, s.decor)).toBe(300_000);
    const shown = await card(s, "Aditi", proposalId);
    expect(shown.status).toEqual({
      kind: "outOfDate",
      text: "The Member who asked for this has left; ask Utsavvy again.",
    });
    expect(shown.canDecide).toBe(false);
  });

  it("refuses a new Section at propose time when the Event can't hold another", async () => {
    const s = await setUp();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_CUSTOM_SECTIONS; i++)
        await ctx.db.insert("sections", {
          eventId: s.eventId,
          kind: "custom",
          name: `Extra ${i}`,
          frame: { x: 0, y: 2000 + i * 10, w: 100, h: 100 },
          order: 10 + i,
          version: 1,
          deletedAt: null,
        });
    });
    const runId = await ask(s, "Rohan", "Make a Section for the baraat.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "A Section for the baraat",
      changes: [{ op: "createSection", name: "Baraat" }],
    });
    expect(result).toMatchObject({ ok: false, reason: "refused" });
  });
});

describe("More ops through Accept", () => {
  it("setBudgetTotal changes the Budget total to the asker's amount", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Make the budget ₹24,00,000.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Budget total to ₹24,00,000",
      changes: [
        { op: "setBudgetTotal", expectedVersion: 1, memberStated: 2_400_000 },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const proposalId = proposalIdOf(result);
    expect((await card(s, "Meera", proposalId)).lines).toEqual([
      "Budget total ₹25,00,000 → ₹24,00,000",
    ]);
    await s
      .as("Meera")
      .mutation(api.proposals.accept, { eventId: s.eventId, proposalId });
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event?.budgetTotal).toBe(2_400_000);
  });

  it("moveItem moves a Note to another Section", async () => {
    const s = await setUp();
    const noteId = await s.t.run((ctx) =>
      ctx.db.insert("items", {
        eventId: s.eventId,
        sectionId: s.sections.notes,
        kind: "note",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { text: "Florist numbers", citations: [] },
        createdBy: { kind: "member", membershipId: s.people.Meera },
        version: 1,
        deletedAt: null,
      }),
    );
    const runId = await ask(s, "Rohan", "Move the florist note to Vendors.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Move the florist Note",
      changes: [
        {
          op: "moveItem",
          itemId: noteId,
          expectedVersion: 1,
          sectionId: s.sections.vendors,
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    await s.as("Aditi").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposalIdOf(result),
    });
    const note = await s.t.run((ctx) => ctx.db.get("items", noteId));
    expect(note?.sectionId).toBe(s.sections.vendors);
  });

  it("createSection adds the custom Section", async () => {
    const s = await setUp();
    const runId = await ask(s, "Rohan", "Make a Section for the baraat.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "A Section for the baraat",
      changes: [{ op: "createSection", name: "Baraat" }],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    await s.as("Aditi").mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposalIdOf(result),
    });
    const sections = await s.t.run((ctx) =>
      ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect(),
    );
    expect(sections.filter((x) => x.name === "Baraat")).toHaveLength(1);
  });
});
