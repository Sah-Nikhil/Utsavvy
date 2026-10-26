/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { ASSISTANT_TOOLS } from "../convex/assistant/tools";
import { identityFor } from "../convex/lib/test.helpers";
import { loadStarterSetRows } from "../convex/vendors";
import { runCase, wedding, type CaseResult, type Seeded } from "./harness";

/**
 * The scripted case for S12 (issue #45): "A Quote pasted from WhatsApp" in
 * docs/design/vendors.md and the 0:50 demo beat (IMPLEMENTATION_PLAN.md
 * section 9.3). Meera pastes "Veg 950/plate for 300 pax, live counters
 * extra"; one Proposal offers a ₹950 per plate Quote for 300 Guests at the
 * sangeet. Accepting saves it and the caterer's link moves to Quoted; booking
 * asks "Use the ₹2.85L Quote as this line's amount?", and only the yes puts
 * the Budget ₹40,000 over, with a "Suggest cuts" Nudge.
 *
 * Without EVAL_LIVE the chat model is a scripted stub that calls
 * `proposeQuote` as a model would, and the extraction runs on the stub model
 * with the worked example's canned reading. With the key given in the shell
 * (never in `.env.local`) the real models do both:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval evals/quotes.eval.ts
 */

const LIVE = process.env.EVAL_LIVE === "1";
const PASTE = "Veg 950/plate for 300 pax, live counters extra";

const script = vi.hoisted(() => ({
  steps: null as unknown[][] | null,
  call: 0,
}));

vi.mock("../convex/lib/models", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../convex/lib/models")>();
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  return {
    ...original,
    languageModel: (...args: Parameters<typeof original.languageModel>) => {
      const [id] = args;
      const real = original.languageModel(...args);
      if (script.steps === null || id !== original.STUB_MODEL) return real;
      const steps = script.steps;
      return {
        ...real,
        // The extraction is one structured-output call on the plain stub.
        doGenerate: (options) => real.doGenerate(options),
        doStream: async () => {
          const step = steps[Math.min(script.call++, steps.length - 1)]!;
          const toolCalls = step.some(
            (part) => (part as { type: string }).type === "tool-call",
          );
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "stream-start", warnings: [] });
                for (const part of step) controller.enqueue(part);
                controller.enqueue({
                  type: "finish",
                  usage,
                  finishReason: toolCalls
                    ? { unified: "tool-calls", raw: "tool_use" }
                    : { unified: "stop", raw: "stop" },
                });
                controller.close();
              },
            }),
          } as never;
        },
      } satisfies ReturnType<typeof original.languageModel>;
    },
  };
});

beforeAll(() => {
  if (!LIVE) {
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    script.steps = [
      [
        {
          type: "tool-call",
          toolCallId: "call_quote",
          toolName: "proposeQuote",
          input: JSON.stringify({ category: "caterer" }),
        },
      ],
      [
        { type: "text-start", id: "t" },
        {
          type: "text-delta",
          id: "t",
          delta:
            "I've put the caterer's Quote on a card: ₹950 a plate for 300 Guests at the sangeet. A Member needs to Accept it.",
        },
        { type: "text-end", id: "t" },
      ],
    ];
  }
});
afterAll(() => {
  vi.unstubAllEnvs();
  script.steps = null;
});

/**
 * ₹11,65,000 of lines on a ₹12,00,000 Budget, the caterer at ₹2,45,000 for
 * the sangeet, and Vinayak Foods & Catering shortlisted for it and Contacted.
 * Using the ₹2,85,000 Quote puts the Budget ₹40,000 over.
 */
function quoteSeed() {
  const base = wedding({
    budgetTotal: 1_200_000,
    budget: [
      { label: "Caterer", functionKey: "sangeet", amount: 245_000 },
      { label: "Decor", functionKey: "wedding", amount: 300_000 },
      { label: "Venue", functionKey: "wedding", amount: 620_000 },
    ],
  });
  return async (ctx: MutationCtx): Promise<Seeded> => {
    const seeded = await base(ctx);
    await ctx.db.patch("eventFunctions", await sangeetId(ctx, seeded), {
      guests: 300,
    });
    await loadStarterSetRows(ctx);
    const vendor = (await ctx.db
      .query("vendors")
      .withIndex("by_domain", (q) => q.eq("domain", "vinayakfoodsncatering.in"))
      .unique())!;
    const actor = {
      kind: "member" as const,
      membershipId: seeded.members.Meera,
    };
    const caterer = await ctx.db.insert("entries", {
      eventId: seeded.eventId,
      itemId: seeded.items.checklist,
      kind: "checklist",
      order: 0,
      functionKey: null,
      fields: {
        vendorCategory: "caterer",
        freeLabel: null,
        functionKeys: ["sangeet"],
        bookByEntryId: null,
        budgetEntryIds: [seeded.entries.Caterer!],
      },
      assumed: [],
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
    const itemId = await ctx.db.insert("items", {
      eventId: seeded.eventId,
      sectionId: seeded.sections.vendors,
      kind: "shortlistedVendor",
      position: { x: 400, y: 0 },
      size: { w: 320, h: 440 },
      functionKey: null,
      data: { vendorId: vendor._id },
      createdBy: actor,
      version: 1,
      deletedAt: null,
    });
    await ctx.db.insert("vendorLinks", {
      eventId: seeded.eventId,
      shortlistItemId: itemId,
      checklistEntryId: caterer,
      status: "contacted",
      version: 1,
    });
    return seeded;
  };
}

async function sangeetId(ctx: MutationCtx, seeded: Seeded) {
  const fn = (
    await ctx.db
      .query("eventFunctions")
      .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
      .collect()
  ).find((f) => f.key === "sangeet");
  return fn!._id;
}

async function proposalsOf(result: CaseResult): Promise<Doc<"proposals">[]> {
  return await result.t.run((ctx) =>
    ctx.db
      .query("proposals")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", result.seeded.eventId),
      )
      .collect(),
  );
}

describe("the proposeQuote tool", () => {
  it("is registered with the Assistant", () => {
    const tool = (
      ASSISTANT_TOOLS as unknown as Record<string, { description?: string }>
    ).proposeQuote;
    expect(tool?.description).toMatch(/pastes a Vendor's message/);
  });
});

describe("scripted case: a Quote pasted from WhatsApp", () => {
  it("one Proposal, saved on Accept; booking asks; only the yes puts the Budget ₹40,000 over", async () => {
    const result = await runCase({
      seed: quoteSeed(),
      messages: [{ from: "Meera", text: PASTE }],
      expect: () => {},
    });
    const { t, seeded } = result;
    expect(result.replies[0]?.status).toBe("done");

    // One Proposal, one addQuote change; nothing is saved yet.
    const proposals = await proposalsOf(result);
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal!.changes).toHaveLength(1);
    expect(proposal!.changes[0]).toMatchObject({
      op: "addQuote",
      docId: null,
      expectedVersion: null,
      values: {
        amount: 950,
        unit: "per_plate",
        guests: 300,
        functionKeys: ["sangeet"],
        note: expect.stringMatching(/live counters extra/i),
      },
    });
    expect(result.assistantChanges).toEqual([]);

    const asMeera = t.withIdentity(identityFor("Meera"));
    const asAditi = t.withIdentity(identityFor("Aditi"));
    expect(
      await asAditi.mutation(api.proposals.accept, {
        eventId: seeded.eventId,
        proposalId: proposal!._id,
      }),
    ).toEqual({ ok: true });

    const link = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("vendorLinks")
          .withIndex("by_event", (q) => q.eq("eventId", seeded.eventId))
          .collect()
      ).at(0),
    );
    expect(link!.status).toBe("quoted");

    // The line shows Estimate, Listed price and Quote side by side.
    const comparison = await asMeera.query(api.quotes.budgetComparison, {
      eventId: seeded.eventId,
    });
    const line = comparison.entries.find(
      (e) => e.entryId === seeded.entries.Caterer,
    )!;
    expect(line.estimate).not.toBeNull();
    expect(line.vendors[0]!.listed.map((p) => p.label)).toContain(
      "from ₹250/plate (starting price)",
    );
    expect(line.vendors[0]!.quote).toMatchObject({
      total: 285_000,
      comparedWith: 245_000,
    });

    // Booked: the question, and the planned amount still the caterer's ₹2,45,000.
    await asMeera.mutation(api.vendors.setLinkStatus, {
      linkId: link!._id,
      status: "booked",
    });
    const asked = await asMeera.query(api.quotes.listForLink, {
      linkId: link!._id,
    });
    expect(asked.ask?.question).toBe(
      "Use the ₹2.85L Quote as this line's amount?",
    );
    const planned = (id: Id<"entries">) =>
      t.run(async (ctx) => {
        const entry = await ctx.db.get("entries", id);
        return entry?.kind === "budget" ? entry.fields.plannedAmount : null;
      });
    expect(await planned(seeded.entries.Caterer!)).toBeNull();

    // Yes: ₹2,85,000, ₹40,000 over, and the Nudge offers cuts.
    await asMeera.mutation(api.quotes.useAsAmount, {
      entryId: seeded.entries.Caterer!,
      quoteId: asked.ask!.quoteId,
    });
    expect(await planned(seeded.entries.Caterer!)).toBe(285_000);
    const started = Date.now();
    let nudges: Doc<"nudges">[] = [];
    while (nudges.length === 0 && Date.now() - started < 20_000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      nudges = await t.run((ctx) => ctx.db.query("nudges").collect());
    }
    await t.finishInProgressScheduledFunctions();
    expect(nudges.map((n) => n.trigger)).toEqual(["budgetOver"]);
  });
});
