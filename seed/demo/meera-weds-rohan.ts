import type { BriefExtraction } from "../../lib/types/brief";

/*
 * The demo Event, "Meera weds Rohan" (IMPLEMENTATION_PLAN.md section 9.1).
 * Everything `internal.demo.reset` writes comes from this file: the first-brief
 * worked example 1 plan, the people, the Chat, the Comments and the history.
 * No model calls: the plan is priced on the reference-table path, so every
 * Estimate shows the reference-table basis and the numbers match the worked
 * example in docs/design/first-brief.md.
 *
 * The people, Quotes and Comments are made up, which is why the demo Event
 * shows its banner (section 3, item 5).
 *
 * The seeded Utsavvy replies were written here, not by a model, so when a
 * judge asks a follow-up the Assistant reads them as earlier Chat it did not
 * write (no `finishReason`; the fail-closed rule from #117). That is
 * deliberate: nothing pretends a model said them.
 */

/** The `demoKey` the reset finds the demo Event by (section 4.4). */
export const DEMO_KEY = "meera-weds-rohan";

export const DEMO_EVENT = {
  name: "Meera weds Rohan",
  /** The Owner is shown as Host and Co-owners as Co-hosts. */
  ownerLabel: "host",
  city: {
    name: "Jaipur",
    tier: "Y",
    centre: { lat: 26.9124, lng: 75.7873 },
  },
  tradition: "north_indian_hindu",
  budgetTotal: 2_500_000,
  contingencyShare: 0.1,
  /** The vibe pick's words; the palette comes from the three picked photos. */
  styleWords: ["royal Rajputana"],
  decorKeywords: ["marigold", "pastel pink"],
} as const;

/** The Brief as the first-brief worked example 1 extracts it, Tradition answered. */
export const DEMO_BRIEF: BriefExtraction = {
  eventType: "wedding",
  city: "Jaipur",
  date: { kind: "month", value: "2027-02" },
  guests: 300,
  budget: 2_500_000,
  tradition: "north_indian_hindu",
  honoree: null,
  communityKind: null,
  households: null,
  notes: ["Meera and Rohan's wedding"],
};

/** The five Functions, in the plan's order. */
export const DEMO_FUNCTION_KEYS = [
  "haldi",
  "mehendi",
  "sangeet",
  "wedding",
  "reception",
] as const;

/**
 * The one change from the worked example (section 9.1): the family confirmed
 * 300 Guests at the sangeet, where the Assumption said 225, and Rohan set the
 * sangeet catering line to ₹2,45,000. The Contingency absorbs the difference,
 * so the Event total stays exactly ₹25,00,000 and the WhatsApp Quote
 * (₹950 × 300 = ₹2,85,000) puts the Budget exactly ₹40,000 over.
 */
export const SANGEET_CHANGE = {
  functionKey: "sangeet",
  guests: 300,
  cateringCategory: "catering_main",
  cateringAmount: 245_000,
} as const;

// ---------------------------------------------------------------------------
// People

export type DemoRole = "owner" | "coOwner" | "member" | "viewer";

/** The three judge accounts; their Clerk user IDs are Convex env settings. */
export const DEMO_JUDGES = [
  { env: "DEMO_JUDGE_OWNER_ID", name: "judge-owner", role: "owner" },
  { env: "DEMO_JUDGE_MEMBER_ID", name: "judge-member", role: "member" },
  { env: "DEMO_JUDGE_VIEWER_ID", name: "judge-viewer", role: "viewer" },
] as const satisfies readonly { env: string; name: string; role: DemoRole }[];

/**
 * The seed personas. Their `clerkId` starts with "seed:", which no Clerk
 * sign-in can ever present, so nobody can sign in as them.
 */
export const DEMO_PERSONAS = [
  { key: "meera", name: "Meera", role: "coOwner", status: "active" },
  { key: "rohan", name: "Rohan", role: "member", status: "active" },
  { key: "papa", name: "Papa", role: "viewer", status: "active" },
  { key: "aditi", name: "Aditi", role: "member", status: "left" },
  { key: "kabir", name: "Kabir", role: "member", status: "removed" },
] as const satisfies readonly {
  key: string;
  name: string;
  role: DemoRole;
  status: "active" | "left" | "removed";
}[];
export type PersonaKey = (typeof DEMO_PERSONAS)[number]["key"];

export const personaClerkId = (key: PersonaKey) => `seed:${key}`;

// ---------------------------------------------------------------------------
// The first plan: first-brief.md worked example 1, as the model would draft it

type Row = [time: string, label: string];
const sheet = (rows: Row[]) => rows.map(([time, label]) => ({ time, label }));
const line = (category: string, quantity: number, unit: string) => ({
  category,
  quantity,
  unit,
});

/**
 * The fixed plan draft, in the shape of S14's `PlanDraftOutput`: no amounts
 * and no dates. Per-plate quantities follow each Function's Guests when the
 * reset builds the full `FirstPlanDraft` (`toFirstPlanDraft`), so the sangeet
 * is drafted at the Assumption's 225 Guests and the one change moves it to 300.
 */
export const DEMO_PLAN_DRAFT = {
  functions: [
    {
      key: "haldi",
      budgetEntries: [
        line("catering_light", 60, "per_plate"),
        line("venue_small", 1, "per_function"),
        line("decor_small", 1, "per_function"),
        line("pandit_puja", 1, "per_function"),
      ],
      runSheet: sheet([
        ["09:00", "Family gathers in the courtyard"],
        ["09:30", "Pandit begins the puja"],
        ["10:00", "Haldi for the bride"],
        ["11:00", "Songs and games with the family"],
        ["12:00", "Lunch"],
        ["13:30", "Bride rests before the sangeet"],
      ]),
    },
    {
      key: "mehendi",
      budgetEntries: [
        line("catering_standard", 120, "per_plate"),
        line("venue_small", 1, "per_function"),
        line("decor_small", 1, "per_function"),
        line("mehendi_artists", 1, "per_function"),
        line("dhol", 1, "per_function"),
      ],
      runSheet: sheet([
        ["16:00", "Mehendi artists set up"],
        ["16:30", "Guests arrive"],
        ["17:00", "Bride's mehendi begins"],
        ["18:00", "Dhol and dancing"],
        ["19:30", "Dinner opens"],
        ["21:30", "Close"],
      ]),
    },
    {
      key: "sangeet",
      budgetEntries: [
        line("catering_main", 225, "per_plate"),
        line("venue_large", 1, "per_function"),
        line("decor_medium", 1, "per_function"),
        line("dj_sound", 1, "per_function"),
      ],
      runSheet: sheet([
        ["18:30", "Family photos"],
        ["19:00", "Guests arrive"],
        ["19:30", "Family performances"],
        ["20:30", "Dinner"],
        ["21:30", "DJ"],
        ["23:30", "Close"],
      ]),
    },
    {
      key: "wedding",
      budgetEntries: [
        line("catering_main", 300, "per_plate"),
        line("venue_large", 1, "per_function"),
        line("decor_main", 1, "per_function"),
        line("baraat_band_ghodi", 1, "per_function"),
        line("pandit_puja", 1, "per_function"),
      ],
      runSheet: sheet([
        ["17:30", "Bride ready"],
        ["18:30", "Baraat assembles"],
        ["19:00", "Baraat sets off with band and ghodi"],
        ["19:45", "Milni and welcome at the Venue"],
        ["20:15", "Varmala on stage"],
        ["20:30", "Dinner opens"],
        ["22:30", "Pheras begin (move to the muhurat)"],
        ["01:00", "Vidaai"],
      ]),
    },
    {
      key: "reception",
      budgetEntries: [
        line("catering_main", 300, "per_plate"),
        line("venue_large", 1, "per_function"),
        line("decor_main", 1, "per_function"),
        line("dj_sound", 1, "per_function"),
      ],
      runSheet: sheet([
        ["19:00", "Couple arrives at the Venue"],
        ["19:30", "Guests arrive"],
        ["20:00", "Couple's entry on stage"],
        ["20:30", "Dinner opens"],
        ["21:30", "DJ and dancing"],
        ["23:30", "Close"],
      ]),
    },
  ],
  eventWide: [
    line("photography_video", 4, "per_day"),
    line("makeup", 1, "per_event"),
    line("outfits", 1, "per_event"),
    line("invitations", 150, "per_card"),
    line("transport_misc", 1, "per_event"),
  ],
  deadlines: [
    {
      title: "Book Venues",
      functionKey: null,
      vendorCategory: "venue",
      leadKey: "book_venues",
    },
    {
      title: "Book the caterer",
      functionKey: null,
      vendorCategory: "caterer",
      leadKey: "book_caterer",
    },
    {
      title: "Book the photographer",
      functionKey: null,
      vendorCategory: "photographer",
      leadKey: "book_photographer",
    },
    {
      title: "Book the decorator",
      functionKey: null,
      vendorCategory: "decorator",
      leadKey: "book_decorator",
    },
    {
      title: "Book makeup and mehendi artists, after trials",
      functionKey: null,
      vendorCategory: "makeup_artist",
      leadKey: "book_makeup_mehendi",
    },
    {
      title: "Book the baraat band and ghodi",
      functionKey: "wedding",
      vendorCategory: "baraat_band_ghodi",
      leadKey: "book_baraat_band",
    },
    {
      title: "Order outfits and first fittings",
      functionKey: null,
      vendorCategory: null,
      leadKey: "order_outfits",
    },
    {
      title: "Book the DJ",
      functionKey: "sangeet",
      vendorCategory: "dj",
      leadKey: "book_dj",
    },
    {
      title: "Book transport",
      functionKey: null,
      vendorCategory: null,
      leadKey: "book_transport",
    },
    {
      title: "Send invitations",
      functionKey: null,
      vendorCategory: "invitations_printer",
      leadKey: "send_invitations",
    },
    {
      title: "Makeup trials",
      functionKey: null,
      vendorCategory: null,
      leadKey: "makeup_trial",
    },
    {
      title: "Share run sheets with the photographer",
      functionKey: null,
      vendorCategory: null,
      leadKey: "share_run_sheets",
    },
  ],
  vendorChecklist: [
    ...["mehendi", "sangeet", "wedding", "reception"].map((key) => ({
      category: "venue",
      functionKeys: [key],
      budgetEntryRefs: [
        `${key}:${key === "mehendi" ? "venue_small" : "venue_large"}`,
      ],
    })),
    {
      category: "caterer",
      functionKeys: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
      budgetEntryRefs: [
        "haldi:catering_light",
        "mehendi:catering_standard",
        "sangeet:catering_main",
        "wedding:catering_main",
        "reception:catering_main",
      ],
    },
    {
      category: "decorator",
      functionKeys: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
      budgetEntryRefs: [
        "haldi:decor_small",
        "mehendi:decor_small",
        "sangeet:decor_medium",
        "wedding:decor_main",
        "reception:decor_main",
      ],
    },
    {
      category: "photographer",
      functionKeys: [],
      budgetEntryRefs: ["event:photography_video"],
    },
    {
      category: "makeup_artist",
      functionKeys: [],
      budgetEntryRefs: ["event:makeup"],
    },
    {
      category: "mehendi_artists",
      functionKeys: ["mehendi"],
      budgetEntryRefs: ["mehendi:mehendi_artists"],
    },
    {
      category: "dj",
      functionKeys: ["sangeet", "reception"],
      budgetEntryRefs: ["sangeet:dj_sound", "reception:dj_sound"],
    },
    {
      category: "dhol",
      functionKeys: ["mehendi"],
      budgetEntryRefs: ["mehendi:dhol"],
    },
    {
      category: "baraat_band_ghodi",
      functionKeys: ["wedding"],
      budgetEntryRefs: ["wedding:baraat_band_ghodi"],
    },
    {
      category: "pandit",
      functionKeys: ["haldi", "wedding"],
      budgetEntryRefs: ["haldi:pandit_puja", "wedding:pandit_puja"],
    },
    {
      category: "invitations_printer",
      functionKeys: [],
      budgetEntryRefs: ["event:invitations"],
    },
  ],
  suggestions: [
    {
      title: "Rajasthani folk musicians at the sangeet dinner",
      body: "A Manganiyar group playing through dinner, before the DJ takes over.",
      functionKey: "sangeet",
      costCategory: null,
      quantity: null,
    },
    {
      title: "Marigold canopy for the haldi",
      body: "Strings of marigold over the home courtyard, in the Theme's colours.",
      functionKey: "haldi",
      costCategory: "decor_small",
      quantity: 1,
    },
    {
      title: "Sanganeri block-printed tote bags as favours",
      body: "Printed by a Sanganer workshop, one for each family.",
      functionKey: null,
      costCategory: null,
      quantity: null,
    },
    {
      title: "A safa-tying corner for the baraat",
      body: "Someone ties safas for the groom's side as they assemble.",
      functionKey: "wedding",
      costCategory: null,
      quantity: null,
    },
    {
      title: "Kulhad chai and kachori counter at the mehendi",
      body: "A street-food counter while the bride's mehendi dries.",
      functionKey: "mehendi",
      costCategory: null,
      quantity: null,
    },
    {
      title: "Hold the haldi and sangeet at one Venue",
      body: "Both fall on 14 February; one Venue for the day saves a booking.",
      functionKey: null,
      costCategory: null,
      quantity: null,
    },
    {
      title: "Ask the family pandit for February muhurat dates",
      body: "Before booking Venues, so the wedding day fits the muhurat.",
      functionKey: "wedding",
      costCategory: null,
      quantity: null,
    },
  ],
  assumptions: [
    {
      field: "runSheets",
      value: "Run sheet times are typical for each Function",
      reason: "Move them to the muhurat and the Venues' timings",
    },
  ],
};

/** Suggestions a Member already acted on: two added to the plan, one dismissed. */
export const SUGGESTIONS_ADDED = [
  { title: "A safa-tying corner for the baraat", by: "meera" },
  { title: "Ask the family pandit for February muhurat dates", by: "meera" },
] as const satisfies readonly { title: string; by: PersonaKey }[];
export const SUGGESTIONS_DISMISSED = [
  { title: "Sanganeri block-printed tote bags as favours", by: "rohan" },
] as const satisfies readonly { title: string; by: PersonaKey }[];

// ---------------------------------------------------------------------------
// Inspirations: stock library photos (seed/vibe-sets.json), with their credits

/** The three photos Meera tapped in the vibe pick, which gave the Theme its colours. */
export const VIBE_PICK_PHOTOS = [33417236, 38721726, 33331285] as const;
/** Two haldi photos Rohan added from the library. */
export const HALDI_PHOTOS = [31002035, 19569602] as const;

// ---------------------------------------------------------------------------
// Later edits, each one a history group

/**
 * "Utsavvy for Meera: Plan the sangeet (8 changes)": Meera asked the
 * Assistant to plan the sangeet, and it reworked the run sheet and added one
 * deadline. Updates name the run sheet row by its drafted time.
 */
export const PLAN_THE_SANGEET = {
  label: "Plan the sangeet",
  request:
    "Plan the sangeet properly: family performances from both sides, our couple dance, and a send-off before the buses leave.",
  reply:
    "I reworked the sangeet's run sheet: a welcome counter at 19:15, the bride's side then the groom's side performing, your couple dance at 20:15, the Rajasthani folk group through dinner, and a last song before the buses leave. I also added a deadline to book a choreographer for the family performances.",
  updates: [
    {
      time: "19:30",
      title: "Family performances, bride's side then groom's side",
    },
    { time: "20:30", title: "Dinner, with the folk group playing" },
    { time: "21:30", title: "DJ and open dance floor" },
    { time: "23:30", title: "Close; buses back to the hotel" },
  ],
  creates: [
    { time: "19:15", title: "Welcome drinks at the kulhad chai counter" },
    { time: "20:15", title: "Meera and Rohan's couple dance" },
    { time: "23:15", title: "Last song and send-off" },
  ],
  deadline: {
    title: "Book a choreographer for the family performances",
    vendorCategory: null,
    /** Days from the reset's day; P2, like the other late bookings. */
    inDays: 14,
    priority: "P2",
  },
} as const;

/** The accepted Proposal ("Utsavvy for Rohan, accepted by Meera"). */
export const SANGEET_GUESTS_PROPOSAL = {
  request: "The family confirmed 300 Guests for the sangeet, not 225.",
  reply:
    "That moves the sangeet to 300 Guests and its catering line to 300 plates. Here's the change for a Member to accept.",
  summary: "Sangeet Guests 225 → 300, and its catering line to 300 plates",
} as const;

/** Rohan's own message, sent with Don't reply on. */
export const ROHAN_CATERING_NOTE =
  "Spoke to the caterer: ₹2,45,000 for the sangeet dinner. I've set the line to that.";

/** A two-Comment thread on the sangeet catering line. */
export const CATERING_THREAD = [
  {
    by: "rohan",
    body: "Told the caterer ₹2,45,000 for 300 plates. Waiting for his WhatsApp.",
  },
  {
    by: "meera",
    body: "If his Quote comes in higher, let's take it from the Contingency, not the decor.",
  },
] as const satisfies readonly { by: PersonaKey; body: string }[];

/** Aditi's Note, from before she left the Event. */
export const ADITI_NOTE =
  "Mehendi playlist: ask Rohan's cousins which dhol tracks they want, and keep the last hour slow.";

// ---------------------------------------------------------------------------
// Vendors (S9): applied by `seedVendors` on top of the starter set

/**
 * The five Shortlisted Vendors (section 9.1): two Venues, a caterer for the
 * sangeet and the wedding, a decorator with one Quote and a photographer. They
 * are picked from the starter set by category in `seed/jaipur-vendors.json`'s
 * order, so no Vendor's name is repeated here. Each links to the checklist
 * Entry for its category; a Venue to the one for its Function.
 */
export const DEMO_SHORTLIST = [
  {
    category: "venue",
    nth: 0,
    functionKey: "wedding",
    status: "considering",
    by: "meera",
  },
  {
    category: "venue",
    nth: 1,
    functionKey: "sangeet",
    status: "contacted",
    by: "rohan",
  },
  {
    category: "caterer",
    nth: 0,
    functionKey: null,
    status: "contacted",
    by: "rohan",
  },
  {
    category: "decorator",
    nth: 0,
    functionKey: null,
    status: "quoted",
    by: "meera",
  },
  {
    category: "photographer",
    nth: 0,
    functionKey: null,
    status: "booked",
    by: "meera",
  },
] as const satisfies readonly {
  category: "venue" | "caterer" | "decorator" | "photographer";
  nth: number;
  functionKey: string | null;
  status: "considering" | "contacted" | "quoted" | "booked";
  by: PersonaKey;
}[];

/** The decorator's one Quote, typed in by Meera from the decorator's email. */
export const DECORATOR_QUOTE = {
  amount: 480_000,
  unit: "total",
  functionKeys: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
  note: "Marigold and pastel pink across all five Functions; fresh flowers at the market rate on the day.",
  by: "meera",
} as const satisfies {
  amount: number;
  unit: "total";
  functionKeys: readonly string[];
  note: string;
  by: PersonaKey;
};

/** Papa's Comment on the first Venue's card. */
export const PAPA_VENUE_COMMENT =
  "Is this hall big enough for our relatives from Kota?";
