import type { ProposalOp } from "../../lib/types/proposals";
import { formatINR } from "../../lib/format";
import { PROPOSAL_THRESHOLDS } from "../lib/settings";

/*
 * The two checks that keep the Assistant's direct writes small and honest
 * (IMPLEMENTATION_PLAN.md section 6): it writes an amount only when the asking
 * Member said it, and a change past the Proposal thresholds must go through
 * `propose` instead. Pure, so the tools and their tests share them.
 */

// ---------------------------------------------------------------------------
// Member-stated amounts

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Devanagari digits to ASCII, so "₹१५,०००" reads like "₹15,000". */
function asciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** Multipliers for the words people write after a number. */
const SUFFIXES: readonly [RegExp, number][] = [
  [/^(?:k|thousand|hazaa?r|हज़ार|हजार)/i, 1_000],
  [/^(?:lakhs?|lacs?|l|लाख)/i, 100_000],
  [/^(?:crores?|cr|करोड़|करोड)/i, 10_000_000],
];

/** A currency mark or word just before the number: "₹15,000", "Rs. 15000", "INR15k". */
const MONEY_BEFORE = /(?:₹|\brs\.?|\binr|\brupees?)\s*$/i;
/** A currency word or the "/-" mark just after it: "15000 rupees", "15000/-". */
const MONEY_AFTER = /^\s*(?:rupees?\b|rs\b|\/-)/i;
/** Indian or Western digit grouping, "2,40,000" or "15,000", which people write for money. */
const GROUPED = /^\d{1,3}(?:,\d{2,3})+(?:\.\d+)?$/;
/** A count or a time, not money: "1,500 guests", "300 plates", "10%". */
const UNIT_AFTER =
  /^\s*(?:guests?|people|persons?|pax|plates?|heads?|days?|nights?|hours?|hrs?|%|percent|am\b|pm\b|members?|kids?|children|tables?|chairs?|log\b|लोग|मेहमान)/i;
/** A price per unit: "₹1,200 a plate", "per plate", "/plate", "each". Never a line's total. */
const PER_UNIT_AFTER =
  /^\s*(?:\/(?!-)|per\b|a\s+(?:plate|head|person|guest|day|night)\b|each\b|प्रति)/i;

/**
 * Every rupee amount a message states as an amount: a number with money
 * around it ("₹15,000", "Rs.15000/-", "15000 rupees"), a number with a
 * multiplier ("15k", "1.5 lakh", "2L", "50 हज़ार", "2 करोड़"), or a grouped
 * number that isn't a count ("2,40,000"). A bare number ("300 guests", "2027",
 * a phone number) is not an amount, and neither is a per-unit price ("₹1,200 a
 * plate"), which must not become a line's total.
 */
function amountsIn(text: string): number[] {
  const normalized = asciiDigits(text);
  const amounts: number[] = [];
  const number = /(\d[\d,]*(?:\.\d+)?)/g;
  for (const match of normalized.matchAll(number)) {
    const written = match[1]!;
    const value = Number(written.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const before = normalized.slice(0, match.index);
    let after = normalized.slice(match.index + match[0].length);

    let factor = 1;
    const word = /^\s?([^\s\d.,!?;:()/]+)/.exec(after);
    for (const [suffix, multiplier] of SUFFIXES) {
      const hit = word ? suffix.exec(word[1]!) : null;
      // The suffix is the whole word ("2L"), not the start of one ("2 lines").
      if (word && hit && hit[0].length === word[1]!.length) {
        factor = multiplier;
        after = after.slice(word[0].length);
        break;
      }
    }

    const money =
      factor !== 1 ||
      MONEY_BEFORE.test(before) ||
      MONEY_AFTER.test(after) ||
      (GROUPED.test(written) && !UNIT_AFTER.test(after));
    if (!money || PER_UNIT_AFTER.test(after)) continue;
    amounts.push(value * factor);
  }
  return amounts;
}

/**
 * Whether `amount` is a rupee amount the Member wrote in `messageText`
 * (section 6, "No tool, ever": an amount comes only from the estimate cascade
 * or the requesting Member's own words). "Add a mehendi artist, around
 * ₹15,000" and "15k" both state ₹15,000; neither states ₹18,000.
 */
export function checkMemberStatedAmount(
  amount: number,
  messageText: string,
): boolean {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  return amountsIn(messageText).some((stated) => Math.round(stated) === amount);
}

// ---------------------------------------------------------------------------
// Proposal thresholds

/** One change a run has made or is about to make, as the thresholds see it. */
export type ThresholdChange = {
  op: ProposalOp;
  /** The row it changes; null for a new row, which counts on its own. */
  docId: string | null;
  /** How many rupees it moves: the absolute change in a budget line's amount. */
  amountShift: number;
};

/**
 * Without a Budget total there is no 10% to measure, so one reply may move at
 * most this much directly (review of #99, L1). Not in `convex/lib/settings.ts`
 * yet, since that file is the orchestrator's; move it there with the next
 * contract change.
 */
export const NO_BUDGET_SHIFT_CAP = 50_000;

/** Ops a Member always decides on: nothing about them is small enough to apply directly. */
const ALWAYS_PROPOSED: Partial<Record<ProposalOp, string>> = {
  deleteEntry:
    "Deleting an Entry needs a Member's Accept: use propose instead.",
  deleteItem: "Deleting an Item needs a Member's Accept: use propose instead.",
  setBudgetTotal:
    "Changing the Budget total needs a Member's Accept: use propose instead.",
  addQuote: "Saving a Quote needs a Member's Accept: use propose instead.",
  changeEssential:
    "Changing an essential of the Brief needs a Member's Accept: use propose instead.",
};

/** Ops that touch an Entry or an Item, for the "more than 5" count. */
const TOUCHES: ReadonlySet<ProposalOp> = new Set<ProposalOp>([
  "addEntry",
  "updateEntry",
  "deleteEntry",
  "addItem",
  "updateItem",
  "moveItem",
  "deleteItem",
]);

/**
 * Why `changes` (everything one reply has changed, plus the change it is about
 * to make) must go through a Proposal, or null when they may apply directly
 * (assistant-behavior.md rule 10, thresholds in `convex/lib/settings.ts`): a
 * deletion, a Budget total change, touching more than 5 Entries or Items, or
 * shifting more than 10% of the Budget total. Adding one ₹15,000 Entry to a
 * ₹12,00,000 Budget is direct.
 */
export function exceedsProposalThresholds(
  changes: readonly ThresholdChange[],
  budgetTotal: number | null,
): string | null {
  for (const change of changes) {
    const reason = ALWAYS_PROPOSED[change.op];
    if (reason) return reason;
  }

  const touched = new Set<string>();
  let inserts = 0;
  for (const change of changes) {
    if (!TOUCHES.has(change.op)) continue;
    if (change.docId === null) inserts++;
    else touched.add(change.docId);
  }
  const max = PROPOSAL_THRESHOLDS.maxDirectTouches;
  if (touched.size + inserts > max) {
    return `This touches more than ${max} Entries or Items in one reply: use propose instead.`;
  }

  const shifted = changes.reduce(
    (sum, change) => sum + Math.abs(change.amountShift),
    0,
  );
  if (budgetTotal !== null && budgetTotal > 0) {
    const share = PROPOSAL_THRESHOLDS.budgetShiftShare;
    if (shifted > budgetTotal * share) {
      return `This moves more than ${Math.round(share * 100)}% of the Budget total in one reply: use propose instead.`;
    }
  } else if (shifted > NO_BUDGET_SHIFT_CAP) {
    return `This moves more than ${formatINR(NO_BUDGET_SHIFT_CAP)} in one reply and the Event has no Budget total yet: use propose instead.`;
  }
  return null;
}
