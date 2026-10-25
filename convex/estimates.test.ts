import { APICallError, RetryError } from "ai";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { formatLakh } from "../lib/format";
import {
  REFERENCE_TABLE_VERSION,
  lineRange,
  planLines,
  pricePlan,
} from "../lib/pricing";
import {
  aaravBirthday,
  jaipurWedding,
  puneGaneshUtsav,
  type WorkedExample,
} from "../lib/pricing/workedExamples";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  type EstimateCtx,
  type EstimateDeps,
  type EstimateLineInput,
  type ModelUsage,
  type ResearchCalls,
  type ResearchInput,
  type ResearchLine,
  type ResearchOutput,
  type ResearchReport,
  RESEARCH_PAUSE_CAP,
  buildExtractCall,
  buildSearchCall,
  cachedOrTableEstimate,
  estimateLines,
  liveEstimateDeps,
  liveKnowledge,
  liveResearchCalls,
  researchLine,
  researchPrompt,
  stubEstimateDeps,
} from "./estimates";
import { insertEvent, newTest } from "./lib/test.helpers";

type T = ReturnType<typeof newTest>;

const HOUR = 60 * 60 * 1000;
// 22 Oct 2026, 10:30 in India.
const NOW = Date.UTC(2026, 9, 22, 5, 0);

/** The action-side context `estimateLines` needs, backed by convex-test. */
function actionCtx(t: T): Parameters<typeof estimateLines>[0] {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  return {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
    runAction: t.action as Call,
  } as unknown as Parameters<typeof estimateLines>[0];
}

async function setup() {
  const t = newTest();
  const eventId = await t.run((ctx) => insertEvent(ctx));
  return { t, eventId, ctx: actionCtx(t) };
}

function deps(overrides: Partial<EstimateDeps> = {}): EstimateDeps {
  return { ...stubEstimateDeps, now: () => NOW, ...overrides };
}

type Answer = Omit<ResearchOutput["results"][number], "key"> & {
  /** The URLs in that call's search results; the answer's own sources by default. */
  searchResultUrls?: string[];
};

/** A research stub that answers each line's call by its category, or finds nothing. */
function researchBy(answers: Record<string, Answer>) {
  return vi.fn(async (input: ResearchInput): Promise<ResearchOutput | null> => {
    const line = input.lines[0]!;
    const answer = answers[line.category];
    if (!answer) return null;
    const { searchResultUrls = answer.sourceUrls, ...result } = answer;
    return {
      model: "claude-sonnet-5-5",
      searchResultUrls,
      searchesUsed: 1,
      usage: [],
      results: [{ key: line.key, ...result }],
    };
  });
}

const cateringAnswer: Answer = {
  unitLow: 1100,
  unitHigh: 1900,
  sourceUrls: ["https://real.in"],
  reasoning: "One Jaipur caterer's price list.",
};

const cateringLine: EstimateLineInput = {
  category: "catering_main",
  quantity: 300,
  unit: "per_plate",
};

async function cacheRows(t: T) {
  return await t.run((ctx) => ctx.db.query("estimateCache").collect());
}

// ---------------------------------------------------------------------------
// Worked examples: research stubbed to return nothing, so every line falls
// through to the reference table pinned at its frozen version.

async function priceWorkedExample(example: WorkedExample, budget?: number) {
  const { ctx, eventId } = await setup();
  const lines = planLines(example.plan);
  const ranges = await estimateLines(
    ctx,
    {
      eventId,
      city: example.city,
      tier: example.tier,
      eventType: example.eventType,
      lines,
    },
    deps(),
  );
  const priced = pricePlan(example.plan, ranges, {
    budget: budget ?? example.budget,
    contingencyShare: 0.1,
    households: example.households,
    city: example.city,
  });
  return { lines, ranges, priced };
}

function eventTotal(priced: ReturnType<typeof pricePlan>): number {
  return (
    priced.entries.reduce((sum, e) => sum + (e?.amount ?? 0), 0) +
    priced.budgetCheck.contingency +
    priced.budgetCheck.unallocated
  );
}

function functionTotal(
  example: WorkedExample,
  priced: ReturnType<typeof pricePlan>,
  key: string,
): number {
  let index = 0;
  for (const fn of example.plan.functions) {
    const count = fn.budgetEntries.length;
    if (fn.key === key) {
      return priced.entries
        .slice(index, index + count)
        .reduce((sum, e) => sum + (e?.amount ?? 0), 0);
    }
    index += count;
  }
  throw new Error(`No Function ${key}`);
}

describe("worked example 1: Jaipur wedding, 300 Guests, ₹25L", () => {
  it("is priced against reference table 2026-10-22", () => {
    expect(REFERENCE_TABLE_VERSION).toBe("2026-10-22");
  });

  it("is tight: Minimum ₹19.62L, Typical ₹32.47L, High ₹45.33L, f ≈ 0.209", async () => {
    const { priced } = await priceWorkedExample(jaipurWedding);
    expect(priced.budgetCheck.band).toBe("tight");
    expect(formatLakh(priced.budgetCheck.minimum)).toBe("₹19.62L");
    expect(formatLakh(priced.budgetCheck.typical)).toBe("₹32.47L");
    expect(formatLakh(priced.budgetCheck.high)).toBe("₹45.33L");
    expect(priced.fraction).toBeCloseTo(0.209, 3);
    expect(priced.note).toBe(
      "₹25L is below the typical ₹32.5L for this plan, so Estimates sit near the low end.",
    );
  });

  it("prices every line from the Y-tier table", async () => {
    const { ranges, priced } = await priceWorkedExample(jaipurWedding);
    for (const range of ranges) {
      expect(range?.basis.kind).toBe("referenceTable");
      expect(range?.basis.tableVersion).toBe("2026-10-22");
      expect(range?.basis.text).toBe(
        "Utsavvy reference table, Y tier, Oct 2026",
      );
    }
    for (const entry of priced.entries) expect(entry?.label).toBe("Estimate");
  });

  it("gives the wedding Function's Entries", async () => {
    const { priced } = await priceWorkedExample(jaipurWedding);
    // Wedding Entries are lines 14 to 18 (after haldi 4, mehendi 5, sangeet 4).
    const wedding = priced.entries.slice(13, 18).map((e) => e?.amount);
    // Catering ₹1,210 per plate × 300, Venue, decor, baraat band and ghodi, pandit.
    expect(wedding).toEqual([363000, 101000, 101000, 40000, 14000]);
  });

  it("matches the Function totals within rounding and comes to exactly ₹25,00,000", async () => {
    const { priced } = await priceWorkedExample(jaipurWedding);
    const expected = {
      haldi: 92000,
      mehendi: 164000,
      sangeet: 464000,
      wedding: 620000,
      reception: 591000,
    };
    for (const [key, amount] of Object.entries(expected)) {
      expect(
        Math.abs(functionTotal(jaipurWedding, priced, key) - amount),
      ).toBeLessThanOrEqual(3000);
    }
    const eventWide = priced.entries
      .slice(22)
      .reduce((sum, e) => sum + (e?.amount ?? 0), 0);
    expect(Math.abs(eventWide - 342000)).toBeLessThanOrEqual(3000);
    expect(
      Math.abs(priced.budgetCheck.contingency - 227000),
    ).toBeLessThanOrEqual(5000);
    expect(priced.budgetCheck.unallocated).toBe(0);
    expect(eventTotal(priced)).toBe(2500000);
  });

  it("the ₹15L variant is flagged about ₹4.6L short and scales Entries to about 76% of their lows", async () => {
    const { priced } = await priceWorkedExample(jaipurWedding, 1500000);
    expect(priced.budgetCheck.band).toBe("belowMinimum");
    expect(priced.note).toBe(
      "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short.",
    );
    expect(priced.belowUsualRange).toBe(true);
    expect(priced.fraction).toBeCloseTo(0.76, 2);
    const lows = priced.entries.reduce((sum, e) => sum + (e?.low ?? 0), 0);
    const amounts = priced.entries.reduce((s, e) => s + (e?.amount ?? 0), 0);
    expect(amounts / lows).toBeCloseTo(0.76, 2);
    for (const entry of priced.entries) {
      expect(entry!.amount / entry!.low).toBeGreaterThan(0.7);
      expect(entry!.amount / entry!.low).toBeLessThan(0.82);
    }
    expect(eventTotal(priced)).toBe(1500000);
  });
});

describe("worked example 2: Aarav's 6th birthday, 60 Guests, ₹1.5L", () => {
  it("is comfortable: Minimum ₹68,900, Typical ₹1,31,500, High ₹1,94,200, f ≈ 0.65", async () => {
    const { priced } = await priceWorkedExample(aaravBirthday);
    expect(REFERENCE_TABLE_VERSION).toBe("2026-10-22");
    expect(priced.budgetCheck.band).toBe("comfortable");
    const toHundred = (n: number) => Math.round(n / 100) * 100;
    expect(toHundred(priced.budgetCheck.minimum)).toBe(68900);
    expect(toHundred(priced.budgetCheck.typical)).toBe(131500);
    expect(toHundred(priced.budgetCheck.high)).toBe(194200);
    expect(priced.fraction).toBeCloseTo(0.65, 2);
    expect(priced.note).toBeNull();
  });

  it("gives every Entry and the Contingency, totalling ₹1,50,000", async () => {
    const { ranges, priced } = await priceWorkedExample(aaravBirthday);
    for (const range of ranges)
      expect(range?.basis.kind).toBe("referenceTable");
    // Catering ₹660 per plate × 60, party hall, decor, cake, entertainer, return gifts, photography.
    expect(priced.entries.map((e) => e?.amount)).toEqual([
      39600, 38000, 18000, 4000, 11000, 11000, 16000,
    ]);
    expect(priced.budgetCheck.contingency).toBe(12400);
    expect(eventTotal(priced)).toBe(150000);
  });
});

describe("worked example 3: Pune Ganesh utsav, 240 households, ₹2.4L", () => {
  it("is tier X and below the minimum: Minimum ₹2,75,700, about ₹36,000 short, ₹1,000 per household", async () => {
    const { ranges, priced } = await priceWorkedExample(puneGaneshUtsav);
    expect(REFERENCE_TABLE_VERSION).toBe("2026-10-22");
    for (const range of ranges) {
      expect(range?.basis.kind).toBe("referenceTable");
      expect(range?.basis.text).toBe(
        "Utsavvy reference table, X tier, Oct 2026",
      );
    }
    const toHundred = (n: number) => Math.round(n / 100) * 100;
    expect(toHundred(priced.budgetCheck.minimum)).toBe(275700);
    expect(toHundred(priced.budgetCheck.typical)).toBe(517300);
    expect(toHundred(priced.budgetCheck.high)).toBe(759000);
    expect(priced.budgetCheck.band).toBe("belowMinimum");
    expect(priced.note).toBe(
      "A plan like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short.",
    );
    expect(priced.budgetCheck.perHousehold).toBe(1000);
    expect(eventTotal(priced)).toBe(240000);
  });
});

// ---------------------------------------------------------------------------
// The estimate cascade (IMPLEMENTATION_PLAN.md section 8, and #80's fixes).

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function args(
  eventId: Id<"events">,
  lines: EstimateLineInput[],
  place: { city?: string; tier?: "X" | "Y" | "Z" } = {},
) {
  return {
    eventId,
    city: place.city ?? "Jaipur",
    tier: place.tier ?? "Y",
    eventType: "wedding" as const,
    lines,
  };
}

/** Collects what one `estimateLines` call reports about its research. */
function reporter() {
  const reports: ResearchReport[] = [];
  return { reports, onResearch: (r: ResearchReport) => reports.push(r) };
}

describe("the cascade's fallback order", () => {
  it("uses a stubbed researched range and labels it researched", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({
      catering_main: {
        unitLow: 1100,
        unitHigh: 1900,
        sourceUrls: ["https://caterer-a.in/menu", "https://caterer-b.in"],
        reasoning: "Two Jaipur caterers list ₹1,100-₹1,900 per plate.",
      },
    });
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research }),
    );
    expect(research).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      unit: "per_plate",
      unitLow: 1100,
      unitHigh: 1900,
      basis: {
        kind: "researched",
        unit: "per_plate",
        unitLow: 1100,
        unitHigh: 1900,
        text: "Researched 22 Oct 2026 · 2 sources",
        sourceUrls: ["https://caterer-a.in/menu", "https://caterer-b.in"],
        searchedAt: NOW,
        reasoning: "Two Jaipur caterers list ₹1,100-₹1,900 per plate.",
        tableVersion: null,
      },
    });
  });

  it("falls to the table, tier multiplier applied, when research is empty", async () => {
    const { ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine], { city: "Pune", tier: "X" }),
      deps(),
    );
    expect(result).toMatchObject({ unitLow: 1250, unitHigh: 2500 });
    expect(result?.basis).toMatchObject({
      kind: "referenceTable",
      tableVersion: "2026-10-22",
      sourceUrls: [],
      searchedAt: null,
      reasoning: null,
      text: "Utsavvy reference table, X tier, Oct 2026",
    });
  });

  it("applies no tier multiplier to a researched range", async () => {
    const { ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine], { city: "Pune", tier: "X" }),
      deps({ research: researchBy({ catering_main: cateringAnswer }) }),
    );
    expect(result).toMatchObject({ unitLow: 1100, unitHigh: 1900 });
  });

  it("gives a free label with empty research the Assistant's own estimate", async () => {
    const { ctx, eventId } = await setup();
    const knowledge = vi.fn(async () => ({
      model: "claude-sonnet-5-5",
      results: [
        {
          key: 0,
          unitLow: 20000,
          unitHigh: 60000,
          reasoning: "Tent houses in Jaipur charge per Function.",
        },
      ],
    }));
    const [result] = await estimateLines(
      ctx,
      args(eventId, [
        { category: "tent house", quantity: 2, unit: "per_function" },
      ]),
      deps({ knowledge }),
    );
    expect(knowledge).toHaveBeenCalledTimes(1);
    expect(result?.basis).toEqual({
      kind: "assistantKnowledge",
      unit: "per_function",
      unitLow: 20000,
      unitHigh: 60000,
      text: "Assistant's own estimate, no sources",
      sourceUrls: [],
      searchedAt: null,
      reasoning: "Tent houses in Jaipur charge per Function.",
      tableVersion: null,
    });
  });

  it("leaves a free label with no Estimate when research and knowledge are both empty", async () => {
    const { ctx, eventId } = await setup();
    const result = await estimateLines(
      ctx,
      args(eventId, [
        { category: "tent house", quantity: 1, unit: "per_function" },
      ]),
      deps(),
    );
    expect(result).toEqual([null]);
  });

  it("skips research and spends no search when Claude isn't reachable", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({ catering_main: cateringAnswer });
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research, claudeReachable: () => false }),
    );
    expect(research).not.toHaveBeenCalled();
    expect(result?.basis.kind).toBe("referenceTable");
  });
});

describe("liveEstimateDeps: research only when Claude is reachable", () => {
  it("skips research without an Anthropic key or when the default model isn't Claude", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("DEFAULT_MODEL", undefined);
    expect(liveEstimateDeps().claudeReachable()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(liveEstimateDeps().claudeReachable()).toBe(true);
    vi.stubEnv("DEFAULT_MODEL", "gemini-3.8-flash");
    expect(liveEstimateDeps().claudeReachable()).toBe(false);
  });

  it("treats an empty DEFAULT_MODEL as unset, like modelChain (L9)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("DEFAULT_MODEL", "");
    expect(liveEstimateDeps().claudeReachable()).toBe(true);
  });
});

describe("on the stub model, no Estimate call reaches a real model (L8)", () => {
  it("keeps research off even with an Anthropic key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    expect(liveEstimateDeps().claudeReachable()).toBe(false);
  });

  it("answers the Assistant's own estimate from the stub, with no network", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google");
    vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new Error("a real model was called")),
    );
    const output = await liveKnowledge(
      {
        eventType: "wedding",
        city: "Jaipur",
        lines: [{ key: 0, label: "tent house", unit: "per_function" }],
      },
      { fetch },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(output?.model).toBe("stub-utsavvy");
    expect(output?.results).toEqual([]);
  });
});

describe("no silent failure (M1)", () => {
  it("reports and logs an API error with its status, and prices the line from the table", async () => {
    const { ctx, eventId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const research = vi.fn(async (): Promise<ResearchOutput | null> => {
      throw new APICallError({
        message: "output_config.format cannot be used with citations",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: {},
        statusCode: 400,
      });
    });
    const { reports, onResearch } = reporter();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research, onResearch }),
    );
    expect(result?.basis.kind).toBe("referenceTable");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.failures).toEqual([
      {
        key: 0,
        label: "Catering, main dinner (sangeet, wedding, reception)",
        reason: "error",
        detail: expect.stringContaining("400"),
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Estimate research fell through.*error.*400/),
    );
  });

  it("reports a research call's own failure, such as hitting the pause cap", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const research = vi.fn(async (): Promise<ResearchOutput | null> => ({
      model: "claude-sonnet-5-5",
      searchResultUrls: [],
      searchesUsed: 2,
      usage: [],
      results: [],
      failure: { reason: "pauseCap", detail: "paused 3 times" },
    }));
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research, onResearch }),
    );
    expect(reports[0]!.failures[0]).toMatchObject({
      reason: "pauseCap",
      detail: "paused 3 times",
    });
    expect(reports[0]!.searchesUsed).toBe(2);
  });

  it("reports a timeout", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        research: () => new Promise<ResearchOutput | null>(() => {}),
        onResearch,
        limits: { ...stubEstimateDeps.limits, researchTimeLimitMs: 20 },
      }),
    );
    expect(reports[0]!.timedOut).toBe(true);
    expect(reports[0]!.failures[0]).toMatchObject({ reason: "timeout" });
  });
});

describe("researchLine: web search first, then structured output (M1)", () => {
  const input: ResearchInput = {
    eventType: "wedding",
    city: "Jaipur",
    lines: [
      {
        key: 0,
        label: "Catering, main dinner",
        category: "catering_main",
        unit: "per_plate",
        listedPrices: [],
      },
    ],
    maxSearches: 2,
    abortSignal: new AbortController().signal,
  };
  const usage = {
    model: "claude-sonnet-5-5",
    inputTokens: 10,
    outputTokens: 5,
  };
  type Turn = Awaited<ReturnType<ResearchCalls["search"]>>;

  function calls(
    turns: Turn[],
    estimates: ResearchOutput["results"] = [
      {
        key: 0,
        unitLow: 1100,
        unitHigh: 1900,
        sourceUrls: ["https://a.in"],
        reasoning: "x",
      },
    ],
  ) {
    const search = vi.fn<ResearchCalls["search"]>(async () => turns.shift()!);
    const extract = vi.fn<ResearchCalls["extract"]>(async () => ({
      estimates,
      usage: { model: "claude-haiku-5-5", inputTokens: 3, outputTokens: 2 },
    }));
    return { search, extract };
  }

  it("continues a paused turn, keeps both turns' URLs and text, then extracts", async () => {
    const c = calls([
      {
        text: "Caterer A lists ₹1,100. ",
        resultUrls: ["https://a.in"],
        searches: 1,
        paused: true,
        continuation: [{ role: "assistant", content: "…" }],
        usage,
      },
      {
        text: "Caterer B lists ₹1,900.",
        resultUrls: ["https://b.in"],
        searches: 1,
        paused: false,
        continuation: [],
        usage,
      },
    ]);
    const output = await researchLine(input, c);
    expect(c.search).toHaveBeenCalledTimes(2);
    // The second turn re-sends the paused assistant content and has one search left.
    expect(c.search.mock.calls[1]![1]).toEqual([
      { role: "assistant", content: "…" },
    ]);
    expect(c.search.mock.calls[1]![2]).toBe(1);
    expect(c.extract).toHaveBeenCalledWith(
      input,
      "Caterer A lists ₹1,100. Caterer B lists ₹1,900.",
      ["https://a.in", "https://b.in"],
    );
    expect(output).toMatchObject({
      searchResultUrls: ["https://a.in", "https://b.in"],
      searchesUsed: 2,
      results: [{ key: 0, unitLow: 1100 }],
    });
    expect(output.failure).toBeUndefined();
    expect(output.usage).toHaveLength(3);
  });

  it("stops at the pause cap and reports it without extracting", async () => {
    const paused: Turn = {
      text: "",
      resultUrls: [],
      searches: 0,
      paused: true,
      continuation: [],
      usage,
    };
    const c = calls(
      Array.from({ length: RESEARCH_PAUSE_CAP + 2 }, () => ({ ...paused })),
    );
    const output = await researchLine({ ...input, maxSearches: 8 }, c);
    expect(c.search).toHaveBeenCalledTimes(RESEARCH_PAUSE_CAP + 1);
    expect(c.extract).not.toHaveBeenCalled();
    expect(output.results).toEqual([]);
    expect(output.failure?.reason).toBe("pauseCap");
  });

  it("reports no output when the search found nothing or extraction returned no range", async () => {
    const empty = await researchLine(
      input,
      calls([
        {
          text: " ",
          resultUrls: [],
          searches: 1,
          paused: false,
          continuation: [],
          usage,
        },
      ]),
    );
    expect(empty.failure?.reason).toBe("noOutput");
    const none = await researchLine(
      input,
      calls(
        [
          {
            text: "Nothing usable.",
            resultUrls: ["https://a.in"],
            searches: 1,
            paused: false,
            continuation: [],
            usage,
          },
        ],
        [],
      ),
    );
    expect(none.failure?.reason).toBe("noOutput");
  });

  it("splits the work: the search call has web search and no structured output, the extraction call has structured output and no tools", () => {
    const search = buildSearchCall(input, [], {
      model: "claude-sonnet-5-5",
      apiKey: "test-key",
      maxUses: 2,
    });
    expect(Object.keys(search.tools)).toEqual(["web_search"]);
    expect("output" in search).toBe(false);
    const extract = buildExtractCall(input, "Caterer A lists ₹1,100.", [
      "https://a.in",
    ]);
    expect("tools" in extract).toBe(false);
    expect(extract.estimateFields).toEqual([
      "key",
      "unitLow",
      "unitHigh",
      "sourceUrls",
      "reasoning",
    ]);
    expect(extract.prompt).toMatch(
      /<outside_content[^>]*>[\s\S]*Caterer A lists ₹1,100\.[\s\S]*<\/outside_content>/,
    );
    expect(extract.prompt).toContain("https://a.in");
  });
});

describe("URLs only", () => {
  it("drops a source URL that wasn't in that call's search results", async () => {
    const { ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        research: researchBy({
          catering_main: {
            ...cateringAnswer,
            sourceUrls: ["https://real.in/prices", "https://made-up.in"],
            searchResultUrls: ["https://real.in/prices"],
          },
        }),
      }),
    );
    expect(result?.basis.sourceUrls).toEqual(["https://real.in/prices"]);
  });

  it("stores the search result's own URL once, never the model's spelling or a text fragment (L2)", async () => {
    const { t, ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        research: researchBy({
          catering_main: {
            ...cateringAnswer,
            sourceUrls: [
              "https://REAL.in/prices/#:~:text=Gold%20menu%20%E2%82%B91%2C350",
              "https://real.in/prices",
            ],
            searchResultUrls: ["https://real.in/prices#top"],
          },
        }),
      }),
    );
    expect(result?.basis.sourceUrls).toEqual(["https://real.in/prices"]);
    expect(result?.basis.text).toBe("Researched 22 Oct 2026 · 1 source");
    expect((await cacheRows(t))[0]?.sourceUrls).toEqual([
      "https://real.in/prices",
    ]);
  });

  it("sends a result left with no URL, a reversed range or a non-positive amount to the table", async () => {
    const { t, ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    const result = await estimateLines(
      ctx,
      args(eventId, [
        cateringLine,
        { category: "venue_large", quantity: 1, unit: "per_function" },
        { category: "decor_main", quantity: 1, unit: "per_function" },
      ]),
      deps({
        onResearch,
        research: researchBy({
          catering_main: {
            ...cateringAnswer,
            sourceUrls: ["https://made-up.in"],
            searchResultUrls: ["https://real.in"],
          },
          venue_large: {
            ...cateringAnswer,
            unitLow: 200000,
            unitHigh: 100000,
          },
          decor_main: { ...cateringAnswer, unitLow: 0, unitHigh: 100000 },
        }),
      }),
    );
    expect(result.map((r) => r?.basis.kind)).toEqual([
      "referenceTable",
      "referenceTable",
      "referenceTable",
    ]);
    expect(await cacheRows(t)).toEqual([]);
    expect(reports[0]!.failures.map((f) => f.reason)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
  });

  it("caps the stored reasoning at 200 characters (L3)", async () => {
    const { t, ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        research: researchBy({
          catering_main: { ...cateringAnswer, reasoning: "x".repeat(500) },
        }),
      }),
    );
    expect(result!.basis.reasoning!.length).toBeLessThanOrEqual(200);
    expect((await cacheRows(t))[0]!.reasoning.length).toBeLessThanOrEqual(200);
  });

  it("stores no page text in the basis or the cache row", async () => {
    const { t, ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine], { city: " Jaipur " }),
      deps({ research: researchBy({ catering_main: cateringAnswer }) }),
    );
    expect(Object.keys(result!.basis).sort()).toEqual(
      [
        "kind",
        "reasoning",
        "searchedAt",
        "sourceUrls",
        "tableVersion",
        "text",
        "unit",
        "unitHigh",
        "unitLow",
      ].sort(),
    );
    const rows = await cacheRows(t);
    expect(rows).toHaveLength(1);
    const { _id, _creationTime, ...row } = rows[0]!;
    expect(row).toEqual({
      cityKey: "jaipur",
      category: "catering_main",
      unit: "per_plate",
      unitLow: 1100,
      unitHigh: 1900,
      sourceUrls: ["https://real.in"],
      reasoning: "One Jaipur caterer's price list.",
      searchedAt: NOW,
      model: "claude-sonnet-5-5",
      expiresAt: NOW + 24 * HOUR,
    });
  });
});

describe("plausibility before the shared cache (M3)", () => {
  it("rejects a researched range outside a third of the row's low to three times its high, at the Event's tier", async () => {
    const { t, ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Tier X main-dinner row: ₹1,250 to ₹2,500 per plate, so the band is about ₹417 to ₹7,500.
    const [total, cheap, fine] = await estimateLines(
      ctx,
      args(
        eventId,
        [
          cateringLine,
          { category: "catering_light", quantity: 60, unit: "per_plate" },
          { category: "catering_standard", quantity: 120, unit: "per_plate" },
        ],
        { city: "Pune", tier: "X" },
      ),
      deps({
        research: researchBy({
          // A line total, not a per-plate price.
          catering_main: {
            ...cateringAnswer,
            unitLow: 330000,
            unitHigh: 570000,
          },
          // Tier X light row is ₹625 to ₹1,125: ₹100 is below a third of its low.
          catering_light: { ...cateringAnswer, unitLow: 100, unitHigh: 400 },
          catering_standard: {
            ...cateringAnswer,
            unitLow: 800,
            unitHigh: 4000,
          },
        }),
      }),
    );
    expect(total?.basis.kind).toBe("referenceTable");
    expect(cheap?.basis.kind).toBe("referenceTable");
    expect(fine?.basis.kind).toBe("researched");
    expect((await cacheRows(t)).map((r) => r.category)).toEqual([
      "catering_standard",
    ]);
  });

  it("uses a researched free label for the Event but doesn't cache it", async () => {
    const { t, ctx, eventId } = await setup();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [
        { category: "tent house", quantity: 1, unit: "per_function" },
      ]),
      deps({
        research: researchBy({
          "tent house": { ...cateringAnswer, unitLow: 20000, unitHigh: 60000 },
        }),
      }),
    );
    expect(result?.basis.kind).toBe("researched");
    expect(await cacheRows(t)).toEqual([]);
  });
});

async function seedShortlistedCaterer(
  t: T,
  eventId: Id<"events">,
  priceUrl: string,
  linkStatus: "considering" | "dropped" | null,
) {
  await t.run(async (ctx) => {
    const vendorId = await ctx.db.insert("vendors", {
      domain: "mlcaterers.in",
      name: "M L Caterers",
      category: "caterer",
      website: "https://mlcaterers.in",
      summary: "Caterer in Jaipur.",
      provenance: [],
      factsSeenAt: "2026-10-21",
      source: "starterSet",
      version: 1,
    });
    await ctx.db.insert("listedPrices", {
      vendorId,
      sourceUrl: priceUrl,
      sentence: "Gold menu ₹1,350 per plate.",
      seenAt: "2026-10-21",
      comparable: true,
      amount: { min: 1350, max: 1350 },
      unit: "per_plate",
      qualifier: "exact",
      text: "₹1,350 per plate",
      supersededAt: null,
    });
    const sectionId = await ctx.db.insert("sections", {
      eventId,
      kind: "vendors",
      name: "Vendors",
      frame: { x: 0, y: 0, w: 100, h: 100 },
      order: 0,
      version: 1,
      deletedAt: null,
    });
    const membershipId = await ctx.db.insert("memberships", {
      eventId,
      userId: await ctx.db.insert("users", {
        clerkId: "meera",
        name: "Meera",
        email: "meera@example.com",
        imageUrl: null,
        mobilePointing: null,
        keepDontReplyOn: false,
      }),
      role: "owner",
      status: "active",
      blocked: false,
      displayName: "Meera",
      joinedAt: 0,
      endedAt: null,
    });
    const createdBy = { kind: "member" as const, membershipId };
    const common = {
      eventId,
      sectionId,
      position: { x: 0, y: 0 },
      size: null,
      functionKey: null,
      createdBy,
      version: 1,
      deletedAt: null,
    };
    const shortlistItemId = await ctx.db.insert("items", {
      ...common,
      kind: "shortlistedVendor",
      data: { vendorId },
    });
    if (linkStatus === null) return;
    const checklistItemId = await ctx.db.insert("items", {
      ...common,
      kind: "checklist",
      data: { note: null },
    });
    const checklistEntryId = await ctx.db.insert("entries", {
      eventId,
      itemId: checklistItemId,
      kind: "checklist",
      order: 0,
      functionKey: null,
      assumed: [],
      createdBy,
      version: 1,
      deletedAt: null,
      fields: {
        vendorCategory: "caterer",
        freeLabel: null,
        functionKeys: [],
        bookByEntryId: null,
        budgetEntryIds: [],
      },
    });
    await ctx.db.insert("vendorLinks", {
      eventId,
      shortlistItemId,
      checklistEntryId,
      status: linkStatus,
      version: 1,
    });
  });
}

describe("the cache", () => {
  it("runs no search for the same city, category and unit within 24 hours", async () => {
    const { ctx, eventId } = await setup();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research: researchBy({ catering_main: cateringAnswer }) }),
    );
    const second = researchBy({ catering_main: cateringAnswer });
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine], { city: "jaipur" }),
      deps({ research: second, now: () => NOW + 23 * HOUR }),
    );
    expect(second).not.toHaveBeenCalled();
    expect(result?.basis).toMatchObject({
      kind: "researched",
      sourceUrls: ["https://real.in"],
      searchedAt: NOW,
    });
  });

  it("searches again after 24 hours", async () => {
    const { ctx, eventId } = await setup();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research: researchBy({ catering_main: cateringAnswer }) }),
    );
    const again = researchBy({ catering_main: cateringAnswer });
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research: again, now: () => NOW + 24 * HOUR + 1 }),
    );
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("researches a line with the Event's Listed prices on its own and writes no cache row from it (L1)", async () => {
    const { t, ctx, eventId } = await setup();
    const priceUrl = "https://mlcaterers.in/menu";
    await seedShortlistedCaterer(t, eventId, priceUrl, null);
    const research = researchBy({
      catering_main: {
        unitLow: 1200,
        unitHigh: 1800,
        sourceUrls: [priceUrl, "https://other.in"],
        searchResultUrls: ["https://other.in"],
        reasoning: "The shortlisted caterer's Gold menu and one other.",
      },
      venue_large: { ...cateringAnswer, unitLow: 80000, unitHigh: 150000 },
    });
    const [catering, venue] = await estimateLines(
      ctx,
      args(eventId, [
        cateringLine,
        { category: "venue_large", quantity: 1, unit: "per_function" },
      ]),
      deps({ research }),
    );
    // One call per line: the Listed price reaches only its own line's call.
    const inputs = research.mock.calls.map(([input]) => input.lines);
    expect(inputs).toHaveLength(2);
    for (const lines of inputs) expect(lines).toHaveLength(1);
    const cateringCall = inputs.find(
      (l) => l[0]!.category === "catering_main",
    )!;
    const venueCall = inputs.find((l) => l[0]!.category === "venue_large")!;
    expect(cateringCall[0]!.listedPrices).toEqual([
      {
        url: priceUrl,
        min: 1350,
        max: 1350,
        unit: "per_plate",
        qualifier: "exact",
      },
    ]);
    expect(venueCall[0]!.listedPrices).toEqual([]);
    // The Listed price's URL counts as a source; that line stays on this Event only.
    expect(catering?.basis.sourceUrls).toEqual([priceUrl, "https://other.in"]);
    expect(venue?.basis.kind).toBe("researched");
    expect((await cacheRows(t)).map((r) => r.category)).toEqual([
      "venue_large",
    ]);
  });

  it("leaves out a Shortlisted Vendor whose links are all Dropped (L7)", async () => {
    const { t, ctx, eventId } = await setup();
    await seedShortlistedCaterer(
      t,
      eventId,
      "https://mlcaterers.in/menu",
      "dropped",
    );
    const research = researchBy({});
    await estimateLines(ctx, args(eventId, [cateringLine]), deps({ research }));
    expect(research.mock.calls[0]![0].lines[0]!.listedPrices).toEqual([]);
  });

  it("keeps a Shortlisted Vendor with a link still in play", async () => {
    const { t, ctx, eventId } = await setup();
    await seedShortlistedCaterer(
      t,
      eventId,
      "https://mlcaterers.in/menu",
      "considering",
    );
    const research = researchBy({});
    await estimateLines(ctx, args(eventId, [cateringLine]), deps({ research }));
    expect(research.mock.calls[0]![0].lines[0]!.listedPrices).toHaveLength(1);
  });
});

describe("limits", () => {
  it("researches at most 8 of 12 uncached lines, one call each, free labels first, then the largest table highs", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({});
    const lines: EstimateLineInput[] = [
      { category: "dhol", quantity: 1, unit: "per_function" }, // ₹20,000
      { category: "catering_main", quantity: 300, unit: "per_plate" }, // ₹6,00,000
      { category: "venue_large", quantity: 1, unit: "per_function" }, // ₹2,00,000
      { category: "invitations", quantity: 150, unit: "per_card" }, // ₹37,500
      { category: "tent house", quantity: 1, unit: "per_function" }, // free label
      { category: "outfits", quantity: 1, unit: "per_event" }, // ₹2,50,000
      { category: "makeup", quantity: 1, unit: "per_event" }, // ₹1,20,000
      { category: "transport_misc", quantity: 1, unit: "per_event" }, // ₹75,000
      { category: "baraat_band_ghodi", quantity: 1, unit: "per_function" }, // ₹80,000
      { category: "light and sound", quantity: 1, unit: "per_function" }, // free label
      { category: "pandit_puja", quantity: 1, unit: "per_function" }, // ₹30,000
      { category: "photography_video", quantity: 4, unit: "per_day" }, // ₹2,00,000
    ];
    await estimateLines(ctx, args(eventId, lines), deps({ research }));
    const calls = research.mock.calls.map(([input]) => input);
    expect(calls.map((c) => c.lines[0]!.key)).toEqual([
      4, 9, 1, 5, 2, 11, 6, 8,
    ]);
    expect(
      calls.reduce((sum, c) => sum + c.maxSearches, 0),
    ).toBeLessThanOrEqual(8);
  });

  it("gives a few lines up to 2 searches each, never more than 8 in total", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({});
    await estimateLines(
      ctx,
      args(eventId, [
        cateringLine,
        { category: "venue_large", quantity: 1, unit: "per_function" },
        { category: "decor_main", quantity: 1, unit: "per_function" },
      ]),
      deps({ research }),
    );
    expect(research.mock.calls.map(([i]) => i.maxSearches)).toEqual([2, 2, 2]);
  });

  it("ranks a category by its lines' summed high, and a unit the table lacks as a free label (L5)", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({});
    await estimateLines(
      ctx,
      args(eventId, [
        { category: "outfits", quantity: 1, unit: "per_event" }, // ₹2,50,000
        { category: "venue_large", quantity: 1, unit: "per_function" }, // 3 × ₹2,00,000
        { category: "venue_large", quantity: 1, unit: "per_function" },
        { category: "venue_large", quantity: 1, unit: "per_function" },
        { category: "makeup", quantity: 2, unit: "per_day" }, // no table row in this unit
      ]),
      deps({
        research,
        limits: { ...stubEstimateDeps.limits, maxSearchesPerCall: 2 },
      }),
    );
    expect(research.mock.calls.map(([i]) => i.lines[0]!.category)).toEqual([
      "makeup",
      "venue_large",
    ]);
  });

  it("keeps lines that finished before the shared deadline and sends only the unfinished ones to the table (M2)", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const signals: AbortSignal[] = [];
    const fast = researchBy({ catering_main: cateringAnswer });
    const research = vi.fn((input: ResearchInput) => {
      signals.push(input.abortSignal);
      return input.lines[0]!.category === "catering_main"
        ? fast(input)
        : new Promise<ResearchOutput | null>(() => {});
    });
    const started = Date.now();
    const [catering, venue] = await estimateLines(
      ctx,
      args(eventId, [
        cateringLine,
        { category: "venue_large", quantity: 1, unit: "per_function" },
      ]),
      deps({
        research,
        limits: { ...stubEstimateDeps.limits, researchTimeLimitMs: 50 },
      }),
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(catering?.basis.kind).toBe("researched");
    expect(venue?.basis.kind).toBe("referenceTable");
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("the context type (L4)", () => {
  it("needs an action context: a mutation context can't call estimateLines", () => {
    expectTypeOf<MutationCtx>().not.toExtend<EstimateCtx>();
  });
});

describe("no model arithmetic", () => {
  it("₹1,100 to ₹1,900 per plate for 300 Guests is code's ₹3,30,000 to ₹5,70,000", async () => {
    const { ctx, eventId } = await setup();
    const [range] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research: researchBy({ catering_main: cateringAnswer }) }),
    );
    expect(range).toMatchObject({ unitLow: 1100, unitHigh: 1900 });
    expect(lineRange(range!, 300)).toEqual({ low: 330000, high: 570000 });
  });
});

describe("privacy", () => {
  it("the Jaipur wedding's research prompts have no Guest name, budget, Event ID or Brief text", async () => {
    const { ctx, eventId } = await setup();
    const research = researchBy({});
    await estimateLines(
      ctx,
      args(eventId, planLines(jaipurWedding.plan)),
      deps({ research }),
    );
    const brief =
      "My sister's wedding in Jaipur in February 2027, around 300 people, budget 25 lakh.";
    expect(research.mock.calls.length).toBeGreaterThan(0);
    for (const [input] of research.mock.calls) {
      expect(Object.keys(input).sort()).toEqual(
        ["abortSignal", "city", "eventType", "lines", "maxSearches"].sort(),
      );
      const prompt = researchPrompt(input);
      for (const text of [JSON.stringify(input.lines), prompt]) {
        expect(text).not.toContain(eventId as Id<"events">);
        expect(text).not.toMatch(/25,00,000|2500000|25 ?lakh|₹25L/i);
        expect(text).not.toMatch(/sister|Meera|Aarav/i);
        expect(text).not.toContain(brief);
      }
      expect(prompt).toContain("Jaipur");
      expect(prompt).toContain("wedding");
    }
  });

  it("wraps Listed prices in the prompt as outside data, not instructions", () => {
    const prompt = researchPrompt({
      eventType: "wedding",
      city: "Jaipur",
      lines: [
        {
          key: 0,
          label: "Catering, main dinner",
          category: "catering_main",
          unit: "per_plate",
          listedPrices: [
            {
              url: "https://mlcaterers.in/menu",
              min: 1350,
              max: 1350,
              unit: "per_plate",
              qualifier: "exact",
            },
          ],
        },
      ],
      maxSearches: 2,
      abortSignal: new AbortController().signal,
    });
    expect(prompt).toContain("https://mlcaterers.in/menu");
    expect(prompt).toMatch(
      /<outside_content[^>]*>[\s\S]*1350[\s\S]*<\/outside_content>/,
    );
  });
});

describe("cachedOrTableEstimate (for queries)", () => {
  async function insertCacheRow(t: T, expiresAt: number) {
    await t.run((ctx) =>
      ctx.db.insert("estimateCache", {
        cityKey: "jaipur",
        category: "catering_main",
        unit: "per_plate",
        unitLow: 1100,
        unitHigh: 1900,
        sourceUrls: ["https://real.in"],
        reasoning: "x",
        searchedAt: NOW,
        model: "claude-sonnet-5-5",
        expiresAt,
      }),
    );
  }

  it("reads a fresh cache row", async () => {
    const t = newTest();
    await insertCacheRow(t, NOW + 24 * HOUR);
    const result = await t.run((ctx) =>
      cachedOrTableEstimate(
        ctx,
        "Jaipur",
        "Y",
        "catering_main",
        "per_plate",
        NOW + HOUR,
      ),
    );
    expect(result).toMatchObject({
      unitLow: 1100,
      unitHigh: 1900,
      basis: { kind: "researched", sourceUrls: ["https://real.in"] },
    });
  });

  it("ignores an expired row and falls back to the table", async () => {
    const t = newTest();
    await insertCacheRow(t, NOW + 24 * HOUR);
    const result = await t.run((ctx) =>
      cachedOrTableEstimate(
        ctx,
        "Jaipur",
        "Y",
        "catering_main",
        "per_plate",
        NOW + 25 * HOUR,
      ),
    );
    expect(result).toMatchObject({
      unitLow: 1000,
      unitHigh: 2000,
      basis: { kind: "referenceTable" },
    });
  });

  it("is null for a free label with no cache row", async () => {
    const t = newTest();
    const result = await t.run((ctx) =>
      cachedOrTableEstimate(
        ctx,
        "Jaipur",
        "Y",
        "tent house",
        "per_function",
        NOW,
      ),
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round 2 of #80 (review of PR #85).

describe("nothing falls through silently (L1)", () => {
  it("reports research that returned nothing", async () => {
    const { ctx, eventId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({ research: async () => null, onResearch }),
    );
    expect(result?.basis.kind).toBe("referenceTable");
    expect(reports[0]!.failures).toEqual([
      expect.objectContaining({
        key: 0,
        reason: "noOutput",
        detail: "research returned nothing",
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("research returned nothing"),
    );
  });

  it("takes a call's only result even when the model got the key wrong", async () => {
    const { ctx, eventId } = await setup();
    const research = vi.fn(
      async (input: ResearchInput): Promise<ResearchOutput | null> => ({
        model: "claude-sonnet-5-5",
        searchResultUrls: ["https://real.in"],
        searchesUsed: 1,
        usage: [],
        results: [{ key: input.lines[0]!.key + 13, ...cateringAnswer }],
      }),
    );
    const [, catering] = await estimateLines(
      ctx,
      args(eventId, [
        { category: "dhol", quantity: 1, unit: "per_function" },
        cateringLine,
      ]),
      deps({ research }),
    );
    expect(catering?.basis.kind).toBe("researched");
  });

  it("reports a call with no estimate for its line", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        onResearch,
        research: async () => ({
          model: "claude-sonnet-5-5",
          searchResultUrls: [],
          searchesUsed: 1,
          usage: [],
          results: [],
        }),
      }),
    );
    expect(reports[0]!.failures[0]).toMatchObject({
      reason: "noOutput",
      detail: "no estimate for key 0",
    });
  });

  it("reports a missing Anthropic key from the live research call instead of returning nothing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const output = await liveEstimateDeps().research(
      {
        eventType: "wedding",
        city: "Jaipur",
        lines: [
          {
            key: 0,
            label: "Catering",
            category: "catering_main",
            unit: "per_plate",
            listedPrices: [],
          },
        ],
        maxSearches: 1,
        abortSignal: new AbortController().signal,
      },
      { searches: 0, usage: [] },
    );
    expect(output?.failure).toEqual({
      reason: "noOutput",
      detail: "ANTHROPIC_API_KEY isn't set, or the default model isn't Claude",
    });
  });
});

describe("the report counts what was spent (L2)", () => {
  const turn = {
    model: "claude-sonnet-5-5",
    inputTokens: 900,
    outputTokens: 80,
  };

  it("counts the finished turns of a line that then timed out, and says it was still in flight", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        onResearch,
        limits: { ...stubEstimateDeps.limits, researchTimeLimitMs: 30 },
        research: (_input, meter) => {
          // One search turn finished and was billed, then the next never returns.
          meter.searches += 1;
          meter.usage.push(turn);
          return new Promise<ResearchOutput | null>(() => {});
        },
      }),
    );
    expect(reports[0]).toMatchObject({
      searchesUsed: 1,
      usage: [turn],
      inFlightAtDeadline: 1,
      timedOut: true,
    });
  });

  it("reports the Assistant's own estimate's usage", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reports, onResearch } = reporter();
    const knowledgeUsage = {
      model: "claude-sonnet-5-5",
      inputTokens: 120,
      outputTokens: 40,
    };
    await estimateLines(
      ctx,
      args(eventId, [
        { category: "tent house", quantity: 1, unit: "per_function" },
      ]),
      deps({
        onResearch,
        knowledge: async () => ({
          model: "claude-sonnet-5-5",
          usage: [knowledgeUsage],
          results: [
            { key: 0, unitLow: 20000, unitHigh: 60000, reasoning: "x" },
          ],
        }),
      }),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.knowledgeUsage).toEqual([knowledgeUsage]);
  });
});

describe("the error detail keeps the status after the SDK's retries (L8)", () => {
  it("unwraps a RetryError to its last API error", async () => {
    const { ctx, eventId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const overloaded = new APICallError({
      message: "Overloaded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 529,
    });
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      deps({
        onResearch,
        research: async () => {
          throw new RetryError({
            message: "Failed after 3 attempts. Last error: Overloaded",
            reason: "maxRetriesExceeded",
            errors: [overloaded, overloaded, overloaded],
          });
        },
      }),
    );
    expect(reports[0]!.failures[0]!.detail).toMatch(/HTTP 529/);
  });
});

describe("a paused turn keeps its notes (L3)", () => {
  const input: ResearchInput = {
    eventType: "wedding",
    city: "Jaipur",
    lines: [
      {
        key: 0,
        label: "Catering, main dinner",
        category: "catering_main",
        unit: "per_plate",
        listedPrices: [],
      },
    ],
    maxSearches: 1,
    abortSignal: new AbortController().signal,
  };
  const usage = { model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1 };
  const estimate = {
    key: 0,
    unitLow: 1100,
    unitHigh: 1900,
    sourceUrls: ["https://a.in"],
    reasoning: "x",
  };

  it("extracts from the notes so far when the line's search budget is spent", async () => {
    const extract = vi.fn<ResearchCalls["extract"]>(async () => ({
      estimates: [estimate],
      usage,
    }));
    const output = await researchLine(input, {
      search: async () => ({
        text: "Caterer A lists ₹1,100 to ₹1,900.",
        resultUrls: ["https://a.in"],
        searches: 1,
        paused: true,
        continuation: [],
        usage,
      }),
      extract,
    });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(output.results).toEqual([estimate]);
    expect(output.failure).toBeUndefined();
  });

  it("names the spent budget and the pause cap as different reasons", async () => {
    const paused = (searches: number) => async () => ({
      text: "Nothing usable yet.",
      resultUrls: [],
      searches,
      paused: true,
      continuation: [],
      usage,
    });
    const noRange = async () => ({ estimates: [], usage });
    const spent = await researchLine(input, {
      search: paused(1),
      extract: noRange,
    });
    expect(spent.failure).toEqual({
      reason: "pauseCap",
      detail: "the line's 1 search was spent while the turn was paused",
    });
    const capped = await researchLine(
      { ...input, maxSearches: 8 },
      { search: paused(0), extract: noRange },
    );
    expect(capped.failure).toEqual({
      reason: "pauseCap",
      detail: `the search turn paused ${RESEARCH_PAUSE_CAP + 1} times`,
    });
  });
});

describe("both calls are tuned for the deadline (L4)", () => {
  it("asks for low effort and caps the output", () => {
    const input: ResearchInput = {
      eventType: "wedding",
      city: "Jaipur",
      lines: [],
      maxSearches: 1,
      abortSignal: new AbortController().signal,
    };
    const search = buildSearchCall(input, [], {
      model: "claude-sonnet-5-5",
      apiKey: "test-key",
      maxUses: 1,
    });
    const extract = buildExtractCall(input, "notes", []);
    for (const call of [search, extract]) {
      expect(call.providerOptions).toEqual({ anthropic: { effort: "low" } });
      expect(call.maxOutputTokens).toBeGreaterThan(0);
      expect(call.maxOutputTokens).toBeLessThanOrEqual(2000);
    }
  });
});

describe("the live calls against canned Anthropic responses (L7)", () => {
  function message(
    content: unknown[],
    stopReason: string,
    usage: Record<string, unknown>,
  ) {
    return {
      id: `msg_${Math.random().toString(36).slice(2)}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20, ...usage },
    };
  }

  it("continues a paused search turn, reads the result URLs and the billed search count, then extracts", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("HELPER_MODEL", undefined);
    const bodies: Record<string, unknown>[] = [];
    const searchReplies = [
      message(
        [
          {
            type: "server_tool_use",
            id: "srvtoolu_1",
            name: "web_search",
            input: { query: "wedding catering per plate Jaipur" },
          },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [
              {
                type: "web_search_result",
                url: "https://caterer-a.in/menu",
                title: "Menu",
                page_age: null,
                encrypted_content: "abc",
              },
            ],
          },
          // A second search the API refused: it isn't billed.
          {
            type: "server_tool_use",
            id: "srvtoolu_2",
            name: "web_search",
            input: { query: "catering Jaipur" },
          },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_2",
            content: {
              type: "web_search_tool_result_error",
              error_code: "max_uses_exceeded",
            },
          },
        ],
        "pause_turn",
        { server_tool_use: { web_search_requests: 1 } },
      ),
      message(
        [
          {
            type: "text",
            text: "Caterer A lists ₹1,100 to ₹1,900 per plate (https://caterer-a.in/menu).",
          },
        ],
        "end_turn",
        { server_tool_use: { web_search_requests: 0 } },
      ),
    ];
    const extractReply = message(
      [
        {
          type: "text",
          text: JSON.stringify({
            estimates: [
              {
                key: 0,
                unitLow: 1100,
                unitHigh: 1900,
                sourceUrls: ["https://caterer-a.in/menu"],
                reasoning: "One caterer's own menu.",
              },
            ],
          }),
        },
      ],
      "end_turn",
      {},
    );
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const reply = body.tools ? searchReplies.shift()! : extractReply;
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const meter = { searches: 0, usage: [] as ModelUsage[] };
    const output = await researchLine(
      {
        eventType: "wedding",
        city: "Jaipur",
        lines: [
          {
            key: 0,
            label: "Catering, main dinner",
            category: "catering_main",
            unit: "per_plate",
            listedPrices: [],
          },
        ],
        maxSearches: 2,
        abortSignal: new AbortController().signal,
      },
      liveResearchCalls("claude-sonnet-5-5", "test-key", { fetch }),
      meter,
    );

    expect(bodies).toHaveLength(3);
    // The continuation re-sends the paused turn's search blocks.
    const resent = JSON.stringify(bodies[1]!.messages);
    expect(resent).toContain("server_tool_use");
    expect(resent).toContain("web_search_tool_result");
    // The extraction call has no tools.
    expect(bodies[2]!.tools).toBeUndefined();
    // Low effort and the output caps reach both requests (N1).
    const config = (body: Record<string, unknown>) =>
      body.output_config as Record<string, unknown> | undefined;
    expect(config(bodies[0]!)?.effort).toBe("low");
    expect(bodies[0]!.max_tokens).toBe(2000);
    expect(config(bodies[2]!)?.effort).toBe("low");
    expect(config(bodies[2]!)?.format).toBeDefined();
    expect(bodies[2]!.max_tokens).toBe(1000);
    expect(output).toMatchObject({
      searchResultUrls: ["https://caterer-a.in/menu"],
      searchesUsed: 1,
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://caterer-a.in/menu"],
        },
      ],
    });
    expect(output.failure).toBeUndefined();
    expect(meter.searches).toBe(1);
    expect(meter.usage.map((u) => u.model)).toEqual([
      "claude-sonnet-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
  });

  /** A reply cut off at the output cap, so its JSON doesn't parse. */
  const truncated = (model: string) => ({
    ...message(
      [{ type: "text", text: '{"estimates":[{"key":0,"unitLow":11' }],
      "max_tokens",
      { output_tokens: 1000 },
    ),
    model,
  });

  function cannedFetch(replies: (body: Record<string, unknown>) => unknown) {
    return vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(replies(body)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
  }

  it("keeps the extraction's usage and says why when its output doesn't parse (N3)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("HELPER_MODEL", undefined);
    const fetch = cannedFetch((body) =>
      body.tools
        ? message(
            [{ type: "text", text: "Caterer A lists ₹1,100 a plate." }],
            "end_turn",
            { server_tool_use: { web_search_requests: 1 } },
          )
        : truncated("claude-haiku-5-5"),
    );
    const meter = { searches: 0, usage: [] as ModelUsage[] };
    const output = await researchLine(
      {
        eventType: "wedding",
        city: "Jaipur",
        lines: [
          {
            key: 0,
            label: "Catering, main dinner",
            category: "catering_main",
            unit: "per_plate",
            listedPrices: [],
          },
        ],
        maxSearches: 1,
        abortSignal: new AbortController().signal,
      },
      liveResearchCalls("claude-sonnet-5-5", "test-key", { fetch }),
      meter,
    );
    expect(output.results).toEqual([]);
    expect(output.failure?.reason).toBe("noOutput");
    expect(output.failure?.detail).toMatch(/didn't parse.*length/);
    expect(meter.usage.map((u) => u.model)).toEqual([
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
    expect(meter.usage[1]!.outputTokens).toBe(1000);
    expect(output.usage).toHaveLength(2);
  });

  it("keeps the Assistant's own estimate's usage when its output doesn't parse (N3)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("DEFAULT_MODEL", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const output = await liveKnowledge(
      {
        eventType: "wedding",
        city: "Jaipur",
        lines: [{ key: 0, label: "tent house", unit: "per_function" }],
      },
      { fetch: cannedFetch(() => truncated("claude-sonnet-5-5")) },
    );
    expect(output?.results).toEqual([]);
    expect(output?.usage).toEqual([
      { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 1000 },
    ]);
  });
});

describe("the report times the Assistant's own estimate too (N2)", () => {
  it("adds the knowledge call's time as knowledgeMs", async () => {
    const { ctx, eventId } = await setup();
    const { reports, onResearch } = reporter();
    await estimateLines(
      ctx,
      args(eventId, [
        { category: "tent house", quantity: 1, unit: "per_function" },
      ]),
      deps({
        onResearch,
        knowledge: async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {
            model: "claude-sonnet-5-5",
            results: [
              { key: 0, unitLow: 20000, unitHigh: 60000, reasoning: "x" },
            ],
          };
        },
      }),
    );
    expect(reports[0]!.knowledgeMs).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// #108: the live path against canned responses in the shapes Claude Sonnet 5.5
// and Claude Haiku 5.5 send today (adaptive thinking on by default, empty
// `thinking` blocks under the default `display: "omitted"`, web search
// citations on text blocks, `pause_turn`, a 400, a request still in flight at
// the deadline). No real model is called.

describe("the live path against Claude 5.5 response shapes (issue 108)", () => {
  const catering: ResearchLine = {
    key: 0,
    label: "Catering, main dinner",
    category: "catering_main",
    unit: "per_plate",
    listedPrices: [],
  };
  const lineInput = (maxSearches = 2): ResearchInput => ({
    eventType: "wedding",
    city: "Jaipur",
    lines: [catering],
    maxSearches,
    abortSignal: new AbortController().signal,
  });

  function reply(
    content: unknown[],
    stopReason: string,
    usage: Record<string, unknown> = {},
    model = "claude-sonnet-5-5",
  ) {
    return {
      id: `msg_${Math.random().toString(36).slice(2)}`,
      type: "message",
      role: "assistant",
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 100, output_tokens: 20, ...usage },
    };
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const emptyThinking = (signature: string) => ({
    type: "thinking",
    thinking: "",
    signature,
  });
  const searchUse = {
    type: "server_tool_use",
    id: "srvtoolu_1",
    name: "web_search",
    input: { query: "wedding catering per plate Jaipur" },
  };
  const searchResult = {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_1",
    content: [
      {
        type: "web_search_result",
        url: "https://caterer-a.in/menu",
        title: "Menu and prices",
        page_age: "2 weeks ago",
        encrypted_content: "enc_page_1",
      },
    ],
  };
  const extraction = reply(
    [
      emptyThinking("sig_extract"),
      {
        type: "text",
        text: JSON.stringify({
          estimates: [
            {
              key: 0,
              unitLow: 1100,
              unitHigh: 1900,
              sourceUrls: ["https://caterer-a.in/menu"],
              reasoning: "One Jaipur caterer's own menu.",
            },
          ],
        }),
      },
    ],
    "end_turn",
    {},
    "claude-haiku-5-5",
  );

  function useClaudeOnly() {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("HELPER_MODEL", undefined);
    vi.stubEnv("DEFAULT_MODEL", undefined);
  }

  it("says why a search turn wrote no notes: the stop reason, such as max_tokens or refusal", async () => {
    useClaudeOnly();
    for (const stop of ["max_tokens", "refusal"]) {
      const fetch = vi.fn(async () =>
        json(reply([emptyThinking("sig_1")], stop, { output_tokens: 2000 })),
      ) as unknown as typeof globalThis.fetch;
      const output = await researchLine(
        lineInput(),
        liveResearchCalls("claude-sonnet-5-5", "test-key", { fetch }),
      );
      expect(output.results).toEqual([]);
      expect(output.failure?.reason).toBe("noOutput");
      expect(output.failure?.detail).toContain(stop);
    }
  });

  it("reads cited notes after a paused turn, re-sends the paused turn unchanged, and never asks for structured output with web search", async () => {
    useClaudeOnly();
    const bodies: Record<string, unknown>[] = [];
    const searchReplies = [
      reply(
        [emptyThinking("sig_paused"), searchUse, searchResult],
        "pause_turn",
        { server_tool_use: { web_search_requests: 1 } },
      ),
      reply(
        [
          emptyThinking("sig_final"),
          { type: "text", text: "Prices found: " },
          {
            type: "text",
            text: "Caterer A lists ₹1,100 to ₹1,900 per plate (https://caterer-a.in/menu).",
            citations: [
              {
                type: "web_search_result_location",
                url: "https://caterer-a.in/menu",
                title: "Menu and prices",
                encrypted_index: "enc_index_1",
                cited_text: "Veg plate ₹1,100, premium plate ₹1,900",
              },
            ],
          },
        ],
        "end_turn",
        { server_tool_use: { web_search_requests: 0 } },
      ),
    ];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return json(body.tools ? searchReplies.shift()! : extraction);
    }) as unknown as typeof globalThis.fetch;

    const output = await researchLine(
      lineInput(),
      liveResearchCalls("claude-sonnet-5-5", "test-key", { fetch }),
    );

    expect(bodies).toHaveLength(3);
    // Citations are always on with web search and can't be combined with
    // `output_config.format` (a 400), so neither search request asks for it.
    for (const body of bodies.slice(0, 2)) {
      const config = body.output_config as Record<string, unknown> | undefined;
      expect(config?.format).toBeUndefined();
    }
    // The continuation appends the paused turn as it came back: the thinking
    // block with its signature, then the search blocks, in order and with the
    // encrypted page content, so preserved thinking sees no edited history.
    const messages = bodies[1]!.messages as {
      role: string;
      content: Record<string, unknown>[];
    }[];
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const resent = messages[1]!.content;
    expect(resent.map((b) => b.type)).toEqual([
      "thinking",
      "server_tool_use",
      "web_search_tool_result",
    ]);
    expect(resent[0]).toMatchObject({ thinking: "", signature: "sig_paused" });
    expect(resent[1]).toMatchObject({ id: "srvtoolu_1", name: "web_search" });
    expect(JSON.stringify(resent[2])).toContain("enc_page_1");
    // The extraction gets the notes from every text block, cited or not.
    expect(JSON.stringify(bodies[2]!.messages)).toContain(
      "Prices found: Caterer A lists ₹1,100 to ₹1,900 per plate",
    );
    expect(output.failure).toBeUndefined();
    expect(output).toMatchObject({
      searchResultUrls: ["https://caterer-a.in/menu"],
      searchesUsed: 1,
      results: [{ key: 0, unitLow: 1100, unitHigh: 1900 }],
    });
  });

  /** `estimateLines` with the real research calls on a canned `fetch`. */
  function liveDeps(
    fetch: typeof globalThis.fetch,
    overrides: Partial<EstimateDeps> = {},
  ) {
    return deps({
      research: (input, meter) =>
        researchLine(
          input,
          liveResearchCalls("claude-sonnet-5-5", "test-key", { fetch }),
          meter,
        ),
      ...overrides,
    });
  }

  it("reports a 400 from the API with its status, prices the line from the table and caches nothing", async () => {
    useClaudeOnly();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t, ctx, eventId } = await setup();
    const fetch = vi.fn(async () =>
      json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Citations are not supported with output_config.format.",
          },
        },
        400,
      ),
    ) as unknown as typeof globalThis.fetch;
    const { reports, onResearch } = reporter();
    const [result] = await estimateLines(
      ctx,
      args(eventId, [cateringLine]),
      liveDeps(fetch, { onResearch }),
    );
    expect(result?.basis.kind).toBe("referenceTable");
    expect(reports[0]!.failures).toEqual([
      expect.objectContaining({
        reason: "error",
        detail: expect.stringMatching(/^HTTP 400: .*Citations/),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/fell through.*error \(HTTP 400/),
    );
    // A 400 isn't retried.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await cacheRows(t)).toEqual([]);
  });

  it("aborts the request still in flight at the deadline and keeps the line that finished", async () => {
    useClaudeOnly();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx, eventId } = await setup();
    let abortedRequests = 0;
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (JSON.stringify(body).includes("Catering")) {
        return json(
          body.tools
            ? reply(
                [
                  searchUse,
                  searchResult,
                  {
                    type: "text",
                    text: "Caterer A lists ₹1,100 to ₹1,900 per plate.",
                  },
                ],
                "end_turn",
                { server_tool_use: { web_search_requests: 1 } },
              )
            : extraction,
        );
      }
      // The venue's search never answers until the deadline aborts it.
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          abortedRequests++;
          reject(init.signal!.reason);
        });
      });
    }) as unknown as typeof globalThis.fetch;
    const { reports, onResearch } = reporter();
    const started = Date.now();
    const [cateringResult, venue] = await estimateLines(
      ctx,
      args(eventId, [
        cateringLine,
        { category: "venue_large", quantity: 1, unit: "per_function" },
      ]),
      liveDeps(fetch, {
        onResearch,
        limits: { ...stubEstimateDeps.limits, researchTimeLimitMs: 300 },
      }),
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect(cateringResult?.basis.kind).toBe("researched");
    expect(venue?.basis.kind).toBe("referenceTable");
    expect(reports[0]!.failures).toEqual([
      expect.objectContaining({
        reason: "timeout",
        label: "Venue, large (>150 Guests)",
      }),
    ]);
    expect(reports[0]!.inFlightAtDeadline).toBe(1);
    // The deadline's abort reaches the network request, so it stops billing.
    await vi.waitFor(() => expect(abortedRequests).toBe(1));
  });
});
