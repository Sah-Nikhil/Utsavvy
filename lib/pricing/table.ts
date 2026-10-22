import type { CityTier, ListedPriceUnit } from "../types";

/**
 * The reference table: the fallback in the estimate cascade (ADR 0013,
 * IMPLEMENTATION_PLAN.md section 4.14). The rows are the first-brief.md seed,
 * unchanged: Sah-Nikhil rejected both adjustments D2 proposed in
 * `seed/reference-table-check.md`, so the table is frozen at this version.
 * Changing a row changes the worked examples, and their tests name this version.
 */
export const REFERENCE_TABLE_VERSION = "2026-10-22";

/** Units a reference-table row is priced in. A draft's budget line uses the same keys. */
export type TableUnit =
  | "per_plate"
  | "per_function"
  | "per_day"
  | "per_event"
  | "per_card"
  | "per_kg"
  | "per_child"
  | "per_guest"
  | "per_guest_day";

/** The Vendor categories whose Listed prices can price a row. */
export type FeedingVendorCategory =
  "venue" | "caterer" | "decorator" | "photographer";

export type ReferenceRow = {
  eventType: "wedding" | "birthday" | "community";
  label: string;
  unit: TableUnit;
  /** Tier Y, whole rupees per unit. */
  low: number;
  high: number;
  /** The Source column. */
  source: string;
  /** The † mark: our own working figure, with no source yet. */
  unsourced: boolean;
  /**
   * Which Vendor categories' comparable Listed prices can price this row. A
   * Listed price feeds a row only in the row's own unit.
   */
  feeds: { vendorCategory: FeedingVendorCategory; unit: ListedPriceUnit }[];
};

const DAGGER = "† (our own working figure, no source yet)";
const STARTER_SET =
  "Starter set, seen on the Vendors' own sites on 21 Oct 2026";

const catererPerPlate = [
  { vendorCategory: "caterer", unit: "per_plate" },
  { vendorCategory: "venue", unit: "per_plate" },
] as const satisfies ReferenceRow["feeds"];
const venuePerFunction = [
  { vendorCategory: "venue", unit: "per_function" },
] as const satisfies ReferenceRow["feeds"];
const decoratorPerFunction = [
  { vendorCategory: "decorator", unit: "per_function" },
] as const satisfies ReferenceRow["feeds"];

/**
 * Rows keyed by category. Keys are what a `FirstPlanDraft` budget line names as
 * its `category`. Prasad is two rows because the seed's note prices sthapana and
 * visarjan (₹30-₹60) apart from daily aarti (₹20-₹40); the Ganesh utsav worked
 * example uses those two ranges.
 */
export const referenceTable = {
  // Weddings ---------------------------------------------------------------
  catering_light: {
    eventType: "wedding",
    label: "Catering, light (haldi, lunch)",
    unit: "per_plate",
    low: 500,
    high: 900,
    source: `${STARTER_SET}: Vinayak Foods & Catering about ₹250-₹500 per plate (veg), from ₹250. Below this row's low; lowering it was proposed and rejected on 22 Oct 2026.`,
    unsourced: false,
    feeds: [...catererPerPlate],
  },
  catering_standard: {
    eventType: "wedding",
    label: "Catering, standard (mehendi)",
    unit: "per_plate",
    low: 700,
    high: 1200,
    source: `${STARTER_SET}: M L Caterers Silver ₹850 per plate (exact, veg).`,
    unsourced: false,
    feeds: [...catererPerPlate],
  },
  catering_main: {
    eventType: "wedding",
    label: "Catering, main dinner (sangeet, wedding, reception)",
    unit: "per_plate",
    low: 1000,
    high: 2000,
    source: `Jaipur banquet hall's own site, about ₹1,200-₹3,500 (Vendor data research); Jaipur listings mostly ₹2,000-₹3,000, some ₹700-₹800 (background reading of WedMeGood, nothing copied). ${STARTER_SET}: M L Caterers Silver ₹850, Gold ₹1,350, Platinum ₹1,950 per plate (exact, veg); Parampara Banquet Hall about ₹1,200-₹3,500 per plate (veg).`,
    unsourced: false,
    feeds: [...catererPerPlate],
  },
  venue_small: {
    eventType: "wedding",
    label: "Venue, small or at home (≤150 Guests)",
    unit: "per_function",
    low: 15000,
    high: 50000,
    source: DAGGER,
    unsourced: true,
    feeds: [...venuePerFunction],
  },
  venue_large: {
    eventType: "wedding",
    label: "Venue, large (>150 Guests)",
    unit: "per_function",
    low: 75000,
    high: 200000,
    source: DAGGER,
    unsourced: true,
    feeds: [...venuePerFunction],
  },
  decor_small: {
    eventType: "wedding",
    label: "Decor, small (≤150 Guests)",
    unit: "per_function",
    low: 15000,
    high: 40000,
    source: DAGGER,
    unsourced: true,
    feeds: [...decoratorPerFunction],
  },
  decor_medium: {
    eventType: "wedding",
    label: "Decor, medium (>150 Guests)",
    unit: "per_function",
    low: 50000,
    high: 120000,
    source:
      "Starting prices around ₹75,000, home functions ₹30,000 (directory listings)",
    unsourced: false,
    feeds: [...decoratorPerFunction],
  },
  decor_main: {
    eventType: "wedding",
    label: "Decor, main stage and mandap (wedding, reception)",
    unit: "per_function",
    low: 75000,
    high: 200000,
    source:
      "Starting prices around ₹75,000, home functions ₹30,000 (directory listings)",
    unsourced: false,
    feeds: [...decoratorPerFunction],
  },
  dj_sound: {
    eventType: "wedding",
    label: "DJ and sound",
    unit: "per_function",
    low: 20000,
    high: 50000,
    source: `${DAGGER}; Samaro puts all entertainment at 5-9% (₹2.5-4.5L)`,
    unsourced: true,
    feeds: [],
  },
  dhol: {
    eventType: "wedding",
    label: "Dhol",
    unit: "per_function",
    low: 8000,
    high: 20000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  mehendi_artists: {
    eventType: "wedding",
    label: "Mehendi artists (bride + about 40 hands)",
    unit: "per_function",
    low: 10000,
    high: 30000,
    source:
      "Bridal mehendi from ₹2,100-₹7,000 in Udaipur; 40-hand packages ₹4,000-₹25,000",
    unsourced: false,
    feeds: [],
  },
  baraat_band_ghodi: {
    eventType: "wedding",
    label: "Baraat band and ghodi",
    unit: "per_function",
    low: 30000,
    high: 80000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  pandit_puja: {
    eventType: "wedding",
    label: "Pandit and puja items",
    unit: "per_function",
    low: 10000,
    high: 30000,
    source: `${DAGGER}; per ritual Function`,
    unsourced: true,
    feeds: [],
  },
  photography_video: {
    eventType: "wedding",
    label: "Photography and video (Event-wide)",
    unit: "per_day",
    low: 25000,
    high: 50000,
    source: `Photo + video day rates ₹25,000-₹40,000, up to ₹90,000 in Delhi NCR (WeddingBazaar listings). ${STARTER_SET}: Candid Life Photography ₹35,000 photo + video, ₹15,000 photo only (pre-wedding shoot day rates).`,
    unsourced: false,
    feeds: [{ vendorCategory: "photographer", unit: "per_day" }],
  },
  makeup: {
    eventType: "wedding",
    label: "Makeup, bride and family (Event-wide)",
    unit: "per_event",
    low: 40000,
    high: 120000,
    source: "Samaro: ₹1-2L across all Functions",
    unsourced: false,
    feeds: [],
  },
  outfits: {
    eventType: "wedding",
    label: "Outfits (Event-wide)",
    unit: "per_event",
    low: 75000,
    high: 250000,
    source: `${DAGGER}; Samaro puts bridal fashion at 5-8%. Jewellery is excluded by default, shown as an Assumption.`,
    unsourced: true,
    feeds: [],
  },
  invitations: {
    eventType: "wedding",
    label: "Invitations (Event-wide)",
    unit: "per_card",
    low: 80,
    high: 250,
    source: `${DAGGER}; one card per two Guests, assumed`,
    unsourced: true,
    feeds: [],
  },
  transport_misc: {
    eventType: "wedding",
    label: "Transport and misc. (Event-wide)",
    unit: "per_event",
    low: 25000,
    high: 75000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },

  // Birthdays --------------------------------------------------------------
  party_catering: {
    eventType: "birthday",
    label: "Catering, party",
    unit: "per_plate",
    low: 400,
    high: 800,
    source: `Party venues list ₹350-₹1,500 per plate (VenueLook, Indore). ${STARTER_SET}: Vinayak Foods & Catering about ₹250-₹500 per plate (veg).`,
    unsourced: false,
    feeds: [...catererPerPlate],
  },
  party_hall: {
    eventType: "birthday",
    label: "Party hall",
    unit: "per_function",
    low: 15000,
    high: 50000,
    source:
      "A small banquet hall around ₹50,000 a day (Citizen Matters, Bengaluru)",
    unsourced: false,
    feeds: [...venuePerFunction],
  },
  party_decor: {
    eventType: "birthday",
    label: "Decor",
    unit: "per_function",
    low: 5000,
    high: 25000,
    source: "Basic decor from ₹3,000 (Citizen Matters)",
    unsourced: false,
    feeds: [...decoratorPerFunction],
  },
  cake: {
    eventType: "birthday",
    label: "Cake",
    unit: "per_kg",
    low: 800,
    high: 1500,
    source: `${DAGGER}; 1 kg per 20 Guests, assumed`,
    unsourced: true,
    feeds: [],
  },
  entertainer: {
    eventType: "birthday",
    label: "Entertainer (magician, games host)",
    unit: "per_function",
    low: 3000,
    high: 15000,
    source: "Magic show ₹2,500 (Citizen Matters, older article)",
    unsourced: false,
    feeds: [],
  },
  return_gifts: {
    eventType: "birthday",
    label: "Return gifts",
    unit: "per_child",
    low: 150,
    high: 400,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  party_photography: {
    eventType: "birthday",
    label: "Photography",
    unit: "per_function",
    low: 8000,
    high: 20000,
    source: "Candid-only ₹8,000-₹15,000 (WeddingBazaar listings)",
    unsourced: false,
    feeds: [{ vendorCategory: "photographer", unit: "per_function" }],
  },

  // Community festivals (Ganesh utsav rows) --------------------------------
  idol: {
    eventType: "community",
    label: "Idol, eco clay, 4-5 ft",
    unit: "per_event",
    low: 20000,
    high: 40000,
    source:
      "Mumbai mandals: 4 ft clay about ₹35,000, PoP about ₹10,000 (press coverage, low confidence)",
    unsourced: false,
    feeds: [],
  },
  pandal_decor: {
    eventType: "community",
    label: "Pandal and decor, whole festival (Event-wide)",
    unit: "per_event",
    low: 35000,
    high: 150000,
    source:
      "Cardboard decor ₹35,000 vs ₹2-3L for a PoP setup (press coverage, low confidence)",
    unsourced: false,
    feeds: [],
  },
  sound_system: {
    eventType: "community",
    label: "Sound system, whole festival (Event-wide)",
    unit: "per_event",
    low: 15000,
    high: 40000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  permissions: {
    eventType: "community",
    label: "Permissions and fees (Event-wide)",
    unit: "per_event",
    low: 0,
    high: 5000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  community_pandit_puja: {
    eventType: "community",
    label: "Pandit and puja items",
    unit: "per_function",
    low: 5000,
    high: 15000,
    source: `${DAGGER}; per ritual Function`,
    unsourced: true,
    feeds: [],
  },
  prasad: {
    eventType: "community",
    label: "Prasad (sthapana, visarjan)",
    unit: "per_guest_day",
    low: 30,
    high: 60,
    source: `${DAGGER}; the seed row is ₹20-₹60, with ₹30-₹60 for sthapana and visarjan`,
    unsourced: true,
    feeds: [],
  },
  prasad_daily_aarti: {
    eventType: "community",
    label: "Prasad (daily aarti)",
    unit: "per_guest_day",
    low: 20,
    high: 40,
    source: `${DAGGER}; the seed row is ₹20-₹60, with ₹20-₹40 for daily aarti`,
    unsourced: true,
    feeds: [],
  },
  aarti_flowers: {
    eventType: "community",
    label: "Flowers for daily aarti",
    unit: "per_day",
    low: 1000,
    high: 3000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  cultural_stage_lighting: {
    eventType: "community",
    label: "Stage and lighting, cultural night",
    unit: "per_function",
    low: 20000,
    high: 50000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  performers_anchor: {
    eventType: "community",
    label: "Performers and anchor",
    unit: "per_function",
    low: 10000,
    high: 40000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  cultural_snacks: {
    eventType: "community",
    label: "Snacks, cultural night",
    unit: "per_guest",
    low: 80,
    high: 150,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  dhol_tasha_pathak: {
    eventType: "community",
    label: "Dhol-tasha pathak, visarjan",
    unit: "per_function",
    low: 15000,
    high: 40000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
  visarjan_vehicle: {
    eventType: "community",
    label: "Vehicle, visarjan",
    unit: "per_function",
    low: 5000,
    high: 15000,
    source: DAGGER,
    unsourced: true,
    feeds: [],
  },
} as const satisfies Record<string, ReferenceRow>;

export type TableCategory = keyof typeof referenceTable;

export function isTableCategory(category: string): category is TableCategory {
  return Object.hasOwn(referenceTable, category);
}

/** The row for a category, or null for a free label or an unknown key. */
export function tableRow(category: string): ReferenceRow | null {
  return isTableCategory(category) ? referenceTable[category] : null;
}

/** City tier multipliers, applied to reference-table rows only (first-brief.md). */
export const TIER_MULTIPLIER = {
  X: 1.25,
  Y: 1,
  Z: 0.8,
} as const satisfies Record<CityTier, number>;

/**
 * The eight X cities and the Y cities of the central government's HRA classes
 * ([Classification of Indian cities](https://en.wikipedia.org/wiki/Classification_of_Indian_cities)).
 * Any city on neither list is Z (first-brief.md).
 */
const X_CITIES = [
  "ahmedabad",
  "bengaluru",
  "chennai",
  "delhi",
  "hyderabad",
  "kolkata",
  "mumbai",
  "pune",
];

const Y_CITIES = [
  "agra",
  "ajmer",
  "aligarh",
  "amravati",
  "amritsar",
  "asansol",
  "aurangabad",
  "bareilly",
  "belagavi",
  "bhavnagar",
  "bhiwandi",
  "bhopal",
  "bhubaneswar",
  "bikaner",
  "bilaspur",
  "bokaro steel city",
  "chandigarh",
  "coimbatore",
  "cuttack",
  "dehradun",
  "dhanbad",
  "bhilai",
  "durgapur",
  "erode",
  "faridabad",
  "firozabad",
  "ghaziabad",
  "gorakhpur",
  "kalaburagi",
  "guntur",
  "gwalior",
  "gurugram",
  "guwahati",
  "hamirpur",
  "hubballi-dharwad",
  "indore",
  "jabalpur",
  "jaipur",
  "jalandhar",
  "jammu",
  "jamnagar",
  "jamshedpur",
  "jhansi",
  "jodhpur",
  "kakinada",
  "kannur",
  "kanpur",
  "karnal",
  "kochi",
  "kolhapur",
  "kollam",
  "kozhikode",
  "kurnool",
  "ludhiana",
  "lucknow",
  "madurai",
  "malappuram",
  "mathura",
  "mangaluru",
  "meerut",
  "moradabad",
  "mysuru",
  "nagpur",
  "nanded",
  "nashik",
  "nellore",
  "noida",
  "patna",
  "puducherry",
  "purulia",
  "prayagraj",
  "raipur",
  "rajkot",
  "rajamahendravaram",
  "ranchi",
  "rourkela",
  "ratlam",
  "salem",
  "sangli",
  "shimla",
  "siliguri",
  "solapur",
  "srinagar",
  "surat",
  "thanjavur",
  "thiruvananthapuram",
  "thrissur",
  "tiruchirappalli",
  "tirunelveli",
  "tiruvannamalai",
  "ujjain",
  "vijayapura",
  "vadodara",
  "varanasi",
  "vasai-virar",
  "vijayawada",
  "visakhapatnam",
  "vellore",
  "warangal",
];

/** Older or common names that Members type for listed cities. */
const ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  "new delhi": "delhi",
  calcutta: "kolkata",
  madras: "chennai",
  poona: "pune",
  gurgaon: "gurugram",
  mysore: "mysuru",
  mangalore: "mangaluru",
  allahabad: "prayagraj",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
  baroda: "vadodara",
  vizag: "visakhapatnam",
  calicut: "kozhikode",
  trichy: "tiruchirappalli",
  belgaum: "belagavi",
  gulbarga: "kalaburagi",
  hubli: "hubballi-dharwad",
  pondicherry: "puducherry",
  rajahmundry: "rajamahendravaram",
  banaras: "varanasi",
  benares: "varanasi",
};

/** The city name as the cache and tier lookups key it: lowercased, trimmed, without a ", state" suffix. */
export function cityKey(cityName: string): string {
  return (cityName.split(",")[0] ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function cityTier(cityName: string): CityTier {
  const key = cityKey(cityName);
  const name = ALIASES[key] ?? key;
  if (X_CITIES.includes(name)) return "X";
  if (Y_CITIES.includes(name)) return "Y";
  return "Z";
}

/**
 * A category's per-unit range for a City tier, or null when the table has no
 * row for that category in that unit.
 */
export function tableRange(
  category: string,
  unit: string,
  tier: CityTier,
): { unitLow: number; unitHigh: number } | null {
  const row = tableRow(category);
  if (!row || row.unit !== unit) return null;
  const multiplier = TIER_MULTIPLIER[tier];
  return { unitLow: row.low * multiplier, unitHigh: row.high * multiplier };
}
