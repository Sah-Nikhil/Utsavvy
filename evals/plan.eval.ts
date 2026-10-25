import { afterAll, describe, expect, it } from "vitest";
import {
  estimateLines,
  liveEstimateDeps,
  type ResearchReport,
} from "../convex/estimates";
import { insertEvent, newTest } from "../convex/lib/test.helpers";
import {
  draftWithModel,
  planLinesOf,
  pricePlanDraft,
  type PlanInput,
} from "../convex/plan";
import type { CityTier, EventType } from "../lib/types";

/**
 * Scripted cases for the first plan (IMPLEMENTATION_PLAN.md section 8; S14's
 * "Scripted cases"): the three first-brief.md Briefs, drafted by the real
 * default model chain and priced by the live estimate cascade. Live prices and
 * wording vary, so each case checks the plan's structure: its Functions, the
 * Entry counts, every line with a basis, researched lines with source URLs,
 * and a total equal to the budget. The table prints the searches, time and
 * cost per plan. They spend API credits, so they run only when you ask:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval evals/plan.eval.ts
 *
 * (add GOOGLE_GENERATIVE_AI_API_KEY to try the fallback; without a Claude key
 * Estimate research is off and every line comes from the reference table).
 * Never in CI.
 */

const LIVE = process.env.EVAL_LIVE === "1";
const KEYED = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
);
const TODAY = "2026-10-21";

/** Dollars per million tokens (checked 2026-10-23), and $10 per 1,000 searches. */
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const SEARCH_DOLLARS = 10 / 1000;

type Case = {
  name: string;
  eventType: EventType;
  city: string;
  tier: CityTier;
  budget: number;
  households: number | null;
  functions: PlanInput["functions"];
  checklist: [number, number];
};

const day = (value: string) => ({ kind: "day" as const, value });

const CASES: Case[] = [
  {
    name: "Jaipur wedding",
    eventType: "wedding",
    city: "Jaipur",
    tier: "Y",
    budget: 2_500_000,
    households: null,
    functions: [
      ["haldi", "Haldi", "2027-02-14", 60],
      ["mehendi", "Mehendi", "2027-02-13", 120],
      ["sangeet", "Sangeet", "2027-02-14", 225],
      ["wedding", "Wedding", "2027-02-15", 300],
      ["reception", "Reception", "2027-02-16", 300],
    ].map(([key, name, date, guests]) => ({
      key: key as string,
      name: name as string,
      date: day(date as string),
      guests: guests as number,
      assumed: ["date"],
    })),
    checklist: [10, 15],
  },
  {
    name: "Aarav's birthday",
    eventType: "birthday",
    city: "Jaipur",
    tier: "Y",
    budget: 150_000,
    households: null,
    functions: [
      {
        key: "party",
        name: "Party",
        date: day("2026-12-12"),
        guests: 60,
        assumed: ["guests"],
      },
    ],
    checklist: [4, 7],
  },
  {
    name: "Pune Ganesh utsav",
    eventType: "community",
    city: "Pune",
    tier: "X",
    budget: 240_000,
    households: 240,
    functions: [
      {
        key: "sthapana",
        name: "Sthapana",
        date: day("2027-09-04"),
        guests: 150,
        assumed: ["guests"],
      },
      {
        key: "daily_aarti",
        name: "Daily aarti",
        date: { kind: "range", from: "2027-09-04", to: "2027-09-13" },
        guests: 100,
        assumed: ["guests"],
      },
      {
        key: "cultural_night",
        name: "Cultural night",
        date: day("2027-09-11"),
        guests: 400,
        assumed: [],
      },
      {
        key: "visarjan",
        name: "Visarjan",
        date: day("2027-09-14"),
        guests: 300,
        assumed: ["guests"],
      },
    ],
    checklist: [5, 8],
  },
];

const rows: Record<string, string | number>[] = [];
afterAll(() => {
  if (rows.length > 0) console.table(rows);
});

function dollars(report: ResearchReport | null): string {
  if (report === null) return "0 (no research)";
  let total = report.searchesUsed * SEARCH_DOLLARS;
  for (const u of [...report.usage, ...report.knowledgeUsage]) {
    const price = TOKEN_PRICES[u.model];
    if (price)
      total +=
        (u.inputTokens * price.input + u.outputTokens * price.output) / 1e6;
  }
  return total.toFixed(4);
}

describe.skipIf(!LIVE || !KEYED)("the first plan, live", () => {
  for (const c of CASES) {
    it(`plans ${c.name}`, { timeout: 180_000 }, async () => {
      const t = newTest();
      const eventId = await t.run((ctx) => insertEvent(ctx, c.name));
      // The draft and the pricing only carry these through; nothing is written.
      const runId = "eval-run" as PlanInput["runId"];
      const input: PlanInput = {
        eventId,
        runId,
        requestedBy: "eval-member" as PlanInput["requestedBy"],
        event: {
          name: c.name,
          eventType: c.eventType,
          city: { name: c.city, tier: c.tier },
          tradition: c.eventType === "wedding" ? "North Indian Hindu" : null,
          communityKind: c.eventType === "community" ? "ganesh_utsav" : null,
          honoree:
            c.eventType === "birthday"
              ? { who: "child", age: 6, name: "Aarav" }
              : null,
          households: c.households,
          budget: c.budget,
          contingencyShare: 0.1,
          theme: { palette: [], styleWords: [], decorKeywords: [] },
          notes: [],
          assumptions: [],
        },
        functions: c.functions,
      };

      const started = Date.now();
      const { draft, model } = await draftWithModel(input);
      const drafted = Date.now();
      const seen: { report: ResearchReport | null } = { report: null };
      type Call = (ref: unknown, args: unknown) => Promise<unknown>;
      const ctx = {
        runQuery: t.query as Call,
        runMutation: t.mutation as Call,
        runAction: t.action as Call,
      } as unknown as Parameters<typeof estimateLines>[0];
      const ranges = await estimateLines(
        ctx,
        {
          eventId,
          city: c.city,
          tier: c.tier,
          eventType: c.eventType,
          lines: planLinesOf(draft),
        },
        { ...liveEstimateDeps(), onResearch: (r) => (seen.report = r) },
      );
      const priced = pricePlanDraft(input, draft, ranges, TODAY);

      // Structure, not wording or numbers.
      expect(draft.functions.map((fn) => fn.key)).toEqual(
        c.functions.map((fn) => fn.key),
      );
      for (const fn of draft.functions) {
        expect(fn.runSheet.length).toBeGreaterThanOrEqual(6);
        expect(fn.runSheet.length).toBeLessThanOrEqual(10);
      }
      expect(draft.vendorChecklist.length).toBeGreaterThanOrEqual(
        c.checklist[0],
      );
      expect(draft.vendorChecklist.length).toBeLessThanOrEqual(c.checklist[1]);
      expect(draft.suggestions.length).toBeGreaterThanOrEqual(5);
      expect(draft.suggestions.length).toBeLessThanOrEqual(8);
      for (const estimate of priced.lineEstimates) {
        expect(estimate?.basis.kind).toBeDefined();
        if (estimate?.basis.kind === "researched")
          expect(estimate.basis.sourceUrls.length).toBeGreaterThan(0);
      }
      const total =
        priced.lineEstimates.reduce((sum, e) => sum + (e?.amount ?? 0), 0) +
        priced.budgetCheck.contingency +
        priced.budgetCheck.unallocated;
      expect(total).toBe(c.budget);

      const finished = Date.now();
      const researched = priced.lineEstimates.filter(
        (e) => e?.basis.kind === "researched",
      ).length;
      const done = seen.report;
      rows.push({
        case: c.name,
        model,
        band: priced.budgetCheck.band,
        lines: priced.lineEstimates.length,
        researched,
        searches: done?.searchesUsed ?? 0,
        draftSeconds: ((drafted - started) / 1000).toFixed(1),
        totalSeconds: ((finished - started) / 1000).toFixed(1),
        researchDollars: dollars(done),
      });
    });
  }
});
