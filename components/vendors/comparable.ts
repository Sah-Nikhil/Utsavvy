/*
 * A Listed price worked out for one Function (docs/design/vendors.md, "Listed
 * prices" and "The Budget comparison"). Pure, so Convex and the UI share it.
 * Relative imports only, because Convex bundles this file too.
 */

import { formatINR, formatLakh } from "../../lib/format";

type ListedPriceUnit = "per_plate" | "per_person" | "per_day" | "per_function";

/** The fields of a `listedPrices` row this needs. */
export type ListedPriceLike = {
  comparable: boolean;
  amount?: { min: number; max: number };
  unit?: ListedPriceUnit;
  qualifier?: "exact" | "approx" | "starting";
  text: string;
};

export type ComparablePrice = {
  low: number;
  /** null for a starting price: it only says where prices begin. */
  high: number | null;
  label: string;
};

const PER: Record<ListedPriceUnit, string> = {
  per_plate: "/plate",
  per_person: "/person",
  per_day: "/day",
  per_function: "/Function",
};

/** Units priced per Guest, so a Function's Guest count multiplies them. */
const PER_GUEST: ReadonlySet<ListedPriceUnit> = new Set([
  "per_plate",
  "per_person",
]);

const FROM = "from Listed price";

/**
 * A comparable Listed price for a Function with `guests` Guests, or null when
 * the price isn't comparable (a unit like "per hand", or no clear amount):
 * such a price is shown as text only and left out of the Budget.
 *
 * Plate and person prices are multiplied by the Guests ("₹3.6L to ₹10.5L,
 * from Listed price"); a day or Function price stands as it is. A starting
 * price keeps its own wording ("from ₹250/plate (starting price)") and has no
 * top. Without a Guest count, a plate price stays per plate.
 */
export function comparableForFunction(
  price: ListedPriceLike,
  guests: number | null,
): ComparablePrice | null {
  if (!price.comparable || !price.amount || !price.unit) return null;
  const { min, max } = price.amount;
  const unit = price.unit;
  const times = PER_GUEST.has(unit) && guests !== null ? guests : 1;

  if (price.qualifier === "starting") {
    return {
      low: min * times,
      high: null,
      label: `from ${formatINR(min)}${PER[unit]} (starting price)`,
    };
  }
  const low = min * times;
  const high = max * times;
  if (times === 1) {
    const amount =
      min === max ? formatINR(min) : `${formatINR(min)} to ${formatINR(max)}`;
    return { low, high, label: `${amount}${PER[unit]}, ${FROM}` };
  }
  if (min === max) {
    return {
      low,
      high,
      label: `${formatINR(min)}${PER[unit]} × ${times} = ${formatLakh(low)}, ${FROM}`,
    };
  }
  return {
    low,
    high,
    label: `${formatLakh(low)} to ${formatLakh(high)}, ${FROM}`,
  };
}
