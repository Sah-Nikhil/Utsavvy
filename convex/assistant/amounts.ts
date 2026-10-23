import type { ProposalOp } from "../../lib/types/proposals";
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

/**
 * Every rupee amount a message could mean: each number as written ("15,000",
 * "15000"), and times its suffix where it has one ("15k", "1.5 lakh", "2L",
 * "50 हज़ार").
 */
function amountsIn(text: string): number[] {
  const normalized = asciiDigits(text);
  const amounts: number[] = [];
  const number = /(\d[\d,]*(?:\.\d+)?)/g;
  for (const match of normalized.matchAll(number)) {
    const digits = match[1]!.replace(/,/g, "");
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const after = normalized.slice(match.index + match[0].length);
    const word = /^\s?([^\s\d.,!?;:()]+)/.exec(after)?.[1] ?? "";
    let multiplied = false;
    for (const [suffix, factor] of SUFFIXES) {
      const hit = suffix.exec(word);
      // The suffix is the whole word ("2L"), not the start of one ("2 lines").
      if (hit && hit[0].length === word.length) {
        amounts.push(value * factor);
        multiplied = true;
        break;
      }
    }
    if (!multiplied) amounts.push(value);
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

  if (budgetTotal !== null && budgetTotal > 0) {
    const shifted = changes.reduce(
      (sum, change) => sum + Math.abs(change.amountShift),
      0,
    );
    const share = PROPOSAL_THRESHOLDS.budgetShiftShare;
    if (shifted > budgetTotal * share) {
      return `This moves more than ${Math.round(share * 100)}% of the Budget total in one reply: use propose instead.`;
    }
  }
  return null;
}
