import type { Assumption, BriefExtraction } from "../types";

/**
 * The first-brief.md worked examples as the extraction step returns them, plus
 * a Hinglish and a Hindi Brief. Tests check the pure Brief logic against them,
 * the scripted cases (`evals/brief.eval.ts`) check the real model against them,
 * and the stub model (`convex/brief.ts`) answers with them on previews and in
 * e2e, matched by the Brief's text.
 */
export type BriefExample = {
  /** What the Member types. */
  text: string;
  extraction: BriefExtraction;
  /** Functions the Member named, as `FUNCTION_KEYS` keys (none in these Briefs). */
  functions: string[];
  /** Values the Member implied without stating them, such as Aarav's 60 Guests. */
  assumed: Assumption[];
};

const NONE = {
  eventType: null,
  city: null,
  date: null,
  guests: null,
  budget: null,
  tradition: null,
  honoree: null,
  communityKind: null,
  households: null,
  notes: [],
} satisfies BriefExtraction;

/** 1. Jaipur wedding: Tradition is missing, so the Assistant asks Q6 and Q7. */
export const jaipurWedding: BriefExample = {
  text: "My sister's wedding in Jaipur in February 2027, around 300 people, budget 25 lakh.",
  extraction: {
    ...NONE,
    eventType: "wedding",
    city: "Jaipur",
    date: { kind: "month", value: "2027-02" },
    guests: 300,
    budget: 2500000,
    notes: ["The Member's sister's wedding"],
  },
  functions: [],
  assumed: [],
};

/** 2. Aarav's 6th birthday: nothing is missing; the 60 Guests are an Assumption. */
export const aaravBirthday: BriefExample = {
  text: "Aarav's 6th birthday party in Jaipur on Saturday 12 December, about 35 kids and their parents, budget 1.5 lakh.",
  extraction: {
    ...NONE,
    eventType: "birthday",
    city: "Jaipur",
    date: { kind: "day", value: "2026-12-12" },
    guests: 60,
    budget: 150000,
    honoree: { who: "child", age: 6, name: "Aarav" },
  },
  functions: [],
  assumed: [
    {
      field: "guests",
      value: "60 Guests",
      reason: "35 children plus about 25 adults",
    },
    {
      field: "children",
      value: "35",
      reason: "About 35 kids were mentioned",
    },
  ],
};

/** 3. Pune Ganesh utsav: the dates and the Guest count are missing. */
export const puneGaneshUtsav: BriefExample = {
  text: "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat.",
  extraction: {
    ...NONE,
    eventType: "community",
    city: "Pune",
    budget: 240000,
    communityKind: "Ganesh utsav",
    households: 240,
    notes: ["A housing society's celebration"],
  },
  functions: [],
  assumed: [],
};

/** The Jaipur wedding at ₹15L in Hinglish: below the minimum, so it gets the flag. */
export const hinglishWedding: BriefExample = {
  text: "Meri behen ki shaadi Jaipur mein February 2027 mein hai, lagbhag 300 log, budget 15 lakh.",
  extraction: {
    ...jaipurWedding.extraction,
    budget: 1500000,
  },
  functions: [],
  assumed: [],
};

/** The Ganesh utsav in Hindi. */
export const hindiGaneshUtsav: BriefExample = {
  text: "पुणे में हमारी सोसाइटी का गणेशोत्सव, 240 फ्लैट, हर फ्लैट से ₹1,000 इकट्ठा किए।",
  extraction: puneGaneshUtsav.extraction,
  functions: [],
  assumed: [],
};

export const BRIEF_EXAMPLES = [
  jaipurWedding,
  aaravBirthday,
  puneGaneshUtsav,
  hinglishWedding,
  hindiGaneshUtsav,
] as const;
