/**
 * Community festival dates (IMPLEMENTATION_PLAN.md section 4.6, step 2): a
 * small dated table sourced from Drik Panchang, never the model's memory. The
 * Assistant proposes these dates and the Member confirms them (first-brief.md
 * Q3). A kind or year with no sourced row has no proposal, and the Assistant
 * asks for the date like any other Event.
 */

/** The community event kinds Q6 offers (first-brief.md). */
export const COMMUNITY_KINDS = [
  { key: "ganesh-utsav", label: "Ganesh utsav" },
  { key: "durga-puja", label: "Durga puja" },
  { key: "navratri-garba", label: "Navratri garba" },
  { key: "diwali-mela", label: "Diwali mela" },
  { key: "society-annual-day", label: "Society annual day" },
] as const;

export type CommunityKindKey = (typeof COMMUNITY_KINDS)[number]["key"];

export type FestivalDates = {
  /** The first day, ISO. */
  from: string;
  /** The last day, ISO. */
  to: string;
  /** What each end of the range is. */
  fromLabel: string;
  toLabel: string;
  sources: string[];
};

/**
 * Sourced rows only. Ganesh utsav runs from Ganesh Chaturthi to Anant
 * Chaturdashi (first-brief.md worked example 3).
 */
const FESTIVALS: Partial<
  Record<CommunityKindKey, Record<number, FestivalDates>>
> = {
  "ganesh-utsav": {
    2027: {
      from: "2027-09-04",
      to: "2027-09-14",
      fromLabel: "Ganesh Chaturthi",
      toLabel: "Anant Chaturdashi",
      sources: [
        "https://www.drikpanchang.com/festivals/ganesh-chaturthi/ganesh-chaturthi-date-time.html?year=2027",
        "https://www.drikpanchang.com/festivals/anant-chaturdashi/anant-chaturdashi-date-time.html?year=2027",
      ],
    },
  },
};

/** A festival's dates in one year, or null when the table has no sourced row. */
export function festivalDates(
  kind: string,
  year: number,
): FestivalDates | null {
  const key = communityKindKey(kind);
  if (!key) return null;
  return FESTIVALS[key]?.[year] ?? null;
}

/** The next festival that hasn't started by `today` (ISO), within two years. */
export function nextFestival(
  kind: string,
  today: string,
): FestivalDates | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1, year + 2]) {
    const dates = festivalDates(kind, y);
    if (dates && dates.from > today) return dates;
  }
  return null;
}

const KIND_WORDS: [RegExp, CommunityKindKey][] = [
  [/ganesh|ganpati|ganapati|vinayak|गणेश|गणपति/i, "ganesh-utsav"],
  [/durga|pujo|दुर्गा/i, "durga-puja"],
  [/navrat|garba|dandiya|नवरात्र|गरबा/i, "navratri-garba"],
  [/diwali|deepavali|mela|दिवाली/i, "diwali-mela"],
  [/annual day|society day|वार्षिक/i, "society-annual-day"],
];

/** The kind's key from a chip value or what the Member typed, or null for another kind. */
export function communityKindKey(kind: string): CommunityKindKey | null {
  const exact = COMMUNITY_KINDS.find((k) => k.key === kind);
  if (exact) return exact.key;
  for (const [pattern, key] of KIND_WORDS) {
    if (pattern.test(kind)) return key;
  }
  return null;
}

/** The kind's label for display, or the Member's own words. */
export function communityKindLabel(kind: string): string {
  const key = communityKindKey(kind);
  return COMMUNITY_KINDS.find((k) => k.key === key)?.label ?? kind;
}
