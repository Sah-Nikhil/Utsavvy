/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryFields } from "../lib/types/canvas";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildProposeTools } from "./assistant/tools/propose";
import type { ToolResult } from "./assistant/tools/core";
import { createStartingSections } from "./canvas";
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
    expect(titles).toContain("Utsavvy for Rohan, accepted by Aditi (3 changes)");

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
    const runId = await ask(s, "Rohan", "Add a note about the band, just a suggestion.");
    const result = await propose(s, runId, s.people.Rohan, {
      summary: "Note the band",
      changes: [{ op: "addItem", item: { kind: "note", text: "Ask the band for a sample set" } }],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const proposalId = (result as unknown as { proposalId: Id<"proposals"> }).proposalId;

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
