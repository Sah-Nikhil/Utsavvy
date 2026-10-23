import { formatLakh } from "../format";
import type { BriefDate, BriefExtraction, EventType, Honoree } from "../types";
import { formatRange, isIsoDay, isIsoMonth } from "./dates";
import {
  COMMUNITY_KINDS,
  communityKindKey,
  communityKindLabel,
  nextFestival,
} from "./festivalDates";
import {
  defaultFunctions,
  functionKey,
  functionName,
  TRADITIONS,
  traditionLabel,
} from "./functions";
import { parseAmount, parseCount } from "./parse";

/**
 * The first Brief's question flow (docs/design/first-brief.md "Question
 * flow"). Code, not the model, decides which chip question comes next from
 * the missing fields, in the first-brief order, one at a time, seven at most
 * (IMPLEMENTATION_PLAN.md section 4.6, step 2). Pure.
 */

/** The Assistant's first line in a new Event, word for word from first-brief.md. */
export const OPENING_LINE =
  "Tell me about what you're planning: what you're celebrating, where, roughly when, for how many people, and your budget if you have one.";

export type QuestionId =
  | "eventType"
  | "city"
  | "date"
  | "guests"
  | "budget"
  | "tradition"
  | "functions"
  | "honoreeWho"
  | "honoreeAge"
  | "communityKind"
  | "households";

export type Chip = { value: string; label: string };

export type ChipQuestion = {
  id: QuestionId;
  /** Q1 to Q7 in first-brief.md. */
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  prompt: string;
  chips: Chip[];
  /** Toggle chips, all chosen at once (Q7's Functions); the rest answer with one tap. */
  multi: boolean;
  /** The "type my own" box. */
  typeOwn: {
    label: string;
    input: "text" | "count" | "amount" | "date" | "month";
  } | null;
};

/** What the Brief has settled beyond the extraction's own fields. */
export type BriefProgress = {
  /** Q7's Functions, or the Functions the Brief named; null until then. */
  functionKeys: string[] | null;
  /** Q7 for a community event was skipped: no per-household share. */
  householdsSkipped: boolean;
  /** "Help me set one": the budget becomes the typical Estimate. */
  budgetHelp: boolean;
  /** "Not decided yet": the date becomes an Assumption. */
  dateUndecided: boolean;
};

export const NO_PROGRESS: BriefProgress = {
  functionKeys: null,
  householdsSkipped: false,
  budgetHelp: false,
  dateUndecided: false,
};

export type BriefState = {
  extraction: BriefExtraction;
  progress: BriefProgress;
};

/** An answer the question can't read; its message is shown to the Member. */
export class BriefAnswerError extends Error {
  override name = "BriefAnswerError";
}

const GUEST_CHIPS: Record<EventType, Chip[]> = {
  wedding: ["100", "200", "300", "500", "800+"].map(countChip),
  birthday: ["20", "50", "100", "200"].map(countChip),
  community: ["50", "100", "250", "500", "1,000+"].map(countChip),
};

function countChip(label: string): Chip {
  return { value: label.replace(/[,+]/g, ""), label };
}

const BUDGET_CHIPS: Record<EventType, number[]> = {
  wedding: [1_000_000, 2_500_000, 5_000_000, 10_000_000],
  birthday: [50_000, 100_000, 200_000, 500_000],
  community: [50_000, 200_000, 500_000, 1_000_000],
};

function budgetLabel(amount: number): string {
  if (amount >= 10_000_000) return `₹${amount / 10_000_000}Cr`;
  if (amount < 100_000) return `₹${amount / 1000}k`;
  return formatLakh(amount);
}

const AGE_CHIPS: Record<Honoree["who"], number[]> = {
  child: [1, 3, 5, 6, 8, 10, 12],
  adult: [18, 21, 25, 30, 40],
  elder: [50, 60, 70, 75, 80],
};

/** The Event type the Brief is about: what the Member said, else what the Event was created as. */
function typeOf(extraction: BriefExtraction): EventType | null {
  return extraction.eventType;
}

/**
 * The next chip question, or null when the essentials are complete. A
 * question is skipped when the Brief already answered it. `today` is an ISO
 * day, for proposing a community festival's dates.
 */
export function nextQuestion(
  extraction: BriefExtraction,
  progress: BriefProgress = NO_PROGRESS,
  today: string,
): ChipQuestion | null {
  const type = typeOf(extraction);
  if (type === null) {
    return {
      id: "eventType",
      number: 1,
      prompt: "What are you celebrating?",
      chips: [
        { value: "wedding", label: "Wedding" },
        { value: "birthday", label: "Birthday" },
        { value: "community", label: "Community event" },
      ],
      multi: false,
      typeOwn: { label: "Something else", input: "text" },
    };
  }
  if (extraction.city === null) {
    return {
      id: "city",
      number: 2,
      prompt: "Which city is it in?",
      chips: ["Jaipur", "Delhi", "Mumbai", "Bengaluru", "Pune"].map((c) => ({
        value: c,
        label: c,
      })),
      multi: false,
      typeOwn: { label: "Type a city", input: "text" },
    };
  }
  if (extraction.date === null && !progress.dateUndecided) {
    const festival =
      type === "community" && extraction.communityKind
        ? nextFestival(extraction.communityKind, today)
        : null;
    return {
      id: "date",
      number: 3,
      prompt: festival
        ? `${communityKindLabel(extraction.communityKind!)} is from ${festival.fromLabel} to ${festival.toLabel}: ${formatRange(festival.from, festival.to)}. Shall I plan for those days?`
        : "When is it?",
      chips: [
        ...(festival
          ? [
              {
                value: `festival:${festival.from}:${festival.to}`,
                label: `Yes, ${formatRange(festival.from, festival.to)}`,
              },
            ]
          : []),
        {
          value: "pick-day",
          label: festival ? "Pick other dates" : "Pick a date",
        },
        { value: "pick-month", label: "Just the month" },
        ...(festival ? [] : [{ value: "undecided", label: "Not decided yet" }]),
      ],
      multi: false,
      typeOwn: { label: "Pick a date", input: "date" },
    };
  }
  if (extraction.guests === null) {
    return {
      id: "guests",
      number: 4,
      prompt:
        type === "community"
          ? "How many people come to the busiest programme?"
          : "Roughly how many Guests?",
      chips: GUEST_CHIPS[type],
      multi: false,
      typeOwn: { label: "Type a number", input: "count" },
    };
  }
  if (extraction.budget === null && !progress.budgetHelp) {
    return {
      id: "budget",
      number: 5,
      prompt: "What's the total budget?",
      chips: [
        ...BUDGET_CHIPS[type].map((amount) => ({
          value: String(amount),
          label: budgetLabel(amount),
        })),
        { value: "help", label: "Help me set one" },
      ],
      multi: false,
      typeOwn: { label: "Type an amount", input: "amount" },
    };
  }
  switch (type) {
    case "wedding":
      if (extraction.tradition === null) {
        return {
          id: "tradition",
          number: 6,
          prompt: "Which Tradition are the Functions from?",
          chips: [
            ...TRADITIONS.map((t) => ({ value: t.key, label: t.label })),
            { value: "mixed", label: "Mixed (two families)" },
            { value: "other", label: "Other, I'll describe it" },
          ],
          multi: false,
          typeOwn: { label: "Describe it", input: "text" },
        };
      }
      if (progress.functionKeys === null) {
        return {
          id: "functions",
          number: 7,
          prompt: "Which Functions are you planning?",
          chips: defaultFunctions(extraction.tradition).map((key) => ({
            value: key,
            label: functionName(key),
          })),
          multi: true,
          typeOwn: { label: "Add a Function", input: "text" },
        };
      }
      return null;
    case "birthday":
      if (extraction.honoree === null) {
        return {
          id: "honoreeWho",
          number: 6,
          prompt: "Who is it for?",
          chips: [
            { value: "child", label: "Child" },
            { value: "adult", label: "Adult" },
            { value: "elder", label: "Parent or grandparent" },
          ],
          multi: false,
          typeOwn: { label: "Type who it's for", input: "text" },
        };
      }
      if (extraction.honoree.age === null) {
        return {
          id: "honoreeAge",
          number: 7,
          prompt: "Which birthday is it?",
          chips: AGE_CHIPS[extraction.honoree.who].map((age) => ({
            value: String(age),
            label: ordinal(age),
          })),
          multi: false,
          typeOwn: { label: "Type the age", input: "count" },
        };
      }
      return null;
    case "community":
      if (extraction.communityKind === null) {
        return {
          id: "communityKind",
          number: 6,
          prompt: "What kind of event is it?",
          chips: COMMUNITY_KINDS.map((k) => ({ value: k.key, label: k.label })),
          multi: false,
          typeOwn: { label: "Other, I'll describe it", input: "text" },
        };
      }
      if (extraction.households === null && !progress.householdsSkipped) {
        return {
          id: "households",
          number: 7,
          prompt:
            "How many households are contributing? I'll show each one's share.",
          chips: [
            ...["50", "100", "250", "500"].map(countChip),
            { value: "skip", label: "Skip" },
          ],
          multi: false,
          typeOwn: { label: "Type a number", input: "count" },
        };
      }
      return null;
  }
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ??
        "th");
  return `${n}${suffix}`;
}

function needCount(text: string, what: string): number {
  const n = parseCount(text);
  if (n === null) throw new BriefAnswerError(`Type a number of ${what}.`);
  return n;
}

function eventTypeFrom(text: string): {
  eventType: EventType;
  communityKind: string | null;
} {
  const value = text.trim();
  if (/^(wedding|birthday|community)$/.test(value))
    return { eventType: value as EventType, communityKind: null };
  if (/wedding|shaadi|vivah|marriage|शादी|विवाह/i.test(value))
    return { eventType: "wedding", communityKind: null };
  if (/birthday|janamdin|जन्मदिन/i.test(value))
    return { eventType: "birthday", communityKind: null };
  if (value.length === 0)
    throw new BriefAnswerError("Say what you're celebrating.");
  return { eventType: "community", communityKind: value };
}

function dateFrom(text: string): {
  date: BriefDate | null;
  undecided: boolean;
} {
  const value = text.trim();
  if (value === "undecided") return { date: null, undecided: true };
  const [kind, from] = value.split(":");
  if (kind === "festival" && from && isIsoDay(from))
    return { date: { kind: "day", value: from }, undecided: false };
  if (kind === "day" && from && isIsoDay(from))
    return { date: { kind: "day", value: from }, undecided: false };
  if (kind === "month" && from && isIsoMonth(from))
    return { date: { kind: "month", value: from }, undecided: false };
  if (isIsoDay(value))
    return { date: { kind: "day", value }, undecided: false };
  if (isIsoMonth(value))
    return { date: { kind: "month", value }, undecided: false };
  throw new BriefAnswerError("Pick a date or a month.");
}

function honoreeFrom(text: string): Honoree {
  const value = text.trim().toLowerCase();
  if (value === "child" || value === "adult" || value === "elder")
    return { who: value, age: null, name: null };
  if (/child|kid|son|daughter|beta|beti|baby/.test(value))
    return { who: "child", age: null, name: null };
  if (
    /mom|dad|mother|father|grand|parent|nana|nani|dada|dadi|papa|mummy/.test(
      value,
    )
  )
    return { who: "elder", age: null, name: null };
  if (value.length === 0) throw new BriefAnswerError("Say who it's for.");
  return { who: "adult", age: null, name: null };
}

/**
 * Applies a Member's answer (a chip's value, typed text, or Q7's chosen
 * Functions) to the Brief. Throws `BriefAnswerError` for an answer it can't
 * read.
 */
export function answerChip(
  state: BriefState,
  question: ChipQuestion | QuestionId,
  answer: string | string[],
  today: string,
): BriefState {
  const id = typeof question === "string" ? question : question.id;
  const extraction = { ...state.extraction };
  const progress = { ...state.progress };
  const text = Array.isArray(answer) ? answer.join(", ") : answer;
  switch (id) {
    case "eventType": {
      const parsed = eventTypeFrom(text);
      extraction.eventType = parsed.eventType;
      if (parsed.communityKind) extraction.communityKind = parsed.communityKind;
      break;
    }
    case "city": {
      const city = text.trim().replace(/\s+/g, " ");
      if (city.length === 0 || city.length > 80)
        throw new BriefAnswerError("Type the city's name.");
      extraction.city = city;
      break;
    }
    case "date": {
      const { date, undecided } = dateFrom(text);
      extraction.date = date;
      progress.dateUndecided = undecided;
      break;
    }
    case "guests":
      extraction.guests = needCount(text, "Guests");
      break;
    case "budget":
      if (text.trim() === "help") {
        extraction.budget = null;
        progress.budgetHelp = true;
      } else {
        const amount = parseAmount(text);
        if (amount === null)
          throw new BriefAnswerError(
            "Type an amount, such as 15 lakh or ₹2,40,000.",
          );
        extraction.budget = amount;
        progress.budgetHelp = false;
      }
      break;
    case "tradition": {
      const value = text.trim();
      if (value.length === 0)
        throw new BriefAnswerError("Say which Tradition.");
      extraction.tradition =
        value === "other" ? "Other" : traditionLabel(value);
      break;
    }
    case "functions": {
      const chosen = (Array.isArray(answer) ? answer : answer.split(","))
        .map((name) => name.trim())
        .filter(Boolean)
        .map(functionKey);
      const unique = [...new Set(chosen)];
      // Choosing nothing keeps the Tradition's Functions rather than none.
      progress.functionKeys =
        unique.length > 0 ? unique : defaultFunctions(extraction.tradition);
      break;
    }
    case "honoreeWho":
      extraction.honoree = honoreeFrom(text);
      break;
    case "honoreeAge": {
      const age = parseCount(text);
      if (age === null || age > 120)
        throw new BriefAnswerError("Type the age as a number.");
      extraction.honoree = {
        ...(extraction.honoree ?? {
          who: age < 18 ? "child" : "adult",
          name: null,
        }),
        age,
      };
      break;
    }
    case "communityKind": {
      const value = text.trim();
      if (value.length === 0)
        throw new BriefAnswerError("Say what kind of event.");
      extraction.communityKind = communityKindKey(value)
        ? communityKindLabel(value)
        : value;
      break;
    }
    case "households":
      if (text.trim() === "skip") {
        extraction.households = null;
        progress.householdsSkipped = true;
      } else {
        extraction.households = needCount(text, "households");
      }
      break;
  }
  void today;
  return { extraction, progress };
}
