import { afterAll, describe, expect, it } from "vitest";
import {
  type ResearchReport,
  estimateLines,
  liveEstimateDeps,
} from "../convex/estimates";
import { insertEvent, newTest } from "../convex/lib/test.helpers";
import { tableRange } from "../lib/pricing";
import type { CityTier, EventType } from "../lib/types";

/**
 * Scripted cases for live Estimate research (IMPLEMENTATION_PLAN.md section 8,
 * "Scripted Assistant cases"). They call `estimateLines` directly with the real
 * research and knowledge calls, so they spend API credits: run them with
 * `bun run eval` and ANTHROPIC_API_KEY (and GOOGLE_GENERATIVE_AI_API_KEY for the
 * fallback) set, never in CI. Live prices vary, so they check tolerance bands,
 * not exact numbers: a researched per-unit range must sit inside a third of the
 * table row's low to three times its high.
 */

// Sonnet 5.5 at $2 / $10 per million tokens; web search at $10 per 1,000 searches.
const DOLLARS = { input: 2 / 1e6, output: 10 / 1e6, search: 10 / 1000 };

const reports: { name: string; report: ResearchReport }[] = [];

afterAll(() => {
  if (reports.length === 0) return;
  console.table(
    reports.map(({ name, report }) => ({
      case: name,
      model: report.model,
      lines: report.lines,
      searches: report.searchesUsed,
      seconds: (report.ms / 1000).toFixed(1),
      timedOut: report.timedOut,
      dollars: (
        report.inputTokens * DOLLARS.input +
        report.outputTokens * DOLLARS.output +
        report.searchesUsed * DOLLARS.search
      ).toFixed(3),
    })),
  );
});

async function run(
  name: string,
  args: {
    city: string;
    tier: CityTier;
    eventType: EventType;
    category: string;
    quantity: number;
    unit: string;
  },
) {
  const t = newTest();
  const eventId = await t.run((ctx) => insertEvent(ctx, `Eval: ${name}`));
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  const ctx = {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
  } as unknown as Parameters<typeof estimateLines>[0];
  const [result] = await estimateLines(
    ctx,
    {
      eventId,
      city: args.city,
      tier: args.tier,
      eventType: args.eventType,
      lines: [
        { category: args.category, quantity: args.quantity, unit: args.unit },
      ],
    },
    {
      ...liveEstimateDeps(),
      onResearch: (report) => reports.push({ name, report }),
    },
  );
  return result ?? null;
}

function expectInsideBand(
  result: Awaited<ReturnType<typeof run>>,
  category: string,
  unit: string,
  tier: CityTier,
) {
  const row = tableRange(category, unit, tier)!;
  expect(result?.basis.kind).toBe("researched");
  expect(result!.basis.sourceUrls.length).toBeGreaterThanOrEqual(1);
  expect(result!.unitLow).toBeGreaterThanOrEqual(row.unitLow / 3);
  expect(result!.unitHigh).toBeLessThanOrEqual(row.unitHigh * 3);
}

describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  "live Estimate research",
  () => {
    it("Jaipur wedding catering comes back researched, inside the band", async () => {
      const result = await run("Jaipur wedding catering", {
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        category: "catering_main",
        quantity: 300,
        unit: "per_plate",
      });
      expectInsideBand(result, "catering_main", "per_plate", "Y");
    });

    it("Pune Ganesh utsav pandal and decor comes back researched, inside the band", async () => {
      const result = await run("Pune Ganesh utsav pandal and decor", {
        city: "Pune",
        tier: "X",
        eventType: "community",
        category: "pandal_decor",
        quantity: 1,
        unit: "per_event",
      });
      expectInsideBand(result, "pandal_decor", "per_event", "X");
    });

    it("a tent house in Jaipur comes back researched or the Assistant's own estimate", async () => {
      const result = await run("Tent house in Jaipur", {
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        category: "tent house",
        quantity: 1,
        unit: "per_function",
      });
      expect(["researched", "assistantKnowledge"]).toContain(
        result?.basis.kind,
      );
      expect(result!.unitLow).toBeGreaterThan(0);
      expect(result!.unitLow).toBeLessThanOrEqual(result!.unitHigh);
    });
  },
);
