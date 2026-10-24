import { BRIEF_LIMITS } from "./limits";

/**
 * Reading what a Member types into a chip question's "type my own" box.
 * Amounts follow Indian usage: "15 lakh", "₹19.6L", "1.2 crore", "2,40,000",
 * "50k".
 */

/** Rupees from a typed amount, or null when it can't be read. */
export function parseAmount(text: string): number | null {
  const cleaned = text
    .toLowerCase()
    .replace(/₹|rs\.?|inr|rupees?/g, "")
    .replace(/,/g, "")
    .trim();
  const match = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k|thousand)?$/,
  );
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2] ?? "";
  const multiplier = unit.startsWith("c")
    ? 10_000_000
    : unit.startsWith("l")
      ? 100_000
      : unit === "k" || unit === "thousand"
        ? 1000
        : 1;
  const amount = Math.round(value * multiplier);
  return Number.isFinite(amount) && amount > 0 && amount <= BRIEF_LIMITS.budget
    ? amount
    : null;
}

/** A whole, positive count such as Guests or households, or null. */
export function parseCount(text: string): number | null {
  const match = text.replace(/,/g, "").match(/^\s*(\d+)\s*\+?\s*$/);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 && n <= BRIEF_LIMITS.guests ? n : null;
}
