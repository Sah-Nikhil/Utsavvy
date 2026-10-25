/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { setStubChunkDelayMs, stubCallCount } from "../convex/lib/models";
import { identityFor, newTest } from "../convex/lib/test.helpers";
import { nudgeRequest } from "../convex/nudges";
import { wedding, type Seeded } from "./harness";

/**
 * Scripted cases for S17 (issue #50): the "Nudge" worked example from
 * docs/design/assistant-behavior.md and an @Utsavvy question on a Venue card.
 *
 * Without EVAL_LIVE the cases run on the stub model, so they check the plain
 * code around the model: the Nudge (which never calls a model), the request
 * sent as the tapping Member, the Comment reply in its thread and the one
 * Chat line. With the key given in the shell (never in `.env.local`) they
 * also check what the real model does:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval evals/nudges.eval.ts
 *
 * S12 (Quotes) is still open, so the Nudge case pushes the Budget over with a
 * typed amount instead of a Quote (IMPLEMENTATION_PLAN.md section 10).
 */

const LIVE = process.env.EVAL_LIVE === "1";

beforeAll(() => {
  if (!LIVE) vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
  setStubChunkDelayMs(5);
});
afterAll(() => {
  vi.unstubAllEnvs();
  setStubChunkDelayMs(undefined);
});

type T = ReturnType<typeof newTest>;

/** ₹11,65,000 of lines on a ₹12,00,000 Budget: the caterer at ₹2,85,000 is ₹40,000 over. */
const NUDGE_SEED = wedding({
  budgetTotal: 1_200_000,
  budget: [
    { label: "Caterer", functionKey: "sangeet", amount: 210_000 },
    { label: "Decor", functionKey: "wedding", amount: 300_000 },
    { label: "Venue", functionKey: "wedding", amount: 655_000 },
  ],
});

const ENDED = ["done", "failed", "stopped", "cancelled"];

async function until<V>(
  read: () => Promise<V>,
  done: (value: V) => boolean,
  ms = 150_000,
): Promise<V> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - started > ms) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function untilRunEnded(t: T, runId: Id<"runs">) {
  await until(
    () => t.query(internal.runs.status, { runId }),
    (status) => status !== null && ENDED.includes(status),
  );
  await t.finishInProgressScheduledFunctions();
}

async function chatTexts(t: T, eventId: Id<"events">): Promise<string[]> {
  const threadId = await t.run(
    async (ctx) => (await ctx.db.get("events", eventId))?.agentThreadId,
  );
  if (!threadId) return [];
  const page = await t.query(components.agent.messages.listMessagesByThreadId, {
    threadId,
    order: "asc",
    paginationOpts: { numItems: 100, cursor: null },
  });
  return page.page.map((m: { text?: string }) => m.text ?? "");
}

const proposalsOf = (t: T, eventId: Id<"events">) =>
  t.run((ctx) =>
    ctx.db
      .query("proposals")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .collect(),
  );

const plannedOf = (t: T, entryId: Id<"entries">) =>
  t.run(async (ctx) => {
    const entry = await ctx.db.get("entries", entryId);
    return entry?.kind === "budget" ? entry.fields.plannedAmount : null;
  });

describe("scripted cases", () => {
  it('Nudge: the Budget goes ₹40,000 over, Meera taps "Suggest cuts", and the request is hers', async () => {
    const t = newTest();
    agentTest.register(t);
    const seeded: Seeded = await t.run(NUDGE_SEED);
    const caterer = seeded.entries.Caterer!;
    const calls = stubCallCount();

    // Aditi types the caterer's ₹2,85,000 into the line.
    await t.withIdentity(identityFor("Aditi")).mutation(api.entries.update, {
      entryId: caterer,
      patch: { kind: "budget", plannedAmount: 285_000 },
    });
    const [nudge] = await until(
      () => t.run((ctx) => ctx.db.query("nudges").collect()),
      (rows) => rows.length > 0 && rows[0]!.messageId !== null,
    );
    await t.finishInProgressScheduledFunctions();
    expect(nudge!.trigger).toBe("budgetOver");
    expect(await chatTexts(t, seeded.eventId)).toContain(
      "The Budget is now ₹40,000 over. Want me to suggest cuts?",
    );
    // The Nudge itself called no model.
    expect(stubCallCount()).toBe(calls);

    const { runId, messageId } = await t
      .withIdentity(identityFor("Meera"))
      .mutation(api.nudges.act, { nudgeId: nudge!._id });
    await untilRunEnded(t, runId);

    const run = (await t.run((ctx) => ctx.db.get("runs", runId)))!;
    expect(run).toMatchObject({
      requestedBy: seeded.members.Meera,
      source: "nudge",
      messageId,
      status: "done",
    });
    const texts = await chatTexts(t, seeded.eventId);
    expect(texts).toContain(nudgeRequest("budgetOver"));

    // Nothing on the Canvas changed: cuts only ever arrive as a Proposal.
    expect(await plannedOf(t, caterer)).toBe(285_000);
    const assistantChanges = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("changes")
          .withIndex("by_event_at", (q) => q.eq("eventId", seeded.eventId))
          .collect()
      ).filter((c: Doc<"changes">) => c.actor.kind === "assistant"),
    );
    expect(assistantChanges).toEqual([]);

    if (LIVE) {
      const proposals = await proposalsOf(t, seeded.eventId);
      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatchObject({
        status: "open",
        requestedBy: seeded.members.Meera,
        runId,
      });
    }
  });

  // Add once S12 (#45) merges: the same case with a Quote used as the line's
  // amount through api.quotes.useAsAmount instead of the typed ₹2,85,000.
  it.skip("Nudge: a Quote used as the caterer's amount through api.quotes.useAsAmount pushes the Budget over", () => {});

  it("@Utsavvy on a Venue card: Aditi asks in a Comment and the answer arrives in the thread", async () => {
    const t = newTest();
    agentTest.register(t);
    const seeded: Seeded = await t.run(NUDGE_SEED);
    const venueItem = await t.run(async (ctx) => {
      const vendorId = await ctx.db.insert("vendors", {
        domain: "rambaghpalace.example.in",
        name: "Rambagh Lawns",
        category: "venue",
        website: "https://rambaghpalace.example.in",
        capacity: { max: 250 },
        summary: "A lawn venue in Jaipur that seats up to 250 Guests.",
        provenance: [],
        factsSeenAt: "2026-10-20",
        source: "starterSet",
        version: 1,
      });
      return await ctx.db.insert("items", {
        eventId: seeded.eventId,
        sectionId: seeded.sections.vendors,
        kind: "shortlistedVendor",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: "wedding",
        data: { vendorId },
        createdBy: { kind: "member", membershipId: seeded.members.Meera },
        version: 1,
        deletedAt: null,
      });
    });

    const aditi = t.withIdentity(identityFor("Aditi"));
    const commentId = await aditi.mutation(api.comments.add, {
      target: { kind: "item", itemId: venueItem },
      body: "@Utsavvy is this hall big enough for 300 Guests, with our relatives from Kota?",
      rootId: null,
    });
    const runId = await aditi.mutation(api.commentAsks.ask, { commentId });
    expect(runId).not.toBeNull();
    await untilRunEnded(t, runId!);

    const thread = await aditi.query(api.comments.listForItem, {
      itemId: venueItem,
    });
    const reply = thread.find((c) => c.byAssistant);
    expect(reply).toMatchObject({
      rootId: commentId,
      authorName: "Utsavvy for Aditi",
    });
    expect(reply!.body.length).toBeGreaterThan(0);
    expect(await chatTexts(t, seeded.eventId)).toEqual([
      "Utsavvy answered Aditi in a Comment on Rambagh Lawns",
    ]);

    if (LIVE) {
      // A question changes nothing; the answer should notice 300 > 250.
      expect(reply!.body).toMatch(/250/);
      expect(await proposalsOf(t, seeded.eventId)).toEqual([]);
    }
  });
});
