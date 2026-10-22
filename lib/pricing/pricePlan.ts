import { formatINR, formatLakh } from "../format";
import type {
  BudgetCheck,
  DraftBudgetLine,
  EstimateBasis,
  PricedEstimate,
} from "../types";

/**
 * The pricing step (docs/design/first-brief.md "Pricing a plan", amended by
 * ADR 0013). It takes one per-unit range per budget line from the estimate
 * cascade and does every sum, band, rounding and Contingency in code. Amounts
 * are whole rupees.
 */

/** One cascade result: a per-unit range and where it came from. */
export type LineEstimate = {
  unit: string;
  unitLow: number;
  unitHigh: number;
  basis: EstimateBasis;
};

/** The parts of a `FirstPlanDraft` (or a Brief's lines) that carry budget lines. */
export type PlanLines = {
  functions: { budgetEntries: DraftBudgetLine[] }[];
  eventWide: DraftBudgetLine[];
};

/** Every budget line in pricing order: each Function's lines, then the Event-wide ones. */
export function planLines(plan: PlanLines): DraftBudgetLine[] {
  return [
    ...plan.functions.flatMap((fn) => fn.budgetEntries),
    ...plan.eventWide,
  ];
}

/** A line's low and high: quantity times the per-unit range, in whole rupees. */
export function lineRange(
  unitRange: { unitLow: number; unitHigh: number },
  quantity: number,
): { low: number; high: number } {
  return {
    low: Math.round(unitRange.unitLow * quantity),
    high: Math.round(unitRange.unitHigh * quantity),
  };
}

/** The share of a total each household carries, or null without households. */
export function perHousehold(
  total: number,
  households: number | null | undefined,
): number | null {
  if (!households || households <= 0) return null;
  return Math.round(total / households);
}

function roundTo(amount: number, step: number): number {
  return Math.round(amount / step) * step;
}

/**
 * A line's amount at a unit price: per-plate prices round to ₹10 and the line
 * stays as price × plates; every other line rounds to the nearest ₹1,000.
 */
function amountAt(unit: string, unitPrice: number, quantity: number): number {
  if (unit === "per_plate") return roundTo(unitPrice, 10) * quantity;
  return roundTo(unitPrice * quantity, 1000);
}

/** A figure for a sentence: nearest ₹10,000 from ₹10L up, else nearest ₹1,000. */
function about(amount: number): number {
  return roundTo(amount, Math.abs(amount) >= 1_000_000 ? 10_000 : 1_000);
}

export type PricedPlan = {
  /** One per budget line, in `planLines` order; null for a line with no Estimate yet. */
  entries: (PricedEstimate | null)[];
  budgetCheck: BudgetCheck;
  /** The Budget note for the band, or null when there's nothing to say. */
  note: string | null;
  /** True when the Member planned below the minimum: every Entry is below its usual range. */
  belowUsualRange: boolean;
  /**
   * Where the Entries sit: the fraction f of each range when tight or
   * comfortable, the share of each low when below the minimum, 1 above high.
   */
  fraction: number;
};

export function pricePlan(
  plan: PlanLines,
  ranges: (LineEstimate | null)[],
  opts: {
    budget: number;
    contingencyShare: number;
    households?: number | null;
    /** The Event's city, for the below-minimum note. */
    city?: string | null;
  },
): PricedPlan {
  const lines = planLines(plan);
  if (lines.length !== ranges.length) {
    throw new Error(
      `The plan has ${lines.length} budget lines but ${ranges.length} ranges`,
    );
  }
  const { budget, contingencyShare: share } = opts;

  const priced = lines.map((line, i) => {
    const range = ranges[i];
    return range ? { line, range, ...lineRange(range, line.quantity) } : null;
  });
  let sumLow = 0;
  let sumHigh = 0;
  for (const p of priced) {
    if (!p) continue;
    sumLow += p.low;
    sumHigh += p.high;
  }

  const minimum = Math.round(sumLow * (1 + share));
  const high = Math.round(sumHigh * (1 + share));
  const typical = Math.round(((sumLow + sumHigh) * (1 + share)) / 2);
  const band: BudgetCheck["band"] =
    budget < minimum
      ? "belowMinimum"
      : budget < typical
        ? "tight"
        : budget <= high
          ? "comfortable"
          : "aboveHigh";

  // What the Entries may add up to once the Contingency is set aside.
  const entriesTarget = budget / (1 + share);
  const scale = sumLow > 0 ? entriesTarget / sumLow : 0;
  const f =
    sumHigh > sumLow
      ? Math.min(1, Math.max(0, (entriesTarget - sumLow) / (sumHigh - sumLow)))
      : 0;

  const entries = priced.map((p): PricedEstimate | null => {
    if (!p) return null;
    const { range, line } = p;
    let amount: number;
    if (band === "aboveHigh") amount = p.high;
    else if (band === "belowMinimum")
      amount = amountAt(range.unit, range.unitLow * scale, line.quantity);
    else
      amount = amountAt(
        range.unit,
        range.unitLow + f * (range.unitHigh - range.unitLow),
        line.quantity,
      );
    return {
      low: p.low,
      high: p.high,
      amount,
      label: "Estimate",
      basis: range.basis,
    };
  });

  const entriesTotal = entries.reduce((sum, e) => sum + (e?.amount ?? 0), 0);
  const contingency =
    band === "aboveHigh"
      ? Math.round(entriesTotal * share)
      : budget - entriesTotal;
  const unallocated = budget - entriesTotal - contingency;

  const notes: string[] = [];
  if (band === "belowMinimum") {
    const shown = about(minimum);
    const where = opts.city ? ` in ${opts.city}` : "";
    notes.push(
      `A plan like this${where} usually starts at about ${formatLakh(shown)}. You're about ${formatLakh(about(shown - budget))} short.`,
    );
  } else if (band === "tight") {
    notes.push(
      `${formatLakh(budget)} is below the typical ${formatLakh(about(typical))} for this plan, so Estimates sit near the low end.`,
    );
  } else if (band === "aboveHigh") {
    notes.push(
      `${formatLakh(budget)} is above the high end of ${formatLakh(about(high))} for this plan, so every Estimate sits at its high end and ${formatINR(unallocated)} is Unallocated.`,
    );
  }
  const missing = entries.filter((e) => e === null).length;
  if (missing === 1) {
    notes.push("1 line has no Estimate yet and counts as zero.");
  } else if (missing > 1) {
    notes.push(`${missing} lines have no Estimate yet and count as zero.`);
  }

  return {
    entries,
    budgetCheck: {
      band,
      minimum,
      typical,
      high,
      contingency,
      unallocated,
      perHousehold: perHousehold(budget, opts.households),
    },
    note: notes.length > 0 ? notes.join(" ") : null,
    belowUsualRange: band === "belowMinimum",
    fraction: band === "aboveHigh" ? 1 : band === "belowMinimum" ? scale : f,
  };
}
