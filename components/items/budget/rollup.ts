import type { EntryFields } from "../../../lib/types/canvas";

/*
 * The Budget's roll-up (docs/design/first-brief.md decision 7): Function
 * totals + Event-wide + Contingency (+ Unallocated) = Event total. Pure, so
 * the Budget Item, the Budget comparison and the Nudge check (S17, through
 * `convex/entries.ts`) all add up the same way. Relative imports only, because
 * Convex bundles this file too.
 */

/** A budget Entry as the roll-up reads it: live rows only, deleted ones left out by the caller. */
export type RollupEntry = {
  functionKey: string | null;
  fields: EntryFields<"budget">;
};

export type BudgetRollup = {
  /** Each Function's total, by Function key, in the order the Entries came. */
  byFunction: Record<string, number>;
  eventWide: number;
  contingency: number;
  unallocated: number;
  /** Function totals + Event-wide + Contingency + Unallocated. */
  total: number;
  /** How far the total is above the Event's budget; 0 when within it or with no budget set. */
  overBy: number;
};

/**
 * What a budget Entry counts for: the amount a Member set (typed, or a Quote
 * used as the line's amount), else its Estimate's amount, else zero ("No
 * Estimate yet" counts as zero, and the Budget says so).
 */
export function entryAmount(fields: EntryFields<"budget">): number {
  return fields.plannedAmount ?? fields.estimate?.amount ?? 0;
}

export function budgetRollup(
  entries: readonly RollupEntry[],
  budgetTotal: number | null,
): BudgetRollup {
  const byFunction: Record<string, number> = {};
  let eventWide = 0;
  let contingency = 0;
  let unallocated = 0;
  for (const { functionKey, fields } of entries) {
    const amount = entryAmount(fields);
    if (fields.role === "contingency") contingency += amount;
    else if (fields.role === "unallocated") unallocated += amount;
    else if (functionKey === null) eventWide += amount;
    else byFunction[functionKey] = (byFunction[functionKey] ?? 0) + amount;
  }
  const functions = Object.values(byFunction).reduce((a, b) => a + b, 0);
  const total = functions + eventWide + contingency + unallocated;
  const overBy = budgetTotal === null ? 0 : Math.max(0, total - budgetTotal);
  return { byFunction, eventWide, contingency, unallocated, total, overBy };
}
