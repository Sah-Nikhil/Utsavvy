/*
 * Filtering the Vendor map by a Function's needs (issue #48): a Venue too
 * small for the Function's Guests drops out, and so does a Vendor whose
 * comparable Listed prices are all above the Function's budget line. A Vendor
 * with no comparable Listed price can't show it's above the line, so it stays,
 * marked "no price". Pure, so it's tested without the map.
 */

import {
  comparableForFunction,
  type ListedPriceLike,
} from "../vendors/comparable";
import type { VendorCategory } from "../vendors/cards";

/** What the filter needs of a Vendor on the map. */
export type FilterableVendor = {
  category: VendorCategory;
  capacity: { min?: number; max: number } | null;
  prices: ListedPriceLike[];
};

/** The Function being planned for. */
export type FunctionNeeds = { key: string; guests: number | null };

/** The fields of a budget Entry the filter reads (`EntryFields<"budget">` has them). */
export type BudgetLineLike = {
  plannedAmount: number | null;
  estimate: { amount: number } | null;
};

/** A budget line's amount: what Members planned, else its Estimate. */
function lineAmount(line: BudgetLineLike | null): number | null {
  if (line === null) return null;
  return line.plannedAmount ?? line.estimate?.amount ?? null;
}

/**
 * The Vendors that suit Function `fn`, in their order, each marked `noPrice`
 * when it has no comparable Listed price. `budgetEntry` is the Function's
 * budget line for the Vendors' category; null skips the price check.
 */
export function filterForFunction<V extends FilterableVendor>(
  vendors: readonly V[],
  fn: FunctionNeeds,
  budgetEntry: BudgetLineLike | null,
): (V & { noPrice: boolean })[] {
  const ceiling = lineAmount(budgetEntry);
  const kept: (V & { noPrice: boolean })[] = [];
  for (const vendor of vendors) {
    if (
      vendor.category === "venue" &&
      fn.guests !== null &&
      vendor.capacity !== null &&
      vendor.capacity.max < fn.guests
    )
      continue;
    const comparable = vendor.prices
      .map((price) => comparableForFunction(price, fn.guests))
      .filter((price) => price !== null);
    if (comparable.length === 0) {
      kept.push({ ...vendor, noPrice: true });
      continue;
    }
    if (ceiling !== null && !comparable.some((price) => price.low <= ceiling))
      continue;
    kept.push({ ...vendor, noPrice: false });
  }
  return kept;
}

/** Reference-table categories of the budget lines that price each Vendor category. */
const LINE_PREFIX: Record<VendorCategory, string> = {
  venue: "venue_",
  caterer: "catering_",
  decorator: "decor_",
  photographer: "photography_",
};

/** The Function's budget line for a Vendor category, or null when it has none. */
export function budgetLineFor<
  L extends BudgetLineLike & {
    functionKey: string | null;
    category: string | null;
  },
>(
  lines: readonly L[],
  functionKey: string,
  category: VendorCategory,
): L | null {
  return (
    lines.find(
      (line) =>
        line.functionKey === functionKey &&
        line.category !== null &&
        line.category.startsWith(LINE_PREFIX[category]),
    ) ?? null
  );
}

/**
 * The panel's filters on the Event's hand-typed Vendors (review of PR 139):
 * a category chip keeps those of that category (a free label matches none),
 * and a Function keeps those whose checklist Entries serve it. `functionKeys`
 * null means an Entry serves every Function, so the Vendor always stays.
 */
export function filterHandTyped<
  V extends { category: string; functionKeys: string[] | null },
>(
  vendors: readonly V[],
  category: string | null,
  functionKey: string | null,
): V[] {
  return vendors.filter(
    (v) =>
      (category === null || v.category === category) &&
      (functionKey === null ||
        v.functionKeys === null ||
        v.functionKeys.includes(functionKey)),
  );
}
