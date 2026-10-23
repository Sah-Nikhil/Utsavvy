import { describe, expect, it } from "vitest";
import type { DraftBudgetLine } from "../types";
import { referenceTableBasis } from "./basis";
import {
  type LineEstimate,
  lineRange,
  perHousehold,
  planLines,
  pricePlan,
} from "./pricePlan";

// Rule tests: they hold for any ranges, so the ranges here are made up.

function range(unit: string, unitLow: number, unitHigh: number): LineEstimate {
  return {
    unit,
    unitLow,
    unitHigh,
    basis: referenceTableBasis({ unit, unitLow, unitHigh, tier: "Y" }),
  };
}

function line(category: string, quantity: number, unit: string) {
  return { category, quantity, unit } satisfies DraftBudgetLine;
}

/** A plan with every line Event-wide. */
function plan(...lines: DraftBudgetLine[]) {
  return { functions: [], eventWide: lines };
}

const C = { contingencyShare: 0.1 };

function total(result: ReturnType<typeof pricePlan>): number {
  const entries = result.entries.reduce((sum, e) => sum + (e?.amount ?? 0), 0);
  return (
    entries + result.budgetCheck.contingency + result.budgetCheck.unallocated
  );
}

describe("lineRange: code multiplies, the model never does", () => {
  it("₹1,100 to ₹1,900 per plate for 300 Guests is ₹3,30,000 to ₹5,70,000", () => {
    expect(lineRange({ unitLow: 1100, unitHigh: 1900 }, 300)).toEqual({
      low: 330000,
      high: 570000,
    });
  });

  it("gives whole rupees for a tier-multiplied unit price", () => {
    expect(lineRange({ unitLow: 37.5, unitHigh: 75 }, 150)).toEqual({
      low: 5625,
      high: 11250,
    });
    expect(lineRange({ unitLow: 0.8 * 333, unitHigh: 1 }, 1)).toEqual({
      low: 266,
      high: 1,
    });
  });
});

describe("planLines lists the budget lines in pricing order", () => {
  it("each Function's lines in order, then the Event-wide lines", () => {
    const a = line("a", 1, "per_function");
    const b = line("b", 2, "per_function");
    const c = line("c", 3, "per_event");
    expect(
      planLines({
        functions: [{ budgetEntries: [a] }, { budgetEntries: [b] }],
        eventWide: [c],
      }),
    ).toEqual([a, b, c]);
  });
});

describe("the Budget check bands", () => {
  // One line, ₹1,00,000 to ₹2,00,000: Minimum ₹1,10,000, Typical ₹1,65,000, High ₹2,20,000.
  const p = plan(line("x", 1, "per_function"));
  const r = [range("per_function", 100000, 200000)];
  const band = (budget: number) =>
    pricePlan(p, r, { budget, ...C }).budgetCheck.band;

  it("works out Minimum, Typical and High with the Contingency", () => {
    const { budgetCheck } = pricePlan(p, r, { budget: 150000, ...C });
    expect(budgetCheck).toMatchObject({
      minimum: 110000,
      typical: 165000,
      high: 220000,
    });
  });

  it("below the minimum", () => expect(band(109999)).toBe("belowMinimum"));
  it("tight from the minimum", () => expect(band(110000)).toBe("tight"));
  it("tight below typical", () => expect(band(164999)).toBe("tight"));
  it("comfortable from typical", () =>
    expect(band(165000)).toBe("comfortable"));
  it("comfortable up to high", () => expect(band(220000)).toBe("comfortable"));
  it("above high", () => expect(band(220001)).toBe("aboveHigh"));
});

describe("tight and comfortable: every Entry at the same fraction f", () => {
  it("puts both lines at f = 0.75 and the Contingency at 10%", () => {
    // Entries total ₹3,30,000 / 1.1 = ₹3,00,000; lows ₹1,50,000, highs ₹3,50,000; f = 0.75.
    const result = pricePlan(
      plan(line("x", 1, "per_function"), line("y", 1, "per_function")),
      [
        range("per_function", 100000, 200000),
        range("per_function", 50000, 150000),
      ],
      { budget: 330000, ...C },
    );
    expect(result.entries.map((e) => e?.amount)).toEqual([175000, 125000]);
    expect(result.entries[0]).toMatchObject({
      low: 100000,
      high: 200000,
      label: "Estimate",
    });
    expect(result.budgetCheck).toMatchObject({
      band: "comfortable",
      contingency: 30000,
      unallocated: 0,
    });
    expect(result.belowUsualRange).toBe(false);
    expect(total(result)).toBe(330000);
  });
});

describe("rounding goes into the Contingency", () => {
  it("rounds Entries to the nearest ₹1,000 and keeps the total at the budget", () => {
    // Each line lands at ₹11,364 before rounding.
    const result = pricePlan(
      plan(line("x", 1, "per_function"), line("y", 1, "per_function")),
      [
        range("per_function", 10000, 20000),
        range("per_function", 10000, 20000),
      ],
      { budget: 25000, ...C },
    );
    expect(result.entries.map((e) => e?.amount)).toEqual([11000, 11000]);
    expect(result.budgetCheck.contingency).toBe(3000);
    expect(total(result)).toBe(25000);
  });

  it("rounds a per-plate price to ₹10 and doesn't round the line again", () => {
    // ₹400 to ₹800 per plate for 60 Guests, budget ₹43,500: about ₹659 a plate.
    const result = pricePlan(
      plan(line("catering", 60, "per_plate")),
      [range("per_plate", 400, 800)],
      { budget: 43500, ...C },
    );
    expect(result.entries[0]?.amount).toBe(39600);
    expect(result.budgetCheck.contingency).toBe(3900);
    expect(total(result)).toBe(43500);
  });

  it("keeps every amount in whole rupees", () => {
    const result = pricePlan(
      plan(
        line("a", 150, "per_guest_day"),
        line("b", 7, "per_card"),
        line("c", 1, "per_function"),
      ),
      [
        range("per_guest_day", 37.5, 75),
        range("per_card", 80, 250),
        range("per_function", 12345, 67891),
      ],
      { budget: 123457, ...C },
    );
    const amounts = [
      ...result.entries.flatMap((e) => (e ? [e.low, e.high, e.amount] : [])),
      ...Object.values(result.budgetCheck).filter(
        (v): v is number => typeof v === "number",
      ),
    ];
    for (const amount of amounts) expect(Number.isInteger(amount)).toBe(true);
    expect(total(result)).toBe(123457);
  });
});

describe("above high", () => {
  it("puts every Entry at its high, rounded down so none exceeds it, the Contingency at 10% of them, the rest Unallocated (L6)", () => {
    const result = pricePlan(
      plan(line("x", 1, "per_function"), line("cards", 150, "per_card")),
      [range("per_function", 100000, 200000), range("per_card", 80, 250)],
      { budget: 1000000, ...C },
    );
    // 150 cards at ₹250 is ₹37,500, rounded down to ₹37,000.
    expect(result.entries.map((e) => e?.amount)).toEqual([200000, 37000]);
    expect(result.budgetCheck).toMatchObject({
      band: "aboveHigh",
      contingency: 23700,
      unallocated: 739300,
    });
    expect(total(result)).toBe(1000000);
    expect(result.note).toBe(
      "₹10L is above the high end of ₹2.61L for this plan, so every Estimate sits at its high end and ₹7,39,300 is Unallocated.",
    );
  });

  it("floors a per-plate high to ₹10 a plate (L6)", () => {
    // Tier X light catering tops out at ₹1,125 a plate: ₹1,120 × 60.
    const result = pricePlan(
      plan(line("catering", 60, "per_plate")),
      [range("per_plate", 625, 1125)],
      { budget: 500000, ...C },
    );
    expect(result.entries[0]?.amount).toBe(67200);
    expect(total(result)).toBe(500000);
  });

  it("never puts an Entry above its high, even at f = 1 in the comfortable band", () => {
    // Budget exactly at High: f = 1, and ₹37,500 must not round up to ₹38,000.
    const result = pricePlan(
      plan(line("cards", 150, "per_card")),
      [range("per_card", 80, 250)],
      { budget: 41250, ...C },
    );
    expect(result.budgetCheck.band).toBe("comfortable");
    expect(result.entries[0]?.amount).toBe(37000);
    expect(total(result)).toBe(41250);
  });

  it("keeps the total at the budget just above high", () => {
    const result = pricePlan(
      plan(line("cards", 150, "per_card")),
      [range("per_card", 80, 250)],
      { budget: 41251, ...C },
    );
    expect(result.budgetCheck).toMatchObject({
      band: "aboveHigh",
      contingency: 3700,
      unallocated: 551,
    });
    expect(total(result)).toBe(41251);
  });
});

describe("rounding never takes the Contingency below zero (L6)", () => {
  it("reduces the largest Entry, a rounding step at a time, instead", () => {
    // Three ₹2,400 lows scaled to ₹1,500 each round up to ₹2,000: ₹6,000 against ₹4,950.
    const result = pricePlan(
      plan(
        line("a", 1, "per_function"),
        line("b", 1, "per_function"),
        line("c", 1, "per_function"),
      ),
      [
        range("per_function", 2400, 3000),
        range("per_function", 2400, 3000),
        range("per_function", 2400, 3000),
      ],
      { budget: 4950, ...C },
    );
    expect(result.budgetCheck.band).toBe("belowMinimum");
    expect(result.entries.map((e) => e?.amount)).toEqual([1000, 1000, 2000]);
    expect(result.budgetCheck.contingency).toBe(950);
    expect(total(result)).toBe(4950);
  });
});

describe("below the minimum: plan at my budget anyway", () => {
  it("scales every Entry's low by the same factor and marks them below the usual range", () => {
    // Entries ₹88,000 / 1.1 = ₹80,000 against lows of ₹1,00,000: 80%.
    const result = pricePlan(
      plan(line("x", 1, "per_function")),
      [range("per_function", 100000, 200000)],
      { budget: 88000, ...C },
    );
    expect(result.entries[0]?.amount).toBe(80000);
    expect(result.budgetCheck).toMatchObject({
      band: "belowMinimum",
      contingency: 8000,
      unallocated: 0,
    });
    expect(result.belowUsualRange).toBe(true);
    expect(total(result)).toBe(88000);
  });
});

describe("a line with no Estimate yet", () => {
  it("counts as zero and the note says so", () => {
    const result = pricePlan(
      plan(line("x", 1, "per_function"), line("tent", 1, "per_function")),
      [range("per_function", 100000, 200000), null],
      { budget: 330000, ...C },
    );
    expect(result.entries[1]).toBeNull();
    expect(result.budgetCheck.minimum).toBe(110000);
    expect(result.note).toContain(
      "1 line has no Estimate yet and counts as zero.",
    );
    expect(total(result)).toBe(330000);
  });

  it("refuses ranges that don't match the plan's lines", () => {
    expect(() =>
      pricePlan(plan(line("x", 1, "per_function")), [], {
        budget: 1,
        ...C,
      }),
    ).toThrow(/1 budget lines but 0 ranges/);
  });
});

describe("perHousehold", () => {
  it("is ₹1,000 for ₹2,40,000 over 240 households", () => {
    expect(perHousehold(240000, 240)).toBe(1000);
  });
  it("rounds to the rupee", () => expect(perHousehold(100000, 3)).toBe(33333));
  it("is null without households", () => {
    expect(perHousehold(240000, null)).toBeNull();
    expect(perHousehold(240000, 0)).toBeNull();
  });
  it("lands on the Budget check when households are given", () => {
    const result = pricePlan(
      plan(line("x", 1, "per_function")),
      [range("per_function", 100000, 200000)],
      { budget: 240000, households: 240, ...C },
    );
    expect(result.budgetCheck.perHousehold).toBe(1000);
  });
});
