import { describe, expect, it } from "vitest";
import {
  planLines,
  pricePlan,
  referenceTableBasis,
  tableRange,
  type LineEstimate,
} from "@/lib/pricing";
import { jaipurWedding } from "@/lib/pricing/workedExamples";
import type { EntryFields } from "@/lib/types/canvas";
import { budgetRollup, entryAmount, type RollupEntry } from "./rollup";

/*
 * The Jaipur wedding's Budget as the first plan lays it out (first-brief.md
 * worked example 1), priced on the reference-table path, then with the demo
 * seed's change (IMPLEMENTATION_PLAN.md section 9.1): 300 Guests at the
 * sangeet, its catering line set to ₹2,45,000, and the Contingency absorbing
 * the difference so the Event total stays ₹25,00,000.
 */

const BUDGET = 2_500_000;

function line(
  fields: Partial<EntryFields<"budget">> & { label: string },
): EntryFields<"budget"> {
  return {
    category: null,
    quantity: 1,
    unit: "per_event",
    estimate: null,
    plannedAmount: null,
    role: "line",
    belowUsualRange: false,
    editedByMember: false,
    ...fields,
  };
}

function jaipurPlan(): RollupEntry[] {
  const lines = planLines(jaipurWedding.plan);
  const ranges: LineEstimate[] = lines.map((l) => {
    const range = tableRange(l.category, l.unit, jaipurWedding.tier)!;
    return {
      unit: l.unit,
      ...range,
      basis: referenceTableBasis({ unit: l.unit, ...range, tier: "Y" }),
    };
  });
  const priced = pricePlan(jaipurWedding.plan, ranges, {
    budget: BUDGET,
    contingencyShare: 0.1,
  });
  const keys: string[] = [];
  for (const fn of jaipurWedding.plan.functions) {
    for (const _ of fn.budgetEntries) keys.push(fn.key);
  }
  const entries: RollupEntry[] = lines.map((l, i) => ({
    functionKey: keys[i] ?? null,
    fields: line({
      label: l.category,
      category: l.category,
      quantity: l.quantity,
      unit: l.unit,
      estimate: priced.entries[i]!,
    }),
  }));
  entries.push({
    functionKey: null,
    fields: line({
      label: "Contingency",
      role: "contingency",
      plannedAmount: priced.budgetCheck.contingency,
    }),
  });
  return entries;
}

const isSangeetCatering = (e: RollupEntry) =>
  e.functionKey === "sangeet" && e.fields.category === "catering_main";

/** The demo seed: sangeet catering at ₹2,45,000, the Contingency absorbing it. */
function demoSeed(): RollupEntry[] {
  const entries = jaipurPlan().map((e) =>
    isSangeetCatering(e)
      ? {
          ...e,
          fields: {
            ...e.fields,
            quantity: 300,
            plannedAmount: 245_000,
            editedByMember: true,
          },
        }
      : e,
  );
  const rest = entries
    .filter((e) => e.fields.role === "line")
    .reduce((sum, e) => sum + entryAmount(e.fields), 0);
  return entries.map((e) =>
    e.fields.role === "contingency"
      ? { ...e, fields: { ...e.fields, plannedAmount: BUDGET - rest } }
      : e,
  );
}

describe("budgetRollup", () => {
  it("Function totals + Event-wide + Contingency = Event total for the Jaipur wedding", () => {
    const rollup = budgetRollup(jaipurPlan(), BUDGET);
    const functions = Object.values(rollup.byFunction).reduce(
      (a, b) => a + b,
      0,
    );
    expect(Object.keys(rollup.byFunction)).toEqual([
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
    ]);
    expect(functions + rollup.eventWide + rollup.contingency).toBe(
      rollup.total,
    );
    expect(rollup.total).toBe(BUDGET);
    expect(rollup.unallocated).toBe(0);
    expect(rollup.overBy).toBe(0);
  });

  it("the demo seed still totals exactly ₹25,00,000", () => {
    const rollup = budgetRollup(demoSeed(), BUDGET);
    expect(rollup.total).toBe(BUDGET);
    expect(rollup.overBy).toBe(0);
  });

  it("overBy is ₹40,000 after the sangeet catering line goes from ₹2,45,000 to ₹2,85,000", () => {
    const entries = demoSeed().map((e) =>
      isSangeetCatering(e)
        ? { ...e, fields: { ...e.fields, plannedAmount: 285_000 } }
        : e,
    );
    const rollup = budgetRollup(entries, BUDGET);
    expect(rollup.overBy).toBe(40_000);
    expect(rollup.total).toBe(2_540_000);
  });

  it("counts a line with no Estimate and no amount as zero", () => {
    const rollup = budgetRollup(
      [
        { functionKey: null, fields: line({ label: "Favours" }) },
        {
          functionKey: "haldi",
          fields: line({ label: "Marigolds", plannedAmount: 12_000 }),
        },
      ],
      100_000,
    );
    expect(rollup.eventWide).toBe(0);
    expect(rollup.byFunction).toEqual({ haldi: 12_000 });
    expect(rollup.total).toBe(12_000);
    expect(rollup.overBy).toBe(0);
  });

  it("keeps Unallocated apart from the Contingency", () => {
    const rollup = budgetRollup(
      [
        {
          functionKey: null,
          fields: line({ label: "Hall", plannedAmount: 50_000 }),
        },
        {
          functionKey: null,
          fields: line({
            label: "Contingency",
            role: "contingency",
            plannedAmount: 5_000,
          }),
        },
        {
          functionKey: null,
          fields: line({
            label: "Unallocated",
            role: "unallocated",
            plannedAmount: 45_000,
          }),
        },
      ],
      100_000,
    );
    expect(rollup.eventWide).toBe(50_000);
    expect(rollup.contingency).toBe(5_000);
    expect(rollup.unallocated).toBe(45_000);
    expect(rollup.total).toBe(100_000);
  });

  it("has nothing to be over without a budget total", () => {
    const rollup = budgetRollup(
      [{ functionKey: null, fields: line({ label: "x", plannedAmount: 1 }) }],
      null,
    );
    expect(rollup.overBy).toBe(0);
  });
});

describe("entryAmount", () => {
  it("is the Member's amount when there is one, else the Estimate's", () => {
    const estimate = jaipurPlan()[0]!.fields.estimate!;
    expect(entryAmount(line({ label: "a", estimate }))).toBe(estimate.amount);
    expect(
      entryAmount(line({ label: "a", estimate, plannedAmount: 1_000 })),
    ).toBe(1_000);
    expect(entryAmount(line({ label: "a" }))).toBe(0);
  });
});
