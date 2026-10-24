import { formatLakh } from "../format";
import type { EventType } from "../types";
import { communityKindKey } from "./festivalDates";

/**
 * The words around the Budget check on the Brief summary
 * (docs/design/first-brief.md "Brief summary"). The figures come from
 * `pricePlan` in `lib/pricing/`; this only words them.
 */

/** A figure for a sentence: nearest ₹10,000 from ₹10L up, else nearest ₹1,000 (as `pricePlan` rounds its notes). */
function about(amount: number): number {
  const step = Math.abs(amount) >= 1_000_000 ? 10_000 : 1_000;
  return Math.round(amount / step) * step;
}

function noun(eventType: EventType, communityKind: string | null): string {
  if (
    eventType === "community" &&
    communityKind &&
    communityKindKey(communityKind) === "ganesh-utsav"
  ) {
    return "Ganeshotsav";
  }
  return "plan";
}

/**
 * The flag for a budget below the typical minimum, or null when the budget
 * reaches it: "A plan like this in Jaipur usually starts at about ₹19.6L.
 * You're about ₹4.6L short."
 */
export function budgetFlag(args: {
  minimum: number;
  budget: number;
  city: string | null;
  eventType: EventType;
  communityKind: string | null;
}): string | null {
  if (args.budget >= args.minimum) return null;
  const shown = about(args.minimum);
  const where = args.city ? ` in ${args.city}` : "";
  return `A ${noun(args.eventType, args.communityKind)} like this${where} usually starts at about ${formatLakh(shown)}. You're about ${formatLakh(about(shown - args.budget))} short.`;
}

/** "Raise the budget" goes to the minimum, rounded up to the next ₹1,000 so it clears it. */
export function raiseBudgetTo(minimum: number): number {
  return Math.ceil(minimum / 1000) * 1000;
}

/** The short form shown on the button: "about ₹19.6L". */
export function aboutAmount(amount: number): string {
  return `about ${formatLakh(about(amount))}`;
}

/**
 * What the Budget check's figures rest on: "Based on prices researched today
 * for 6 of 9 lines; the rest from Utsavvy's reference table."
 */
export function basisLine(counts: {
  researched: number;
  lines: number;
}): string {
  const { researched, lines } = counts;
  const all = lines === 1 ? "the 1 line" : `all ${lines} lines`;
  if (researched <= 0) return `Based on Utsavvy's reference table for ${all}.`;
  if (researched >= lines)
    return `Based on prices researched today for ${all}.`;
  return `Based on prices researched today for ${researched} of ${lines} lines; the rest from Utsavvy's reference table.`;
}
