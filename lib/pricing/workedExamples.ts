import type { CityTier, DraftBudgetLine, EventType } from "../types";
import type { PlanLines } from "./pricePlan";

/**
 * The budget lines of the three first-brief.md worked examples, as the first
 * plan names them (docs/design/first-brief.md "Worked examples",
 * IMPLEMENTATION_PLAN.md section 8). Tests price them on the reference-table
 * path; the scripted cases research them live.
 */
export type WorkedExample = {
  eventType: EventType;
  city: string;
  tier: CityTier;
  budget: number;
  households: number | null;
  plan: PlanLines & { functions: { key: string; guests: number }[] };
};

function l(category: string, quantity: number, unit: string): DraftBudgetLine {
  return { category, quantity, unit };
}

/** 1. Jaipur wedding, North Indian Hindu, five Functions, ₹25L. */
export const jaipurWedding: WorkedExample = {
  eventType: "wedding",
  city: "Jaipur",
  tier: "Y",
  budget: 2500000,
  households: null,
  plan: {
    functions: [
      {
        key: "haldi",
        guests: 60,
        budgetEntries: [
          l("catering_light", 60, "per_plate"),
          l("venue_small", 1, "per_function"),
          l("decor_small", 1, "per_function"),
          l("pandit_puja", 1, "per_function"),
        ],
      },
      {
        key: "mehendi",
        guests: 120,
        budgetEntries: [
          l("catering_standard", 120, "per_plate"),
          l("venue_small", 1, "per_function"),
          l("decor_small", 1, "per_function"),
          l("mehendi_artists", 1, "per_function"),
          l("dhol", 1, "per_function"),
        ],
      },
      {
        key: "sangeet",
        guests: 225,
        budgetEntries: [
          l("catering_main", 225, "per_plate"),
          l("venue_large", 1, "per_function"),
          l("decor_medium", 1, "per_function"),
          l("dj_sound", 1, "per_function"),
        ],
      },
      {
        key: "wedding",
        guests: 300,
        budgetEntries: [
          l("catering_main", 300, "per_plate"),
          l("venue_large", 1, "per_function"),
          l("decor_main", 1, "per_function"),
          l("baraat_band_ghodi", 1, "per_function"),
          l("pandit_puja", 1, "per_function"),
        ],
      },
      {
        key: "reception",
        guests: 300,
        budgetEntries: [
          l("catering_main", 300, "per_plate"),
          l("venue_large", 1, "per_function"),
          l("decor_main", 1, "per_function"),
          l("dj_sound", 1, "per_function"),
        ],
      },
    ],
    eventWide: [
      // Photographer for 4 days, 150 invitation cards (Assumptions).
      l("photography_video", 4, "per_day"),
      l("makeup", 1, "per_event"),
      l("outfits", 1, "per_event"),
      l("invitations", 150, "per_card"),
      l("transport_misc", 1, "per_event"),
    ],
  },
};

/** 2. Aarav's 6th birthday in Jaipur, 60 Guests, ₹1.5L. */
export const aaravBirthday: WorkedExample = {
  eventType: "birthday",
  city: "Jaipur",
  tier: "Y",
  budget: 150000,
  households: null,
  plan: {
    functions: [
      {
        key: "party",
        guests: 60,
        budgetEntries: [
          l("party_catering", 60, "per_plate"),
          l("party_hall", 1, "per_function"),
          l("party_decor", 1, "per_function"),
          // 3 kg cake; 35 children get return gifts (Assumptions).
          l("cake", 3, "per_kg"),
          l("entertainer", 1, "per_function"),
          l("return_gifts", 35, "per_child"),
          l("party_photography", 1, "per_function"),
        ],
      },
    ],
    eventWide: [],
  },
};

/** 3. Pune society Ganesh utsav, 240 households, ₹2.4L. */
export const puneGaneshUtsav: WorkedExample = {
  eventType: "community",
  city: "Pune",
  tier: "X",
  budget: 240000,
  households: 240,
  plan: {
    functions: [
      {
        key: "sthapana",
        guests: 150,
        budgetEntries: [
          l("community_pandit_puja", 1, "per_function"),
          l("prasad", 150, "per_guest_day"),
        ],
      },
      {
        // 4 to 13 Sep 2027: 10 days, 100 Guests a day.
        key: "daily_aarti",
        guests: 100,
        budgetEntries: [
          l("aarti_flowers", 10, "per_day"),
          l("prasad_daily_aarti", 1000, "per_guest_day"),
        ],
      },
      {
        key: "cultural_night",
        guests: 400,
        budgetEntries: [
          l("cultural_stage_lighting", 1, "per_function"),
          l("performers_anchor", 1, "per_function"),
          l("cultural_snacks", 400, "per_guest"),
        ],
      },
      {
        key: "visarjan",
        guests: 300,
        budgetEntries: [
          l("dhol_tasha_pathak", 1, "per_function"),
          l("visarjan_vehicle", 1, "per_function"),
          l("prasad", 300, "per_guest_day"),
        ],
      },
    ],
    eventWide: [
      l("idol", 1, "per_event"),
      l("pandal_decor", 1, "per_event"),
      l("sound_system", 1, "per_event"),
      l("permissions", 1, "per_event"),
    ],
  },
};
