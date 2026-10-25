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
 * API credits. They run only when you ask, with the key given in the shell:
 *
 *   EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval
 *
 * (add GOOGLE_GENERATIVE_AI_API_KEY to try the fallback). The key never goes
 * in `.env.local`: Bun loads that file on every run, and the Convex keys are
 * set with `bunx convex env set`; `vitest.eval.config.ts` refuses a live run
 * when `.env.local` holds one. Never in CI. Live prices vary, so a case checks
 * that the line came back researched, with sources, rather than exact numbers.
 *
 * Reading the table it prints: `basis` is what each case's line came back as,
 * `searches`, `seconds` and `dollars` are what the case spent, and
 * `fellThrough` says why a line went to the table (`error` with the HTTP
 * status, `timeout`, `pauseCap`, `noOutput` with the stop reason, or
 * `rejected` with the plausibility band). A `seconds` near 20 means the
 * research deadline, not the model, set the time.
 */

const LIVE = process.env.EVAL_LIVE === "1";
const KEY = Boolean(process.env.ANTHROPIC_API_KEY);

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
  for (const u of [...report.usage, ...report.knowledgeUsage]) {
    const price = TOKEN_PRICES[u.model];
    if (!price) {
      unpriced = true;
      continue;
    }
    total +=
      (u.inputTokens * price.input + u.outputTokens * price.output) / 1e6;
  }
  const notes = [
    unpriced ? "unpriced model" : null,
    report.inFlightAtDeadline > 0
      ? `${report.inFlightAtDeadline} timed out, unpriced`
      : null,
  ].filter(Boolean);
  return `${total.toFixed(4)}${notes.length ? ` + ${notes.join(" + ")}` : ""}`;
}

function models(usage: ModelUsage[]): string {
  return [...new Set(usage.map((u) => u.model))].join(", ");
}

const reports: { name: string; report: ResearchReport; basis?: string }[] = [];

afterAll(() => {
  if (reports.length === 0) return;
  console.table(
    reports.map(({ name, report, basis }) => ({
      case: name,
      basis: basis ?? "none",
      models: models([...report.usage, ...report.knowledgeUsage]),
      searches: report.searchesUsed,
      seconds: ((report.ms + report.knowledgeMs) / 1000).toFixed(1),
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
  const entry = reports.findLast((r) => r.name === name);
  if (entry) entry.basis = result?.basis.kind ?? "none";
  return result ?? null;
}

/**
 * The real check is that the line came back researched, with a source. The
 * band asserts can't fail on their own: the cascade already rejects a range
 * outside [row low / 3, row high × 3] and sends that line to the table, so an
 * out-of-band answer shows up as `referenceTable` here.
 */
function expectResearched(
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
      // The table path: research is skipped, so nothing is called or reported.
      { ...stubEstimateDeps, claudeReachable: () => false },
    );
    expect(result).toMatchObject({
      unitLow: 1000,
      unitHigh: 2000,
      basis: { kind: "referenceTable" },
    });
  });
});

describe.runIf(LIVE && !KEY)("live Estimate research, misconfigured", () => {
  it("needs ANTHROPIC_API_KEY in the shell", () => {
    throw new Error(
      "EVAL_LIVE=1 is set but ANTHROPIC_API_KEY isn't: pass it in the shell, EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval",
    );
  });
});

describe.runIf(LIVE && KEY)("live Estimate research", () => {
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
    expectResearched(result, "catering_main", "per_plate", "Y");
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
    expectResearched(result, "pandal_decor", "per_event", "X");
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
    expect(["researched", "assistantKnowledge"]).toContain(result?.basis.kind);
    expect(result!.unitLow).toBeGreaterThan(0);
    expect(result!.unitLow).toBeLessThanOrEqual(result!.unitHigh);
  });
});
