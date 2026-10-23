import { cityTier } from "../pricing/table";
import type { PlanLines } from "../pricing/pricePlan";
import type {
  Assumption,
  BriefDate,
  DraftBudgetLine,
  EventType,
  FunctionDate,
  Honoree,
} from "../types";
import { isFunctionKey } from "../types/functions";
import {
  addDays,
  daysInRange,
  fifteenth,
  formatDay,
  formatRange,
  monthsAfter,
} from "./dates";
import {
  communityKindKey,
  communityKindLabel,
  festivalDates,
} from "./festivalDates";

/**
 * The Functions a Brief implies and the Assumptions that fill them in
 * (docs/design/first-brief.md "Chip questions"), plus the budget lines the
 * Budget check prices before any plan exists. Pure: no Convex or React.
 */

// ---------------------------------------------------------------------------
// Traditions

export const TRADITIONS = [
  {
    key: "north_indian_hindu",
    label: "North Indian Hindu",
    functions: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
    vegetarian: true,
  },
  {
    key: "marwari",
    label: "Marwari / Rajasthani",
    functions: [
      "tilak",
      "mayra",
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
    ],
    vegetarian: true,
  },
  {
    key: "punjabi_sikh",
    label: "Punjabi or Sikh",
    functions: [
      "roka",
      "chunni",
      "mehendi",
      "jaggo",
      "anand_karaj",
      "reception",
    ],
    vegetarian: false,
  },
  {
    key: "muslim",
    label: "Muslim",
    functions: ["manjha", "mehendi", "nikah", "walima"],
    vegetarian: false,
  },
  {
    key: "south_indian_hindu",
    label: "South Indian Hindu",
    functions: ["nichayathartham", "muhurtham", "reception"],
    vegetarian: true,
  },
  {
    key: "bengali",
    label: "Bengali",
    functions: ["aashirbaad", "gaye_holud", "biye", "bou_bhaat"],
    vegetarian: false,
  },
  {
    key: "christian",
    label: "Christian",
    functions: ["engagement", "church_wedding", "reception"],
    vegetarian: false,
  },
] as const;

export type TraditionKey =
  (typeof TRADITIONS)[number]["key"] | "mixed" | "other";

const TRADITION_WORDS: [RegExp, TraditionKey][] = [
  [/mixed|two families|inter.?faith|inter.?caste/i, "mixed"],
  [
    /south|tamil|telugu|kannad|malayal|kerala|iyer|iyengar/i,
    "south_indian_hindu",
  ],
  [/marwari|rajasthan|rajput/i, "marwari"],
  [/punjab|sikh/i, "punjabi_sikh"],
  [/muslim|islam/i, "muslim"],
  [/bengal|bangla/i, "bengali"],
  [/christian|catholic|church/i, "christian"],
  [/north indian|hindu/i, "north_indian_hindu"],
  [/^other/i, "other"],
];

/** The Tradition's key from a chip value or the Member's words, or null when unknown. */
export function traditionKey(tradition: string): TraditionKey | null {
  const exact = TRADITIONS.find((t) => t.key === tradition);
  if (exact) return exact.key;
  if (tradition === "mixed" || tradition === "other") return tradition;
  for (const [pattern, key] of TRADITION_WORDS) {
    if (pattern.test(tradition)) return key;
  }
  return null;
}

/** The label a Tradition is shown and stored with. */
export function traditionLabel(tradition: string): string {
  const key = traditionKey(tradition);
  if (key === "mixed") return "Mixed (two families)";
  return TRADITIONS.find((t) => t.key === key)?.label ?? tradition;
}

/**
 * A Tradition's default Functions as `FUNCTION_KEYS` keys. "Mixed" merges the
 * two families' lists in order. A Tradition with no list (Other, or one the
 * table doesn't know) gets the wedding and the reception, for the Member to
 * change in Q7.
 */
export function defaultFunctions(
  tradition: string | null,
  mixOf: string[] = [],
): string[] {
  const key = tradition ? traditionKey(tradition) : null;
  if (key === "mixed") {
    const merged: string[] = [];
    for (const part of mixOf) {
      for (const fn of defaultFunctions(part)) {
        if (!merged.includes(fn)) merged.push(fn);
      }
    }
    return merged.length > 0 ? merged : defaultFunctions(null);
  }
  const row = TRADITIONS.find((t) => t.key === key);
  return row ? [...row.functions] : ["wedding", "reception"];
}

// ---------------------------------------------------------------------------
// Function keys

/** Names and spellings Members use, checked in order (the more specific first). */
const FUNCTION_WORDS: [RegExp, string][] = [
  [/bou ?bha+t/, "bou_bhaat"],
  [/gaye ?holud|gaye ?halud/, "gaye_holud"],
  [/a+shirba+d/, "aashirbaad"],
  [/\bbiye\b/, "biye"],
  [/church/, "church_wedding"],
  [/engagement|sagai|ring ceremony/, "engagement"],
  [/anand ?karaj/, "anand_karaj"],
  [/mayra|\bbhaat\b|\bbhat\b/, "mayra"],
  [/tilak|\btika\b/, "tilak"],
  [/\broka\b/, "roka"],
  [/chunni|chunri/, "chunni"],
  [/jaggo/, "jaggo"],
  [/manjha|manja/, "manjha"],
  [/nikah/, "nikah"],
  [/walima|valima/, "walima"],
  [/nis?chayathar?tham/, "nichayathartham"],
  [/muhurt(h)?am/, "muhurtham"],
  [/haldi|pithi|ubtan/, "haldi"],
  [/meh[ae]?n?di|mehandi/, "mehendi"],
  [/sangeet|sangit/, "sangeet"],
  [/reception/, "reception"],
  [/^wedding$|pheras?|shaadi|vivah|wedding ceremony/, "wedding"],
  [/sthapana|sthapna|installation/, "sthapana"],
  [/aa?rti/, "daily_aarti"],
  [/cultural/, "cultural_night"],
  [/visarjan|immersion/, "visarjan"],
  [/shasht(i|y)/, "shashtipoorthi"],
];

/** A slug: lowercase words joined by underscores. */
function slug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "_");
}

/**
 * Normalises a Function's name to its `FUNCTION_KEYS` key. A Function the
 * Member names that isn't on the list keeps its own slug
 * (lib/types/functions.ts).
 */
export function functionKey(name: string): string {
  const key = slug(name);
  if (isFunctionKey(key)) return key;
  const words = key.replace(/_/g, " ");
  for (const [pattern, known] of FUNCTION_WORDS) {
    if (pattern.test(words)) return known;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Function details

type Kind = "light" | "mehendi" | "party" | "main" | "reception";

type FunctionDefaults = {
  name: string;
  /** Days from the wedding day. */
  offset: number;
  time: "morning" | "evening";
  /** Share of the wedding's Guests (first-brief.md: 20%, 40%, 75%, 100%). */
  share: number;
  place?: string;
  kind: Kind;
  pandit?: boolean;
  baraat?: boolean;
};

/**
 * Wedding Functions. First-brief.md fixes the shares and the Jaipur example's
 * offsets (mehendi two days before, haldi and sangeet the day before, the
 * reception the day after); the other Traditions' offsets follow the same
 * pattern and are all shown as Assumptions.
 */
const WEDDING_FUNCTIONS: Record<string, FunctionDefaults> = {
  tilak: {
    name: "Tilak",
    offset: -4,
    time: "evening",
    share: 0.2,
    kind: "light",
    pandit: true,
  },
  roka: {
    name: "Roka",
    offset: -4,
    time: "evening",
    share: 0.2,
    kind: "light",
  },
  chunni: {
    name: "Chunni",
    offset: -3,
    time: "evening",
    share: 0.2,
    kind: "light",
  },
  aashirbaad: {
    name: "Aashirbaad",
    offset: -3,
    time: "evening",
    share: 0.2,
    kind: "light",
    pandit: true,
  },
  mayra: {
    name: "Mayra (bhaat)",
    offset: -2,
    time: "morning",
    share: 0.2,
    kind: "light",
  },
  manjha: {
    name: "Manjha",
    offset: -2,
    time: "evening",
    share: 0.2,
    kind: "light",
  },
  mehendi: {
    name: "Mehendi",
    offset: -2,
    time: "evening",
    share: 0.4,
    kind: "mehendi",
  },
  engagement: {
    name: "Engagement",
    offset: -7,
    time: "evening",
    share: 0.4,
    kind: "party",
  },
  haldi: {
    name: "Haldi",
    offset: -1,
    time: "morning",
    share: 0.2,
    place: "at home",
    kind: "light",
    pandit: true,
  },
  nichayathartham: {
    name: "Nichayathartham",
    offset: -1,
    time: "evening",
    share: 0.2,
    kind: "light",
    pandit: true,
  },
  sangeet: {
    name: "Sangeet",
    offset: -1,
    time: "evening",
    share: 0.75,
    kind: "party",
  },
  jaggo: {
    name: "Jaggo",
    offset: -1,
    time: "evening",
    share: 0.75,
    kind: "party",
  },
  gaye_holud: {
    name: "Gaye holud",
    offset: 0,
    time: "morning",
    share: 0.2,
    kind: "light",
  },
  wedding: {
    name: "Wedding",
    offset: 0,
    time: "evening",
    share: 1,
    kind: "main",
    pandit: true,
    baraat: true,
  },
  anand_karaj: {
    name: "Anand Karaj",
    offset: 0,
    time: "morning",
    share: 1,
    kind: "main",
    baraat: true,
  },
  nikah: { name: "Nikah", offset: 0, time: "evening", share: 1, kind: "main" },
  muhurtham: {
    name: "Muhurtham",
    offset: 0,
    time: "morning",
    share: 1,
    kind: "main",
    pandit: true,
  },
  biye: {
    name: "Biye",
    offset: 0,
    time: "evening",
    share: 1,
    kind: "main",
    pandit: true,
  },
  church_wedding: {
    name: "Church wedding",
    offset: 0,
    time: "morning",
    share: 1,
    kind: "main",
  },
  reception: {
    name: "Reception",
    offset: 1,
    time: "evening",
    share: 1,
    kind: "reception",
  },
  walima: {
    name: "Walima",
    offset: 1,
    time: "evening",
    share: 1,
    kind: "reception",
  },
  bou_bhaat: {
    name: "Bou bhaat",
    offset: 2,
    time: "evening",
    share: 1,
    kind: "reception",
  },
};

/** A Function the Member added by name: the day before, at 40% of the Guests. */
function customDefaults(key: string): FunctionDefaults {
  return {
    name: titleCase(key.replace(/_/g, " ")),
    offset: -1,
    time: "evening",
    share: 0.4,
    kind: "party",
  };
}

function titleCase(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const OTHER_NAMES: Record<string, string> = {
  party: "Party",
  puja: "Puja",
  dinner: "Dinner",
  shashtipoorthi: "Shashtipoorthi",
  sthapana: "Sthapana",
  daily_aarti: "Daily aarti",
  cultural_night: "Cultural night",
  visarjan: "Visarjan",
};

/** The name a Function is shown with. */
export function functionName(key: string): string {
  return (
    WEDDING_FUNCTIONS[key]?.name ?? OTHER_NAMES[key] ?? customDefaults(key).name
  );
}

/** One Function as the Brief summary shows it. */
export type BriefFunction = {
  key: string;
  name: string;
  date: FunctionDate;
  guests: number;
  /** Which of `date` and `guests` are Assumptions. */
  assumed: ("date" | "guests")[];
};

export type FunctionDetailsInput = {
  eventType: EventType | null;
  date: BriefDate | null;
  guests: number | null;
  tradition: string | null;
  honoree: Honoree | null;
  communityKind: string | null;
  /** The Functions chosen in Q7 or named in the Brief; null for the defaults. */
  functionKeys: string[] | null;
  /** Children at a child's party, when the Brief implied it. */
  children: number | null;
  /** ISO day. */
  today: string;
};

function assumption(field: string, value: string, reason: string): Assumption {
  return { field, value, reason };
}

/** The Event's main day, and the Assumption behind it when it wasn't given exactly. */
function mainDay(
  input: FunctionDetailsInput,
  noun: string,
): { day: string; assumption: Assumption | null } {
  if (input.date?.kind === "day")
    return { day: input.date.value, assumption: null };
  if (input.date?.kind === "month") {
    const day = fifteenth(input.date.value);
    return {
      day,
      assumption: assumption(
        "date",
        `${noun} on ${formatDay(day)}`,
        "Only the month was given, so the 15th",
      ),
    };
  }
  const day = fifteenth(monthsAfter(input.today, 12));
  return {
    day,
    assumption: assumption(
      "date",
      `${noun} on ${formatDay(day)}`,
      "No date yet, so 12 months from today, on the 15th",
    ),
  };
}

const guestsText = (n: number) => `${n.toLocaleString("en-IN")} Guests`;

/**
 * Fills in every Function's date and Guest count and lists the Assumptions,
 * as first-brief.md describes: wedding Functions on days relative to the
 * wedding at 20%, 40%, 75% or 100% of its Guests; a birthday's Functions by
 * the age; a Ganesh utsav's four programmes over the festival.
 */
export function assumeFunctionDetails(input: FunctionDetailsInput): {
  functions: BriefFunction[];
  assumptions: Assumption[];
} {
  switch (input.eventType) {
    case "birthday":
      return birthdayDetails(input);
    case "community":
      return communityDetails(input);
    default:
      return weddingDetails(input);
  }
}

function weddingDetails(input: FunctionDetailsInput) {
  const guests = input.guests ?? 0;
  const keys = input.functionKeys?.length
    ? input.functionKeys
    : defaultFunctions(input.tradition);
  const { day, assumption: dateAssumption } = mainDay(input, "Wedding");
  const assumptions: Assumption[] = dateAssumption ? [dateAssumption] : [];
  const functions: BriefFunction[] = [];

  for (const key of keys) {
    const d = WEDDING_FUNCTIONS[key] ?? customDefaults(key);
    const date = addDays(day, d.offset);
    const fnGuests = Math.round(guests * d.share);
    const isMain = d.kind === "main" && d.offset === 0;
    const assumed: BriefFunction["assumed"] = [];
    if (!isMain || dateAssumption) assumed.push("date");
    if (!isMain) assumed.push("guests");
    functions.push({
      key,
      name: d.name,
      date: { kind: "day", value: date },
      guests: fnGuests,
      assumed,
    });
    if (!isMain) {
      const where = d.place ? `, ${d.place}` : "";
      assumptions.push(
        assumption(
          `function.${key}.date`,
          `${formatDay(date)}, ${d.time}${where}`,
          relativeReason(d.offset),
        ),
        assumption(
          `function.${key}.guests`,
          guestsText(fnGuests),
          `${Math.round(d.share * 100)}% of the wedding's Guests`,
        ),
      );
    }
  }

  const tradition = TRADITIONS.find(
    (t) => t.key === (input.tradition ? traditionKey(input.tradition) : null),
  );
  if (tradition?.vegetarian) {
    assumptions.push(
      assumption("menu", "Vegetarian", "Usual for this Tradition"),
    );
  }
  assumptions.push(
    assumption(
      "jewellery",
      "Not included in the Budget",
      "Jewellery is usually bought apart from the wedding budget",
    ),
    assumption(
      "invitations",
      `${Math.ceil(guests / 2)} invitation cards`,
      "One card for every two Guests",
    ),
    assumption(
      "photography",
      `Photographer for ${distinctDays(functions)} days`,
      "One day for each day with a Function",
    ),
  );
  return { functions, assumptions };
}

function relativeReason(offset: number): string {
  if (offset === 0) return "On the wedding day";
  const n = Math.abs(offset);
  const days = n === 1 ? "The day" : `${n} days`;
  return `${days} ${offset < 0 ? "before" : "after"} the wedding`;
}

function distinctDays(functions: BriefFunction[]): number {
  const days = new Set<string>();
  for (const fn of functions) {
    if (fn.date.kind === "day") days.add(fn.date.value);
    else
      for (let i = 0; i < daysInRange(fn.date.from, fn.date.to); i++)
        days.add(addDays(fn.date.from, i));
  }
  return days.size;
}

/** The Functions a birthday gets by age (first-brief.md, "Birthday"). */
export function birthdayFunctions(honoree: Honoree | null): string[] {
  const age = honoree?.age ?? null;
  if (age === 1) return ["puja", "party"];
  if (age === 60) return ["shashtipoorthi", "dinner"];
  if (age === 50 || age === 75) return ["puja", "dinner"];
  return ["party"];
}

const BIRTHDAY_SHARE: Record<string, number> = {
  puja: 0.4,
  shashtipoorthi: 0.5,
};

function birthdayDetails(input: FunctionDetailsInput) {
  const guests = input.guests ?? 0;
  const keys = input.functionKeys?.length
    ? input.functionKeys
    : birthdayFunctions(input.honoree);
  const { day, assumption: dateAssumption } = mainDay(input, "Birthday");
  const assumptions: Assumption[] = dateAssumption ? [dateAssumption] : [];
  const functions: BriefFunction[] = keys.map((key) => {
    const share = BIRTHDAY_SHARE[key] ?? 1;
    const fnGuests = Math.round(guests * share);
    const assumed: BriefFunction["assumed"] = dateAssumption ? ["date"] : [];
    if (share !== 1) {
      assumed.push("guests");
      assumptions.push(
        assumption(
          `function.${key}.guests`,
          guestsText(fnGuests),
          "Close family",
        ),
      );
    }
    return {
      key,
      name: functionName(key),
      date: { kind: "day", value: day },
      guests: fnGuests,
      assumed,
    };
  });

  const child =
    input.honoree?.who !== "adult" && input.honoree?.who !== "elder";
  if (keys.includes("party") && child) {
    const children = input.children ?? Math.round(guests / 2);
    assumptions.push(
      assumption(
        "function.party.time",
        "4:00 to 7:00 pm in a party hall",
        "Usual for a child's party",
      ),
      assumption(
        "children",
        `${children} children get return gifts`,
        input.children === null ? "About half the Guests" : "From the Brief",
      ),
    );
  }
  assumptions.push(
    assumption("cake", `${cakeKg(guests)} kg cake`, "1 kg for every 20 Guests"),
  );
  return { functions, assumptions };
}

function cakeKg(guests: number): number {
  return Math.max(1, Math.ceil(guests / 20));
}

/** The Ganesh utsav's programmes (first-brief.md worked example 3). */
const GANESH = ["sthapana", "daily_aarti", "cultural_night", "visarjan"];

function communityDetails(input: FunctionDetailsInput) {
  const guests = input.guests ?? 0;
  const kind = input.communityKind ?? "";
  const assumptions: Assumption[] = [];
  const { day: start, assumption: dateAssumption } = mainDay(input, "Starts");
  if (dateAssumption) assumptions.push(dateAssumption);

  if (communityKindKey(kind) !== "ganesh-utsav") {
    const key = functionKey(communityKindLabel(kind) || "community event");
    return {
      functions: [
        {
          key,
          name: titleCase(communityKindLabel(kind) || "Community event"),
          date: { kind: "day", value: start } as FunctionDate,
          guests,
          assumed: dateAssumption ? (["date"] as BriefFunction["assumed"]) : [],
        },
      ],
      assumptions,
    };
  }

  const festival = festivalDates("ganesh-utsav", Number(start.slice(0, 4)));
  const end =
    festival && festival.from === start ? festival.to : addDays(start, 10);
  const plan: Record<string, { date: FunctionDate; share: number }> = {
    sthapana: { date: { kind: "day", value: start }, share: 0.375 },
    daily_aarti: {
      date: { kind: "range", from: start, to: addDays(end, -1) },
      share: 0.25,
    },
    cultural_night: {
      date: { kind: "day", value: addDays(end, -3) },
      share: 1,
    },
    visarjan: { date: { kind: "day", value: end }, share: 0.75 },
  };
  const keys = input.functionKeys?.length
    ? GANESH.filter((k) => input.functionKeys!.includes(k))
    : GANESH;
  const functions: BriefFunction[] = keys.map((key) => {
    const { date, share } = plan[key]!;
    const fnGuests = Math.round(guests * share);
    const busiest = key === "cultural_night";
    assumptions.push(
      assumption(
        `function.${key}.date`,
        date.kind === "day"
          ? formatDay(date.value)
          : formatRange(date.from, date.to),
        "From the festival's dates",
      ),
    );
    if (!busiest) {
      assumptions.push(
        assumption(
          `function.${key}.guests`,
          key === "daily_aarti"
            ? `${guestsText(fnGuests)} a day`
            : guestsText(fnGuests),
          "A share of the busiest programme's Guests",
        ),
      );
    }
    return {
      key,
      name: functionName(key),
      date,
      guests: fnGuests,
      assumed: busiest ? ["date"] : ["date", "guests"],
    };
  });
  return { functions, assumptions };
}

// ---------------------------------------------------------------------------
// City

/** A city on neither the X nor the Y list is Z, shown as an Assumption (first-brief.md Q2). */
export function cityAssumption(city: string): Assumption | null {
  if (cityTier(city) !== "Z") return null;
  return assumption(
    "city.tier",
    "Treated as a smaller city",
    `${city.trim()} isn't on the government's list of X or Y cities, so prices use the smaller-city range`,
  );
}

// ---------------------------------------------------------------------------
// Budget lines

/** The Brief's budget lines by Function, in the shape `pricePlan` reads. */
export type BriefLines = PlanLines & {
  functions: {
    key: string;
    guests: number;
    budgetEntries: DraftBudgetLine[];
  }[];
};

function line(
  category: string,
  quantity: number,
  unit: string,
): DraftBudgetLine {
  return { category, quantity, unit };
}

/** A number from an Assumption's value, such as "35 children get return gifts". */
function assumedNumber(
  assumptions: Assumption[],
  field: string,
): number | null {
  const value = assumptions.find((a) => a.field === field)?.value;
  const match = value?.match(/\d[\d,]*/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

function weddingFunctionLines(fn: BriefFunction): DraftBudgetLine[] {
  const d = WEDDING_FUNCTIONS[fn.key] ?? customDefaults(fn.key);
  const small = fn.guests <= 150;
  const catering =
    d.kind === "light"
      ? "catering_light"
      : d.kind === "mehendi"
        ? "catering_standard"
        : "catering_main";
  const decor =
    d.kind === "main" || d.kind === "reception"
      ? "decor_main"
      : small
        ? "decor_small"
        : "decor_medium";
  const lines = [
    line(catering, fn.guests, "per_plate"),
    line(small ? "venue_small" : "venue_large", 1, "per_function"),
    line(decor, 1, "per_function"),
  ];
  if (d.kind === "mehendi") {
    lines.push(
      line("mehendi_artists", 1, "per_function"),
      line("dhol", 1, "per_function"),
    );
  }
  if (d.kind === "party" || d.kind === "reception")
    lines.push(line("dj_sound", 1, "per_function"));
  if (d.baraat) lines.push(line("baraat_band_ghodi", 1, "per_function"));
  if (d.pandit) lines.push(line("pandit_puja", 1, "per_function"));
  return lines;
}

function birthdayFunctionLines(
  fn: BriefFunction,
  children: number | null,
): DraftBudgetLine[] {
  const g = fn.guests;
  switch (fn.key) {
    case "puja":
    case "shashtipoorthi":
      return [
        line("party_catering", g, "per_plate"),
        line("pandit_puja", 1, "per_function"),
      ];
    case "party":
      return [
        line("party_catering", g, "per_plate"),
        line("party_hall", 1, "per_function"),
        line("party_decor", 1, "per_function"),
        line("cake", cakeKg(g), "per_kg"),
        ...(children !== null
          ? [
              line("entertainer", 1, "per_function"),
              line("return_gifts", children, "per_child"),
            ]
          : []),
        line("party_photography", 1, "per_function"),
      ];
    default:
      return [
        line("party_catering", g, "per_plate"),
        line("party_hall", 1, "per_function"),
        line("party_decor", 1, "per_function"),
        line("cake", cakeKg(g), "per_kg"),
        line("party_photography", 1, "per_function"),
      ];
  }
}

function communityFunctionLines(fn: BriefFunction): DraftBudgetLine[] {
  const g = fn.guests;
  switch (fn.key) {
    case "sthapana":
      return [
        line("community_pandit_puja", 1, "per_function"),
        line("prasad", g, "per_guest_day"),
      ];
    case "daily_aarti": {
      const days =
        fn.date.kind === "range" ? daysInRange(fn.date.from, fn.date.to) : 1;
      return [
        line("aarti_flowers", days, "per_day"),
        line("prasad_daily_aarti", g * days, "per_guest_day"),
      ];
    }
    case "visarjan":
      return [
        line("dhol_tasha_pathak", 1, "per_function"),
        line("visarjan_vehicle", 1, "per_function"),
        line("prasad", g, "per_guest_day"),
      ];
    default:
      return [
        line("cultural_stage_lighting", 1, "per_function"),
        line("performers_anchor", 1, "per_function"),
        line("cultural_snacks", g, "per_guest"),
      ];
  }
}

/**
 * The Brief's budget lines, which the Budget check prices through the estimate
 * cascade before any plan exists (IMPLEMENTATION_PLAN.md section 4.6, step 3).
 * Every category is a reference-table key, so a line always has at least the
 * table's range. The first plan (S14) drafts its own lines; for the three
 * worked examples they are these.
 */
export function briefLines(input: {
  eventType: EventType;
  tradition: string | null;
  functions: BriefFunction[];
  assumptions: Assumption[];
  guests: number;
}): BriefLines {
  const { functions, assumptions, guests } = input;
  if (input.eventType === "birthday") {
    const childParty = assumptions.some((a) => a.field === "children");
    const children = childParty ? assumedNumber(assumptions, "children") : null;
    return {
      functions: functions.map((fn) => ({
        key: fn.key,
        guests: fn.guests,
        budgetEntries: birthdayFunctionLines(fn, children),
      })),
      eventWide: [],
    };
  }
  if (input.eventType === "community") {
    const ganesh = functions.some((fn) => GANESH.includes(fn.key));
    return {
      functions: functions.map((fn) => ({
        key: fn.key,
        guests: fn.guests,
        budgetEntries: communityFunctionLines(fn),
      })),
      eventWide: [
        ...(ganesh ? [line("idol", 1, "per_event")] : []),
        line("pandal_decor", 1, "per_event"),
        line("sound_system", 1, "per_event"),
        line("permissions", 1, "per_event"),
      ],
    };
  }
  return {
    functions: functions.map((fn) => ({
      key: fn.key,
      guests: fn.guests,
      budgetEntries: weddingFunctionLines(fn),
    })),
    eventWide: [
      line(
        "photography_video",
        Math.max(1, distinctDays(functions)),
        "per_day",
      ),
      line("makeup", 1, "per_event"),
      line("outfits", 1, "per_event"),
      line(
        "invitations",
        assumedNumber(assumptions, "invitations") ?? Math.ceil(guests / 2),
        "per_card",
      ),
      line("transport_misc", 1, "per_event"),
    ],
  };
}
