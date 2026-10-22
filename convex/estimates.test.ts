import { describe, expect, it, vi } from "vitest";
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
import {
  type EstimateDeps,
  type EstimateLineInput,
  type ResearchInput,
  type ResearchOutput,
  buildResearchCall,
  cachedOrTableEstimate,
  estimateLines,
  liveEstimateDeps,
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

function researchReturning(
  output: Omit<ResearchOutput, "model" | "searchesUsed"> &
    Partial<Pick<ResearchOutput, "model" | "searchesUsed">>,
) {
  return vi.fn(async (_input: ResearchInput): Promise<ResearchOutput> => ({
    model: "claude-sonnet-5-5",
    searchesUsed: 1,
    ...output,
  }));
}

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
// The estimate cascade (IMPLEMENTATION_PLAN.md section 8).

describe("the cascade's fallback order", () => {
  it("uses a stubbed researched range and labels it researched", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({
      searchResultUrls: ["https://caterer-a.in/menu", "https://caterer-b.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://caterer-a.in/menu", "https://caterer-b.in"],
          reasoning: "Two Jaipur caterers list ₹1,100-₹1,900 per plate.",
        },
      ],
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
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
      {
        eventId,
        city: "Pune",
        tier: "X",
        eventType: "wedding",
        lines: [cateringLine],
      },
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
    const research = researchReturning({
      searchResultUrls: ["https://pune-caterer.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://pune-caterer.in"],
          reasoning: "One Pune caterer.",
        },
      ],
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Pune",
        tier: "X",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
    );
    expect(result).toMatchObject({ unitLow: 1100, unitHigh: 1900 });
  });

  it("gives a free label with empty research the Assistant's own estimate", async () => {
    const { ctx, eventId } = await setup();
    const knowledge = vi.fn(async () => ({
      model: "claude-haiku-5-5",
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
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [{ category: "tent house", quantity: 2, unit: "per_function" }],
      },
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
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [{ category: "tent house", quantity: 1, unit: "per_function" }],
      },
      deps(),
    );
    expect(result).toEqual([null]);
  });

  it("falls through to the table when research throws", async () => {
    const { ctx, eventId } = await setup();
    const research = vi.fn(async () => {
      throw new Error("credit balance is too low");
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
    );
    expect(result?.basis.kind).toBe("referenceTable");
  });

  it("skips research and spends no search when Claude isn't reachable", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({ searchResultUrls: [], results: [] });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
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
    vi.unstubAllEnvs();
  });
});

describe("URLs only", () => {
  it("drops a source URL that wasn't in that call's search results", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({
      searchResultUrls: ["https://real.in/prices"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://real.in/prices", "https://made-up.in"],
          reasoning: "x",
        },
      ],
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
    );
    expect(result?.basis.sourceUrls).toEqual(["https://real.in/prices"]);
  });

  it("sends a result left with no URL, a reversed range or a non-positive amount to the table", async () => {
    const { t, ctx, eventId } = await setup();
    const research = researchReturning({
      searchResultUrls: ["https://real.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://made-up.in"],
          reasoning: "x",
        },
        {
          key: 1,
          unitLow: 2000,
          unitHigh: 1000,
          sourceUrls: ["https://real.in"],
          reasoning: "x",
        },
        {
          key: 2,
          unitLow: 0,
          unitHigh: 50000,
          sourceUrls: ["https://real.in"],
          reasoning: "x",
        },
      ],
    });
    const result = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [
          cateringLine,
          { category: "venue_large", quantity: 1, unit: "per_function" },
          { category: "decor_main", quantity: 1, unit: "per_function" },
        ],
      },
      deps({ research }),
    );
    expect(result.map((r) => r?.basis.kind)).toEqual([
      "referenceTable",
      "referenceTable",
      "referenceTable",
    ]);
    expect(await cacheRows(t)).toEqual([]);
  });

  it("stores no page text in the basis or the cache row", async () => {
    const { t, ctx, eventId } = await setup();
    const research = researchReturning({
      searchResultUrls: ["https://real.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://real.in"],
          reasoning: "One caterer's price list.",
        },
      ],
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: " Jaipur ",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
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
      reasoning: "One caterer's price list.",
      searchedAt: NOW,
      model: "claude-sonnet-5-5",
      expiresAt: NOW + 24 * HOUR,
    });
  });
});

describe("the cache", () => {
  const oneResult = () =>
    researchReturning({
      searchResultUrls: ["https://real.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://real.in"],
          reasoning: "x",
        },
      ],
    });

  it("runs no search for the same city, category and unit within 24 hours", async () => {
    const { ctx, eventId } = await setup();
    const args = {
      eventId,
      city: "Jaipur",
      tier: "Y" as const,
      eventType: "wedding" as const,
      lines: [cateringLine],
    };
    const first = oneResult();
    await estimateLines(ctx, args, deps({ research: first }));
    const second = oneResult();
    const [result] = await estimateLines(
      ctx,
      { ...args, city: "jaipur" },
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
    const args = {
      eventId,
      city: "Jaipur",
      tier: "Y" as const,
      eventType: "wedding" as const,
      lines: [cateringLine],
    };
    await estimateLines(ctx, args, deps({ research: oneResult() }));
    const again = oneResult();
    await estimateLines(
      ctx,
      args,
      deps({ research: again, now: () => NOW + 24 * HOUR + 1 }),
    );
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("writes no cache row from a result that used the Event's Listed prices", async () => {
    const { t, ctx, eventId } = await setup();
    const priceUrl = "https://mlcaterers.in/menu";
    await t.run(async (db) => {
      const vendorId = await db.db.insert("vendors", {
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
      await db.db.insert("listedPrices", {
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
      const sectionId = await db.db.insert("sections", {
        eventId,
        kind: "vendors",
        name: "Vendors",
        frame: { x: 0, y: 0, w: 100, h: 100 },
        order: 0,
        version: 1,
        deletedAt: null,
      });
      const membershipId = await db.db.insert("memberships", {
        eventId,
        userId: await db.db.insert("users", {
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
      await db.db.insert("items", {
        eventId,
        sectionId,
        kind: "shortlistedVendor",
        data: { vendorId },
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        createdBy: { kind: "member", membershipId },
        version: 1,
        deletedAt: null,
      });
    });
    const research = researchReturning({
      searchResultUrls: ["https://other.in"],
      results: [
        {
          key: 0,
          unitLow: 1200,
          unitHigh: 1800,
          sourceUrls: [priceUrl, "https://other.in"],
          reasoning: "The shortlisted caterer's Gold menu and one other.",
        },
      ],
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
    );
    // The Listed price reached the prompt as data with its page URL…
    expect(research.mock.calls[0]![0].lines[0]!.listedPrices).toEqual([
      {
        url: priceUrl,
        min: 1350,
        max: 1350,
        unit: "per_plate",
        qualifier: "exact",
      },
    ]);
    // …its URL counts as a source, and the result stays on this Event only.
    expect(result?.basis.sourceUrls).toEqual([priceUrl, "https://other.in"]);
    expect(await cacheRows(t)).toEqual([]);
  });
});

describe("limits", () => {
  it("researches at most 8 of 12 uncached lines, free labels first, then the largest table highs", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({ searchResultUrls: [], results: [] });
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
    await estimateLines(
      ctx,
      { eventId, city: "Jaipur", tier: "Y", eventType: "wedding", lines },
      deps({ research }),
    );
    expect(research).toHaveBeenCalledTimes(1);
    const input = research.mock.calls[0]![0];
    expect(input.maxSearches).toBe(8);
    expect(input.lines.map((l) => l.key)).toEqual([4, 9, 1, 5, 2, 11, 6, 8]);
  });

  it("cuts a research call that never resolves off at the time limit and prices its lines from the table", async () => {
    const { ctx, eventId } = await setup();
    let signal: AbortSignal | undefined;
    const research = vi.fn((input: ResearchInput) => {
      signal = input.abortSignal;
      return new Promise<ResearchOutput | null>(() => {});
    });
    const [result] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({
        research,
        limits: { ...stubEstimateDeps.limits, researchTimeLimitMs: 30 },
      }),
    );
    expect(result?.basis.kind).toBe("referenceTable");
    expect(signal?.aborted).toBe(true);
  });
});

describe("no model arithmetic", () => {
  it("₹1,100 to ₹1,900 per plate for 300 Guests is code's ₹3,30,000 to ₹5,70,000", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({
      searchResultUrls: ["https://real.in"],
      results: [
        {
          key: 0,
          unitLow: 1100,
          unitHigh: 1900,
          sourceUrls: ["https://real.in"],
          reasoning: "x",
        },
      ],
    });
    const [range] = await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: [cateringLine],
      },
      deps({ research }),
    );
    expect(range).toMatchObject({ unitLow: 1100, unitHigh: 1900 });
    expect(lineRange(range!, 300)).toEqual({ low: 330000, high: 570000 });
  });

  it("asks the model for a per-unit range, URLs and one line of reasoning, never a total, with web search as its only tool", () => {
    const call = buildResearchCall(
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
        maxSearches: 8,
        abortSignal: new AbortController().signal,
      },
      { model: "claude-sonnet-5-5", apiKey: "test-key" },
    );
    expect(Object.keys(call.tools)).toEqual(["web_search"]);
    expect(call.estimateFields).toEqual([
      "key",
      "unitLow",
      "unitHigh",
      "sourceUrls",
      "reasoning",
    ]);
  });
});

describe("privacy", () => {
  it("the Jaipur wedding's research prompt has no Guest name, budget, Event ID or Brief text", async () => {
    const { ctx, eventId } = await setup();
    const research = researchReturning({ searchResultUrls: [], results: [] });
    await estimateLines(
      ctx,
      {
        eventId,
        city: "Jaipur",
        tier: "Y",
        eventType: "wedding",
        lines: planLines(jaipurWedding.plan),
      },
      deps({ research }),
    );
    const input = research.mock.calls[0]![0];
    expect(Object.keys(input).sort()).toEqual(
      ["abortSignal", "city", "eventType", "lines", "maxSearches"].sort(),
    );
    const prompt = researchPrompt(input);
    const brief =
      "My sister's wedding in Jaipur in February 2027, around 300 people, budget 25 lakh.";
    for (const text of [JSON.stringify(input.lines), prompt]) {
      expect(text).not.toContain(eventId as Id<"events">);
      expect(text).not.toMatch(/25,00,000|2500000|25 ?lakh|₹25L/i);
      expect(text).not.toMatch(/sister|Meera|Aarav/i);
      expect(text).not.toContain(brief);
    }
    expect(prompt).toContain("Jaipur");
    expect(prompt).toContain("wedding");
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
      maxSearches: 8,
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
