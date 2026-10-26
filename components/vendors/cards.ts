/*
 * S9: what a Vendor card needs beyond its data (docs/design/vendors.md, "The
 * Vendor card"): the Chat card's `id`, the "Compare on WedMeGood" link, the
 * provenance line and which reference-table row prices the card's Estimate.
 * Pure, so Convex and the UI share it. Relative imports only, because Convex
 * bundles this file too.
 */

import type { Id } from "../../convex/_generated/dataModel";

export type VendorCategory = "venue" | "caterer" | "decorator" | "photographer";

export const VENDOR_CATEGORIES: readonly VendorCategory[] = [
  "venue",
  "caterer",
  "decorator",
  "photographer",
];

export function isVendorCategory(value: string): value is VendorCategory {
  return (VENDOR_CATEGORIES as readonly string[]).includes(value);
}

export const CATEGORY_LABELS: Record<VendorCategory, string> = {
  venue: "Venue",
  caterer: "Caterer",
  decorator: "Decorator",
  photographer: "Photographer",
};

export const CATEGORY_PLURALS: Record<VendorCategory, string> = {
  venue: "Venues",
  caterer: "caterers",
  decorator: "decorators",
  photographer: "photographers",
};

// ---------------------------------------------------------------------------
// The Chat card

/** The Vendor cards a reply shows: the Vendors in order, for one category and Function. */
export type VendorCards = {
  vendorIds: Id<"vendors">[];
  category: VendorCategory;
  /** The Function the cards were found for, such as "sangeet", or null. */
  functionKey: string | null;
};

export function vendorCardsId(card: VendorCards): string {
  return JSON.stringify(card);
}

/** Reads a Vendor cards card's `id`, or null when it isn't one. */
export function parseVendorCards(id: string | null): VendorCards | null {
  if (id === null) return null;
  try {
    const value = JSON.parse(id) as Partial<VendorCards>;
    if (
      !Array.isArray(value.vendorIds) ||
      !value.vendorIds.every((v) => typeof v === "string") ||
      typeof value.category !== "string" ||
      !isVendorCategory(value.category)
    )
      return null;
    return {
      vendorIds: value.vendorIds,
      category: value.category,
      functionKey:
        typeof value.functionKey === "string" ? value.functionKey : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Link-out and provenance

const WEDMEGOOD_CATEGORY: Record<VendorCategory, string> = {
  venue: "wedding-venues",
  caterer: "wedding-catering",
  decorator: "wedding-decorators",
  photographer: "wedding-photographers",
};

/**
 * WedMeGood's listing page for a city and category, never a deep link to one
 * listing (vendors.md, "Link-out"). We only link to it; nothing is read from it.
 */
export function wedMeGoodUrl(city: string, category: VendorCategory): string {
  const slug = city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.wedmegood.com/vendors/${slug}/${WEDMEGOOD_CATEGORY[category]}/`;
}

/** "https://www.example.in/menu" → "example.in". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** An ISO day as cards show it: "2026-10-21" → "21 Oct 2026". */
export function formatSeenDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return day;
  const [, year, month, date] = match;
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/** One stored fact's source, as `vendors.provenance` keeps it. */
export type Provenance = {
  field: string;
  kind: "ownSite" | "instagramProfileHumanChecked";
  url: string;
  sentence: string | null;
  seenAt: string;
  confirmedBy: "Sah-Nikhil" | null;
};

/**
 * A card section's provenance line: "from example.in · seen 21 Oct 2026", or
 * for an Instagram-only Vendor "from its Instagram profile · checked 22 Oct
 * 2026 by Sah-Nikhil".
 */
export function provenanceLine(source: Provenance): string {
  if (source.kind === "instagramProfileHumanChecked")
    return `from its Instagram profile · checked ${formatSeenDay(source.seenAt)} by ${source.confirmedBy ?? "hand"}`;
  return `from ${siteOf(source.url)} · seen ${formatSeenDay(source.seenAt)}`;
}

// ---------------------------------------------------------------------------
// The Estimate on a card with no comparable Listed price

/**
 * The reference-table row and unit that price a card's Estimate, chosen the
 * way the first plan prices the same Vendor's budget line
 * (`lib/brief/functions.ts`): light catering at a haldi, standard at a
 * mehendi, the main dinner otherwise; a small Venue or decor at 150 Guests
 * or fewer; the main stage decor at the wedding and reception.
 */
export function estimateLineFor(
  category: VendorCategory,
  functionKey: string | null,
  guests: number | null,
): { category: string; unit: string } {
  const small = guests !== null && guests <= 150;
  switch (category) {
    case "caterer":
      return {
        category:
          functionKey === "haldi"
            ? "catering_light"
            : functionKey === "mehendi"
              ? "catering_standard"
              : "catering_main",
        unit: "per_plate",
      };
    case "venue":
      return {
        category: small ? "venue_small" : "venue_large",
        unit: "per_function",
      };
    case "decorator":
      return {
        category:
          functionKey === "wedding" || functionKey === "reception"
            ? "decor_main"
            : small
              ? "decor_small"
              : "decor_medium",
        unit: "per_function",
      };
    case "photographer":
      return { category: "photography_video", unit: "per_day" };
  }
}
