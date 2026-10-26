/*
 * Quotes and the Budget comparison (docs/design/vendors.md, "Quotes" and "The
 * Budget comparison"). Pure, so Convex and the UI share it: every
 * multiplication and comparison of a Quote is done here, never by a model.
 * Relative imports only, because Convex bundles this file too.
 */

import { formatINR, formatLakh } from "../../lib/format";

export type QuoteUnit =
  "per_plate" | "per_person" | "per_day" | "per_function" | "total";

/** The fields of a Quote the arithmetic reads. `amount` is per `unit`. */
export type QuoteLike = {
  amount: number;
  unit: QuoteUnit;
  functionKeys: readonly string[];
  guests: number | null;
};

/** A budget Entry as the comparison reads it. */
export type QuoteEntry = {
  _id: string;
  functionKey: string | null;
  fields: {
    quantity: number;
    unit: string;
    plannedAmount: number | null;
    estimate: { amount: number } | null;
  };
};

export const QUOTE_UNITS: readonly QuoteUnit[] = [
  "per_plate",
  "per_person",
  "per_day",
  "per_function",
  "total",
];

export const QUOTE_UNIT_LABELS: Record<QuoteUnit, string> = {
  per_plate: "Per plate",
  per_person: "Per person",
  per_day: "Per day",
  per_function: "Per Function",
  total: "In all",
};

const PER: Record<QuoteUnit, string> = {
  per_plate: "/plate",
  per_person: "/person",
  per_day: "/day",
  per_function: "/Function",
  total: "",
};

/** Budget line units that count Guests, so a plate or person price multiplies them. */
const GUEST_UNITS = new Set(["per_plate", "per_person", "per_guest"]);

/**
 * The budget Entries a Quote is compared with: those of the Functions it
 * names, or, when it names none, every Entry its checklist Entry pays for
 * (`entries` is that list).
 */
export function comparedEntries<E extends QuoteEntry>(
  quote: Pick<QuoteLike, "functionKeys">,
  entries: readonly E[],
): E[] {
  if (quote.functionKeys.length === 0) return [...entries];
  return entries.filter(
    (entry) =>
      entry.functionKey !== null &&
      quote.functionKeys.includes(entry.functionKey),
  );
}

/**
 * What a Quote comes to for the Entries it is compared with, in rupees. A
 * total stands as it is. A plate or person price multiplies the Quote's own
 * Guest count, else the Guests (plates) on those Entries. A Function price
 * counts once per Function covered, and a day price once per day the Entries
 * hold (at least once per Function). Zero when it covers none of them.
 */
export function quoteForEntries(
  quote: QuoteLike,
  entries: readonly QuoteEntry[],
): number {
  const compared = comparedEntries(quote, entries);
  if (compared.length === 0) return 0;
  const functions = new Set(
    quote.functionKeys.length > 0
      ? quote.functionKeys
      : compared.map((entry) => entry.functionKey ?? ""),
  ).size;
  let times: number;
  switch (quote.unit) {
    case "total":
      times = 1;
      break;
    case "per_plate":
    case "per_person":
      times =
        quote.guests ??
        compared
          .filter((entry) => GUEST_UNITS.has(entry.fields.unit))
          .reduce((sum, entry) => sum + entry.fields.quantity, 0);
      break;
    case "per_function":
      times = functions;
      break;
    case "per_day": {
      const days = compared
        .filter((entry) => entry.fields.unit === "per_day")
        .reduce((sum, entry) => sum + entry.fields.quantity, 0);
      times = Math.max(days, functions);
      break;
    }
  }
  return Math.round(quote.amount * times);
}

/** A Quote on its own, before any budget line is compared with it: a plate price times its Guests. */
export function standaloneTotal(quote: QuoteLike): number {
  const perGuest = quote.unit === "per_plate" || quote.unit === "per_person";
  return Math.round(quote.amount * (perGuest ? (quote.guests ?? 1) : 1));
}

export type Comparison = {
  kind: "over" | "under" | "same";
  by: number;
  /** "₹40,000 over", "₹45,000 under" or "the same as": read with the amount it compares with. */
  text: string;
};

/** A Quote against the amount it is compared with, in words as well as by kind. */
export function compareWithPlanned(quote: number, planned: number): Comparison {
  const by = Math.abs(Math.round(quote - planned));
  if (by === 0) return { kind: "same", by: 0, text: "the same as" };
  const kind = quote > planned ? "over" : "under";
  return { kind, by, text: `${formatINR(by)} ${kind}` };
}

/** The question a Member answers when a Vendor is Booked (vendors.md). */
export function bookingQuestion(total: number): string {
  return `Use the ${formatLakh(total)} Quote as this line's amount?`;
}

/** "₹950/plate × 300 = ₹2.85L", or "₹1.8L in all" for a total. */
export function quoteLine(quote: QuoteLike & { total: number }): string {
  if (quote.unit === "total") return `${formatLakh(quote.total)} in all`;
  const per = `${formatINR(quote.amount)}${PER[quote.unit]}`;
  if (quote.total === quote.amount) return per;
  const times = Math.round(quote.total / quote.amount);
  return `${per} × ${times.toLocaleString("en-IN")} = ${formatLakh(quote.total)}`;
}

/**
 * A pasted Quote's change on its Proposal card: "Quote from Vinayak Caterers:
 * ₹950/plate for 300 Guests at the Sangeet (₹2,85,000), live counters extra".
 * The total in brackets is only shown when code can work it out alone.
 */
export function quoteChangeLine(
  quote: QuoteLike & { note: string | null },
  vendorName: string,
  functionNames: readonly string[],
): string {
  let text = `Quote from ${vendorName}: ${formatINR(quote.amount)}${PER[quote.unit]}`;
  if (quote.unit === "total") text += " in all";
  if (quote.guests !== null)
    text += ` for ${quote.guests.toLocaleString("en-IN")} Guests`;
  if (functionNames.length > 0)
    text += ` at the ${functionNames.join(" and the ")}`;
  const perGuest = quote.unit === "per_plate" || quote.unit === "per_person";
  if (perGuest && quote.guests !== null)
    text += ` (${formatINR(quote.amount * quote.guests)})`;
  if (quote.note) text += `, ${quote.note}`;
  return text;
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

const MULTIPLIERS: readonly [RegExp, number][] = [
  [/^(?:k|thousand|hazaa?r|हज़ार|हजार)$/i, 1_000],
  [/^(?:lakhs?|lacs?|l|लाख)$/i, 100_000],
  [/^(?:crores?|cr|करोड़|करोड)$/i, 10_000_000],
];

/**
 * Every number a pasted message writes, in order, with "k", "L" and "lakh"
 * applied ("2.85L" is 285000) and Devanagari digits read. Code checks that a
 * Quote's amount and Guests come from these, so a number the model made up
 * can never become a Quote.
 */
export function numbersIn(text: string): number[] {
  const ascii = text.replace(/[०-९]/g, (d) =>
    String(DEVANAGARI_DIGITS.indexOf(d)),
  );
  const found: number[] = [];
  for (const match of ascii.matchAll(
    /(\d[\d,]*(?:\.\d+)?)\s?([^\s\d.,!?;:()/]+)?/g,
  )) {
    const value = Number(match[1]!.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const word = match[2] ?? "";
    const multiplier =
      MULTIPLIERS.find(([pattern]) => pattern.test(word))?.[1] ?? 1;
    found.push(Math.round(value * multiplier));
  }
  return found;
}
