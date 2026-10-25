import type { ProposalOp } from "../../lib/types/proposals";
import { formatINR } from "../../lib/format";
import { NO_BUDGET_SHIFT_CAP, PROPOSAL_THRESHOLDS } from "../lib/settings";

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

/** One amount a message states, and where it was written. */
type StatedAmount = { value: number; at: number };

/**
 * Every rupee amount a message states as an amount: a number with money
 * around it ("₹15,000", "Rs.15000/-", "15000 rupees"), a number with a
 * multiplier ("15k", "1.5 lakh", "2L", "50 हज़ार", "2 करोड़"), or a grouped
 * number that isn't a count ("2,40,000"). A bare number ("300 guests", "2027",
 * a phone number) is not an amount, and neither is a per-unit price ("₹1,200 a
 * plate"), which must not become a line's total.
 */
function amountsIn(normalized: string): StatedAmount[] {
  const amounts: StatedAmount[] = [];
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
    amounts.push({ value: value * factor, at: match.index });
  }
  return amounts;
}

// ---------------------------------------------------------------------------
// Which line an amount belongs to (review of #99, M3)

/**
 * Words that say nothing about which line an amount is for: articles, verbs
 * of asking and setting, money words and the Hinglish glue around them. A
 * clause made only of these ("around ₹15,000", "quoted 50k") belongs to the
 * clause before it. "Budget" and "total" are not here: "Budget 5L" says what
 * the amount is for.
 */
const FILLER = new Set([
  ...["a", "an", "the", "it", "its", "this", "that", "to", "of", "for", "on"],
  ...["in", "at", "as", "is", "be", "was", "will", "with", "from", "by", "my"],
  ...["our", "me", "us", "we", "i", "you", "too", "also", "then", "now"],
  ...["add", "make", "set", "keep", "put", "change", "update", "mark", "fix"],
  ...["give", "gave", "quote", "quoted", "quotes", "says", "said", "asked"],
  ...["asking", "wants", "charges", "charge", "charging", "costs", "cost"],
  ...["costing", "pay", "paying", "told", "came", "comes", "around", "about"],
  ...["approx", "approximately", "roughly", "nearly", "max", "maximum"],
  ...["upto", "up", "only", "just", "amount", "price"],
  ...["rs", "inr", "rupee", "rupees", "k", "l", "lakh", "lakhs", "lac"],
  ...["lacs", "crore", "crores", "cr", "thousand", "hazar", "hazaar", "rakho"],
  ...["rakh", "kar", "karo", "do", "de", "dena", "ka", "ki", "ke", "ko", "se"],
  ...["liye", "hai", "hain", "tak", "mein", "ok", "okay", "please", "pls"],
  ...["kindly", "line", "entry", "new", "one", "another"],
]);

/** Where one clause ends: a punctuation mark not inside a number, or a joining word. */
const CLAUSE_BREAK = /[,.;:!?\n]|\s(?:and|aur|but|also|plus|then|&)(?=\s)/gi;

type Clause = { start: number; end: number; words: string[] };

/** A message cut into clauses, each with its words that could name a line. */
function clausesOf(text: string): Clause[] {
  const clauses: Clause[] = [];
  let start = 0;
  const close = (end: number) => {
    const words = (
      text
        .slice(start, end)
        .toLowerCase()
        .match(/[\p{L}\p{M}]+/gu) ?? []
    ).filter((word) => !FILLER.has(word));
    clauses.push({ start, end, words });
  };
  for (const match of text.matchAll(CLAUSE_BREAK)) {
    const at = match.index;
    // "2,40,000" and "2.4L" are one number, not two clauses.
    if (
      /^[,.]$/.test(match[0]) &&
      /\d/.test(text[at - 1] ?? "") &&
      /\d/.test(text[at + 1] ?? "")
    )
      continue;
    close(at);
    start = at + match[0].length;
  }
  close(text.length);
  return clauses;
}

/** "caterer" names the "Catering" line, "dj" the "DJ" line, "musicians" the "Folk musician" line. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared])
    shared++;
  return shared >= 4 && shared >= Math.min(5, a.length, b.length);
}

function names(
  words: readonly string[],
  lineWords: readonly string[],
): boolean {
  return words.some((word) => lineWords.some((line) => sameWord(word, line)));
}

/**
 * Words that say what an amount is for, whatever the Event's lines are
 * called: the Vendor categories (`vendors.category` in the schema) and the
 * first word of each reference table row (`lib/pricing/table.ts`), plus
 * "tent" and "budget". Only nouns that don't double as everyday reply words:
 * "sound" ("15k sounds good") and "total" ("totally fine") are left out.
 */
const LINE_SUBJECTS: readonly string[] = [
  ...["venue", "caterer", "catering", "decor", "decorator", "photographer"],
  ...["photography", "dj", "dhol", "mehendi", "baraat", "band", "pandit"],
  ...["makeup", "outfits", "invitations", "transport", "cake", "entertainer"],
  ...["idol", "pandal", "prasad", "tent", "budget"],
];

/** A label's words that could name it in a message, without its "(Sangeet)" part. */
function labelWords(label: string, dropParts: boolean): string[] {
  const text = dropParts ? label.replace(/\([^)]*\)/g, " ") : label;
  return (text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? []).filter(
    (word) => !FILLER.has(word),
  );
}

/**
 * The clause that says what the amount written at `at` is for: its own, or
 * when that names nothing, the nearest one that does (before it, else after).
 */
function governingClause(
  clauses: readonly Clause[],
  at: number,
): Clause | undefined {
  const index = clauses.findIndex((c) => at >= c.start && at < c.end);
  const own = clauses[index];
  if (own === undefined || own.words.length > 0) return own;
  return (
    clauses.slice(0, index).findLast((c) => c.words.length > 0) ??
    clauses.slice(index + 1).find((c) => c.words.length > 0)
  );
}

/** Whether the amount written at `at` is about the line: its governing clause names it. */
function belongsToLine(
  clauses: readonly Clause[],
  at: number,
  lineWords: readonly string[],
): boolean {
  const subject = governingClause(clauses, at);
  return subject !== undefined && names(subject.words, lineWords);
}

/** Whether the amount written at `at` is for something else: its governing clause names another line. */
function forAnotherLine(
  clauses: readonly Clause[],
  at: number,
  otherWords: readonly string[],
): boolean {
  const subject = governingClause(clauses, at);
  return subject !== undefined && names(subject.words, otherWords);
}

/**
 * Whether `amount` is a rupee amount the Member wrote in `messageText`
 * (section 6, "No tool, ever": an amount comes only from the estimate cascade
 * or the requesting Member's own words). "Add a mehendi artist, around
 * ₹15,000" and "15k" both state ₹15,000; neither states ₹18,000.
 *
 * With `lineNames` (the line's label, and its new label when it is being
 * renamed), the amount must not be for something else. The amount's own
 * clause decides, or the nearest clause that names something when its own
 * names nothing:
 * - When the message names the line anywhere, that clause must name it: "DJ
 *   50k and caterer 2.4L" gives the DJ ₹50,000, not ₹2,40,000.
 * - Otherwise the amount is refused only when that clause names another
 *   line: a category word ("caterer quoted 2.4L, add a DJ too" on a line
 *   called "Entertainment") or one of the Event's other lines, `otherLines`.
 * - Anything else is judged by the amount alone: "15k", "let's go with 15k"
 *   or a message in another script, in answer to the Assistant's question.
 */
export function checkMemberStatedAmount(
  amount: number,
  messageText: string,
  lineNames: readonly string[] = [],
  otherLines: readonly string[] = [],
): boolean {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  const normalized = asciiDigits(messageText);
  const stated = amountsIn(normalized).filter(
    (a) => Math.round(a.value) === amount,
  );
  if (stated.length === 0) return false;
  const lineWords = lineNames.flatMap((name) => labelWords(name, false));
  if (lineWords.length === 0) return true;
  const clauses = clausesOf(normalized);
  if (clauses.some((c) => names(c.words, lineWords)))
    return stated.some((a) => belongsToLine(clauses, a.at, lineWords));
  // Another line's words, less any this line shares ("DJ (sangeet)" beside
  // "DJ (wedding)").
  const otherWords = [
    ...LINE_SUBJECTS,
    ...otherLines.flatMap((name) => labelWords(name, true)),
  ].filter((word) => !lineWords.some((line) => sameWord(word, line)));
  return stated.some((a) => !forAnotherLine(clauses, a.at, otherWords));
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
