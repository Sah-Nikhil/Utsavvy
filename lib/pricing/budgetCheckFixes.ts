import {
  assumeFunctionDetails,
  type BriefFunction,
  briefLines,
  type FunctionDetailsInput,
} from "../brief/functions";
import { formatINR } from "../format";
import type { Assumption, DraftBudgetLine } from "../types";
import { isFunctionKey } from "../types/functions";
import {
  type LineEstimate,
  type PlanLines,
  planLines,
  pricePlan,
} from "./pricePlan";

/**
 * The previewed Budget check fixes (X12; docs/design/first-brief.md "Brief
 * summary"). When the budget is below the minimum, the Brief summary offers
 * two fixes beside "Raise the budget": fewer Guests, and fewer Functions. Each
 * previews its new minimum, re-priced here from the per-unit ranges the Budget
 * check already has, so a preview spends no search and no model call. Code
 * works out every figure and every word; the model writes none of them.
 *
 * Each fix carries the exact Brief edit that applies it (`api.brief.editField`),
 * so the Budget check that runs after the tap prices the same lines as the
 * preview did.
 */

/** The Brief as the Budget check prices it. */
export type FixDraft = {
  /** What `assumeFunctionDetails` reads; `guests` is the Brief's own count. */
  details: FunctionDetailsInput;
  /** The Event's Functions with their current date, Guests and what is still assumed. */
  functions: BriefFunction[];
  assumptions: Assumption[];
};

/** A Brief edit, in the shape `api.brief.editField` takes. */
export type FixChange =
  | { field: "guests"; functionKey: null; guests: number }
  | { field: "dropFunction"; functionKey: string };

export type BudgetFix = {
  kind: "fewerGuests" | "fewerFunctions";
  /** The button's words: "Plan for 200 Guests instead of 300", "Skip the reception". */
  label: string;
  /** For fewer Guests, each Function's new count and any Event-wide count that moves with it; otherwise null. */
  detail: string | null;
  /**
   * "New minimum about ₹14.2L, which fits." or "…, still about ₹9,000 short."
   * Softened to "which should fit" or "which should leave about ₹9,000 short"
   * when a line came from the table while the check researched prices: the
   * check after the tap may research that line and land elsewhere.
   */
  preview: string;
  minimum: number;
  fits: boolean;
  /** How far the new minimum is above the budget, or 0 when it fits. */
  short: number;
  change: FixChange;
};

/**
 * The programmes a Ganesh utsav is held for. Skipping one isn't a fix; the
 * cultural night is the one programme a society can do without.
 */
const RITUALS = new Set(["sthapana", "daily_aarti", "visarjan"]);

/** A figure for a sentence, rounded as `pricePlan` rounds its notes. */
function about(amount: number): number {
  const step = Math.abs(amount) >= 1_000_000 ? 10_000 : 1_000;
  return Math.round(amount / step) * step;
}

/**
 * A figure in lakh for a preview: two decimals below ₹10L ("₹1.90L"), one
 * from ₹10L up ("₹14.2L"), matching how `about` rounds; below ₹1L, rupees.
 */
function lakh(amount: number): string {
  if (Math.abs(amount) < 100_000) return formatINR(amount);
  const digits = Math.abs(amount) >= 1_000_000 ? 1 : 2;
  const text = (amount / 100_000).toFixed(digits).replace(/\.0+$/, "");
  return `₹${text}L`;
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The Guest counts the fewer-Guests fix tries, largest first: round steps
 * below today's count (50 from 200 Guests up, else 10), down by about a third,
 * to the nearest round step (400 goes as far as 250, 300 as far as 200).
 */
export function fewerGuestsSteps(guests: number): number[] {
  const step = guests >= 200 ? 50 : 10;
  const floor = Math.max(step, Math.round((guests * 2) / 3 / step) * step);
  const steps: number[] = [];
  for (let n = Math.ceil(guests / step) * step - step; n >= floor; n -= step)
    if (n < guests) steps.push(n);
  return steps;
}

/**
 * Assumptions the Brief works out again whenever it changes, as
 * `syncFunctions` in convex/brief.ts replaces them. Kept in step with its
 * `isDerived`.
 */
function isDerived(field: string): boolean {
  return (
    field.startsWith("function.") ||
    [
      "date",
      "menu",
      "jewellery",
      "invitations",
      "photography",
      "cake",
      "children",
    ].includes(field)
  );
}

/**
 * The budget lines of the Brief with these Functions and this Guest count,
 * with the Assumptions worked out again for them (150 invitation cards become
 * 100 at 200 Guests), as the Budget check after the edit would price them.
 */
function assumptionsFor(
  draft: FixDraft,
  functions: BriefFunction[],
  guests: number,
): Assumption[] {
  const changed =
    guests !== (draft.details.guests ?? 0) ||
    functions.length !== draft.functions.length;
  if (!changed) return draft.assumptions;
  return [
    ...draft.assumptions.filter((a) => !isDerived(a.field)),
    ...assumeFunctionDetails({
      ...draft.details,
      guests,
      functionKeys: functions.map((fn) => fn.key),
    }).assumptions,
  ];
}

/** Event-wide counts that follow the Guests and change the budget lines. */
const GUEST_COUNTS = ["invitations", "cake"];

function linesOf(
  draft: FixDraft,
  functions: BriefFunction[],
  guests: number,
): PlanLines {
  const assumptions = assumptionsFor(draft, functions, guests);
  return briefLines({
    eventType: draft.details.eventType ?? "wedding",
    tradition: draft.details.tradition,
    functions,
    assumptions,
    guests,
  });
}

/**
 * The Functions after the Brief's Guests change, as `syncFunctions` would set
 * them: a count follows the Brief while it is assumed, unset or the Brief's
 * own; a count a Member set stays.
 */
function functionsWithGuests(draft: FixDraft, guests: number): BriefFunction[] {
  const derived = assumeFunctionDetails({ ...draft.details, guests }).functions;
  return draft.functions.map((fn) => {
    const next = derived.find((d) => d.key === fn.key);
    if (!next) return fn;
    const follows =
      fn.assumed.includes("guests") || !next.assumed.includes("guests");
    return follows ? { ...fn, guests: next.guests } : fn;
  });
}

/** The Functions the fewer-Functions fix may skip. Never the last one. */
export function skippableFunctions(draft: FixDraft): BriefFunction[] {
  if (draft.functions.length < 2) return [];
  if (draft.details.eventType === "community")
    return draft.functions.filter((fn) => !RITUALS.has(fn.key));
  // A wedding never skips the wedding itself, nor a birthday its party: the
  // Event's own Function is the one whose Guests are the Brief's.
  const own = new Set(
    assumeFunctionDetails(draft.details)
      .functions.filter((fn) => !fn.assumed.includes("guests"))
      .map((fn) => fn.key),
  );
  if (own.size === 0) {
    // No Function carries the Brief's Guests: a wedding named only with
    // Functions Utsavvy doesn't know ("shaadi_ceremony"). One of them may be
    // the ceremony, so the largest of those stays, with every one tied with
    // it; with none of those, the largest of all.
    const custom = draft.functions.filter((fn) => !isFunctionKey(fn.key));
    const pool = custom.length > 0 ? custom : draft.functions;
    const largest = Math.max(...pool.map((fn) => fn.guests));
    for (const fn of pool) if (fn.guests === largest) own.add(fn.key);
  }
  return draft.functions.filter((fn) => !own.has(fn.key));
}

type Candidate = {
  kind: BudgetFix["kind"];
  label: string;
  detail: string | null;
  change: FixChange;
  lines: PlanLines;
};

function candidates(draft: FixDraft): {
  fewerGuests: Candidate[];
  fewerFunctions: Candidate[];
} {
  const from = draft.details.guests ?? 0;
  const fewerGuests = fewerGuestsSteps(from).map((guests): Candidate => {
    const functions = functionsWithGuests(draft, guests);
    const changed = functions.filter(
      (fn, i) => fn.guests !== draft.functions[i]!.guests,
    );
    // Event-wide counts that move with the Guests: "100 invitation cards".
    const before = new Map(draft.assumptions.map((a) => [a.field, a.value]));
    const counts = assumptionsFor(draft, functions, guests)
      .filter((a) => GUEST_COUNTS.includes(a.field))
      .filter((a) => before.get(a.field) !== a.value)
      .map((a) => a.value);
    const parts = [
      ...changed.map((fn) => `${fn.name} ${fn.guests.toLocaleString("en-IN")}`),
      ...counts,
    ];
    return {
      kind: "fewerGuests",
      label: `Plan for ${guests.toLocaleString("en-IN")} Guests instead of ${from.toLocaleString("en-IN")}`,
      detail: parts.length > 0 ? parts.join(", ") : null,
      change: { field: "guests", functionKey: null, guests },
      lines: linesOf(draft, functions, guests),
    };
  });
  const fewerFunctions = skippableFunctions(draft).map((skip): Candidate => ({
    kind: "fewerFunctions",
    label: `Skip the ${lowerFirst(skip.name)}`,
    detail: null,
    change: { field: "dropFunction", functionKey: skip.key },
    lines: linesOf(
      draft,
      draft.functions.filter((fn) => fn.key !== skip.key),
      from,
    ),
  }));
  return { fewerGuests, fewerFunctions };
}

const keyOf = (line: DraftBudgetLine) => `${line.category}\u0000${line.unit}`;

/**
 * Every distinct line (category and unit) the Brief and its previews price,
 * so a caller can read their ranges before calling `budgetCheckFixes`.
 */
export function fixLineKeys(draft: FixDraft): DraftBudgetLine[] {
  const { fewerGuests, fewerFunctions } = candidates(draft);
  const all = [
    linesOf(draft, draft.functions, draft.details.guests ?? 0),
    ...fewerGuests.map((c) => c.lines),
    ...fewerFunctions.map((c) => c.lines),
  ];
  const seen = new Map<string, DraftBudgetLine>();
  for (const lines of all)
    for (const line of planLines(lines))
      if (!seen.has(keyOf(line)))
        seen.set(keyOf(line), { ...line, quantity: 1 });
  return [...seen.values()];
}

/**
 * The two fixes for a budget below the minimum, fewer Guests first, or none
 * when the budget reaches it.
 *
 * - Fewer Guests lowers the Brief's Guests in round steps
 *   (`fewerGuestsSteps`) and stops at the first count that fits, or at about
 *   a third fewer.
 * - Fewer Functions skips the smallest Function that makes the plan fit, or,
 *   when none does, the one that saves the most.
 *
 * `ranges` are the Budget check's own, one per line of the current Brief in
 * `planLines` order. A preview line with the same category and unit reuses
 * that range; a line the Brief doesn't have yet (a sangeet that becomes small
 * enough for a small Venue) asks `rangeFor`, which reads the cache or the
 * table and never searches. `researched` says the stored check researched at
 * least one line; a preview with a line priced any other way then says
 * "should", since the check after the tap may research that line.
 */
export function budgetCheckFixes(
  draft: FixDraft,
  ranges: (LineEstimate | null)[],
  opts: {
    budget: number;
    contingencyShare: number;
    rangeFor: (line: DraftBudgetLine) => LineEstimate | null;
    researched: boolean;
  },
): BudgetFix[] {
  const current = linesOf(draft, draft.functions, draft.details.guests ?? 0);
  const currentLines = planLines(current);
  if (currentLines.length !== ranges.length) {
    throw new Error(
      `The Brief has ${currentLines.length} budget lines but ${ranges.length} ranges`,
    );
  }
  const known = new Map<string, LineEstimate | null>();
  currentLines.forEach((line, i) => {
    if (!known.has(keyOf(line))) known.set(keyOf(line), ranges[i] ?? null);
  });
  const rangeOf = (line: DraftBudgetLine) => {
    const key = keyOf(line);
    if (!known.has(key)) known.set(key, opts.rangeFor(line));
    return known.get(key) ?? null;
  };
  const minimumOf = (lines: PlanLines) =>
    pricePlan(lines, planLines(lines).map(rangeOf), {
      budget: opts.budget,
      contingencyShare: opts.contingencyShare,
    }).budgetCheck.minimum;

  const now = minimumOf(current);
  if (opts.budget >= now) return [];

  const priced = (c: Candidate): BudgetFix => {
    const minimum = minimumOf(c.lines);
    const fits = minimum <= opts.budget;
    const short = fits ? 0 : minimum - opts.budget;
    const shown = lakh(about(minimum));
    const gap = lakh(Math.max(1000, about(short)));
    const unsure =
      opts.researched &&
      planLines(c.lines).some(
        (line) => rangeOf(line)?.basis.kind !== "researched",
      );
    const outcome = fits
      ? unsure
        ? "which should fit"
        : "which fits"
      : unsure
        ? `which should leave about ${gap} short`
        : `still about ${gap} short`;
    return {
      kind: c.kind,
      label: c.label,
      detail: c.detail,
      preview: `New minimum about ${shown}, ${outcome}.`,
      minimum,
      fits,
      short,
      change: c.change,
    };
  };

  const { fewerGuests, fewerFunctions } = candidates(draft);
  const fixes: BudgetFix[] = [];

  const steps = fewerGuests.map(priced).filter((f) => f.minimum < now);
  const guests = steps.find((f) => f.fits) ?? steps.at(-1);
  if (guests) fixes.push(guests);

  const skips = fewerFunctions.map(priced).filter((f) => f.minimum < now);
  const fitting = skips.filter((f) => f.fits);
  const skip =
    fitting.length > 0
      ? fitting.reduce((a, b) => (b.minimum > a.minimum ? b : a))
      : skips.reduce<BudgetFix | null>(
          (a, b) => (a === null || b.minimum < a.minimum ? b : a),
          null,
        );
  if (skip) fixes.push(skip);

  return fixes;
}
