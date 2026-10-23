import { afterAll, describe, expect, it } from "vitest";
import {
  type EstimateDeps,
  type ModelUsage,
  type ResearchReport,
  estimateLines,
  liveEstimateDeps,
  stubEstimateDeps,
} from "../convex/estimates";
import { insertEvent, newTest } from "../convex/lib/test.helpers";
import { tableRange } from "../lib/pricing";
import type { CityTier, EventType } from "../lib/types";

/**
 * Scripted cases for live Estimate research (IMPLEMENTATION_PLAN.md section 8,
 * "Scripted Assistant cases"). They call `estimateLines` directly, in
 * `convex-test`, with the real research and knowledge calls, so they spend
 * API credits: run `bun run eval` with ANTHROPIC_API_KEY set (in the shell or
 * in `.env.local`, which Bun loads), plus GOOGLE_GENERATIVE_AI_API_KEY for the
 * fallback. Never in CI. Live prices vary, so they check tolerance bands, not
 * exact numbers: a researched per-unit range must sit inside a third of the
 * table row's low to three times its high.
 */

/** Dollars per million tokens, from the Claude pricing table (checked 2026-10-23). */
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
/** Anthropic web search: $10 per 1,000 searches. */
const SEARCH_DOLLARS = 10 / 1000;

function dollars(report: ResearchReport): string {
  let total = report.searchesUsed * SEARCH_DOLLARS;
  let unpriced = false;
  for (const u of report.usage) {
    const price = TOKEN_PRICES[u.model];
    if (!price) {
      unpriced = true;
      continue;
    }
    total +=
      (u.inputTokens * price.input + u.outputTokens * price.output) / 1e6;
  }
  return `${total.toFixed(4)}${unpriced ? " + unpriced model" : ""}`;
}

function models(usage: ModelUsage[]): string {
  return [...new Set(usage.map((u) => u.model))].join(", ");
}

const reports: { name: string; report: ResearchReport }[] = [];

afterAll(() => {
  if (reports.length === 0) return;
  console.table(
    reports.map(({ name, report }) => ({
      case: name,
      models: models(report.usage),
      searches: report.searchesUsed,
      seconds: (report.ms / 1000).toFixed(1),
      dollars: dollars(report),
      fellThrough: report.failures
        .map((f) => `${f.reason}: ${f.detail}`)
        .join("; "),
    })),
  );
});

async function run(
  name: string,
  line: {
    city: string;
    tier: CityTier;
    eventType: EventType;
    category: string;
    quantity: number;
    unit: string;
  },
  deps: Partial<EstimateDeps>,
) {
  const t = newTest();
  const eventId = await t.run((ctx) => insertEvent(ctx, `Eval: ${name}`));
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  const ctx = {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
    runAction: t.action as Call,
  } as unknown as Parameters<typeof estimateLines>[0];
  const [result] = await estimateLines(
    ctx,
    {
      eventId,
      city: line.city,
      tier: line.tier,
      eventType: line.eventType,
      lines: [
        { category: line.category, quantity: line.quantity, unit: line.unit },
      ],
    },
    { ...deps, onResearch: (report) => reports.push({ name, report }) },
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

describe("the eval harness", () => {
  it("runs estimateLines in convex-test with no model calls (the table path)", async () => {
    const result = await run(
      "Harness check, no model calls",
      {
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        category: "catering_main",
        quantity: 300,
        unit: "per_plate",
      },
      stubEstimateDeps,
    );
    expect(result).toMatchObject({
      unitLow: 1000,
      unitHigh: 2000,
      basis: { kind: "referenceTable" },
    });
  });
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  "live Estimate research",
  () => {
    it("Jaipur wedding catering comes back researched, inside the band", async () => {
      const result = await run(
        "Jaipur wedding catering",
        {
          city: "Jaipur",
          tier: "Y",
          eventType: "wedding",
          category: "catering_main",
          quantity: 300,
          unit: "per_plate",
        },
        liveEstimateDeps(),
      );
      expectInsideBand(result, "catering_main", "per_plate", "Y");
    });

    it("Pune Ganesh utsav pandal and decor comes back researched, inside the band", async () => {
      const result = await run(
        "Pune Ganesh utsav pandal and decor",
        {
          city: "Pune",
          tier: "X",
          eventType: "community",
          category: "pandal_decor",
          quantity: 1,
          unit: "per_event",
        },
        liveEstimateDeps(),
      );
      expectInsideBand(result, "pandal_decor", "per_event", "X");
    });

    it("a tent house in Jaipur comes back researched or the Assistant's own estimate", async () => {
      const result = await run(
        "Tent house in Jaipur",
        {
          city: "Jaipur",
          tier: "Y",
          eventType: "wedding",
          category: "tent house",
          quantity: 1,
          unit: "per_function",
        },
        liveEstimateDeps(),
      );
      expect(["researched", "assistantKnowledge"]).toContain(
        result?.basis.kind,
      );
      expect(result!.unitLow).toBeGreaterThan(0);
      expect(result!.unitLow).toBeLessThanOrEqual(result!.unitHigh);
    });
  },
);
