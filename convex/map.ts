import { ConvexError, v } from "convex/values";
import type { ListedPriceLike } from "../components/vendors/comparable";
import {
  VENDOR_CATEGORIES,
  type LinkStatus,
  type VendorCategory,
} from "../components/vendors/cards";
import { can } from "../lib/access/permissions";
import type { MemberActor } from "../lib/types/actors";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { planItemOf } from "./entries";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { memberWrite } from "./lib/write";
import { MAX_PRICE_ROWS, vendorsIn } from "./vendors";

/*
 * S15: the Vendor map (docs/design/vendors.md, "Markers and the map";
 * IMPLEMENTATION_PLAN.md section 7.5). The map is Section UI and stores
 * nothing of its own: it draws the Event's Shortlisted Vendors, coloured by
 * status, and the other shared Vendors in the Event's city as faint Markers.
 *
 * A Marker belongs to the shared Vendor record (ADR 0008), so dragging one
 * into place moves it for every Event. The change is recorded in the history
 * of the Event it was moved from only (`memberWrite` records a shared row in
 * the acting membership's Event).
 */

const MAX_SHORTLISTED = 200;
const MAX_LINKS_PER_ITEM = 50;
const MAX_FUNCTIONS = 50;
const MAX_BUDGET_ROWS = 500;

/** The furthest-along status first: a Shortlisted Vendor takes its links' best. */
const STATUS_ORDER: readonly LinkStatus[] = [
  "booked",
  "quoted",
  "contacted",
  "considering",
  "dropped",
];

export type MapVendor = {
  _id: Id<"vendors">;
  name: string;
  category: VendorCategory;
  locality: string | null;
  areaServed: string | null;
  capacity: { min?: number; max: number } | null;
  /** null: no address, so the Vendor is listed beside the map. */
  marker: { lat: number; lng: number; approximate: boolean } | null;
  /** Current Listed prices, for the Function filter. */
  prices: ListedPriceLike[];
  /** This Event's Shortlisted Vendor, or null for a faint Marker. */
  shortlist: { itemId: Id<"items">; status: LinkStatus | null } | null;
};

export type MapBudgetLine = {
  functionKey: string | null;
  category: string | null;
  plannedAmount: number | null;
  estimate: { amount: number } | null;
};

export type MapView = {
  city: { name: string; centre: { lat: number; lng: number } | null } | null;
  /** May drag Markers (the roles.md row "drag Markers"). */
  canMove: boolean;
  functions: { key: string; name: string; guests: number | null }[];
  budgetLines: MapBudgetLine[];
  vendors: MapVendor[];
};

function notFound(what: string): never {
  throw new ConvexError({ kind: "NotFound", what });
}

function invalid(message: string): never {
  throw new ConvexError({ kind: "Invalid", message });
}

/** The same city test as `vendorsIn`: an address there, or no address and an area served naming it. */
function inCity(vendor: Doc<"vendors">, city: string): boolean {
  const word = city.trim().toLowerCase();
  if (word === "") return false;
  if (vendor.address) return vendor.address.city.trim().toLowerCase() === word;
  return (vendor.areaServed ?? "").toLowerCase().includes(word);
}

async function liveShortlistItems(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const items = await ctx.db
    .query("items")
    .withIndex("by_event_kind", (q) =>
      q.eq("eventId", eventId).eq("kind", "shortlistedVendor"),
    )
    .take(MAX_SHORTLISTED);
  return items.filter(
    (item): item is Extract<Doc<"items">, { kind: "shortlistedVendor" }> =>
      item.kind === "shortlistedVendor" && item.deletedAt === null,
  );
}

/** The best status among the Item's links to live checklist Entries. */
async function statusOf(
  ctx: QueryCtx,
  itemId: Id<"items">,
): Promise<LinkStatus | null> {
  const links = await ctx.db
    .query("vendorLinks")
    .withIndex("by_item", (q) => q.eq("shortlistItemId", itemId))
    .take(MAX_LINKS_PER_ITEM);
  const statuses = new Set<LinkStatus>();
  for (const link of links) {
    const entry = await ctx.db.get("entries", link.checklistEntryId);
    if (entry !== null && entry.deletedAt === null) statuses.add(link.status);
  }
  return STATUS_ORDER.find((status) => statuses.has(status)) ?? null;
}

async function pricesOf(
  ctx: QueryCtx,
  vendorId: Id<"vendors">,
): Promise<ListedPriceLike[]> {
  const rows = await ctx.db
    .query("listedPrices")
    .withIndex("by_vendor", (q) => q.eq("vendorId", vendorId))
    .order("desc")
    .take(MAX_PRICE_ROWS);
  return rows
    .filter((row) => row.supersededAt === null)
    .reverse()
    .map((row) => ({
      comparable: row.comparable,
      amount: row.amount,
      unit: row.unit,
      qualifier: row.qualifier,
      text: row.text,
    }));
}

async function budgetLinesOf(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<MapBudgetLine[]> {
  const budget = await planItemOf(ctx, eventId, "budget");
  if (budget === null) return [];
  const rows = await ctx.db
    .query("entries")
    .withIndex("by_item", (q) => q.eq("itemId", budget._id))
    .take(MAX_BUDGET_ROWS);
  return rows.flatMap((row) =>
    row.kind === "budget" &&
    row.deletedAt === null &&
    row.fields.role === "line"
      ? [
          {
            functionKey: row.functionKey,
            category: row.fields.category,
            plannedAmount: row.fields.plannedAmount,
            estimate: row.fields.estimate
              ? { amount: row.fields.estimate.amount }
              : null,
          },
        ]
      : [],
  );
}

/** Everything the map draws for one Event. */
export const view = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<MapView> => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "canvas.view",
    );
    const event = await ctx.db.get("events", args.eventId);
    if (event === null) notFound("event");

    const shortlisted = new Map<
      Id<"vendors">,
      { itemId: Id<"items">; status: LinkStatus | null }
    >();
    for (const item of await liveShortlistItems(ctx, args.eventId)) {
      if (shortlisted.has(item.data.vendorId)) continue;
      shortlisted.set(item.data.vendorId, {
        itemId: item._id,
        status: await statusOf(ctx, item._id),
      });
    }

    const docs = new Map<Id<"vendors">, Doc<"vendors">>();
    if (event.city !== null)
      for (const category of VENDOR_CATEGORIES)
        for (const vendor of await vendorsIn(ctx, event.city.name, category))
          docs.set(vendor._id, vendor);
    for (const vendorId of shortlisted.keys()) {
      if (docs.has(vendorId)) continue;
      const vendor = await ctx.db.get("vendors", vendorId);
      if (vendor !== null) docs.set(vendorId, vendor);
    }

    const vendors: MapVendor[] = [];
    for (const vendor of docs.values()) {
      vendors.push({
        _id: vendor._id,
        name: vendor.name,
        category: vendor.category,
        locality: vendor.address?.locality ?? null,
        areaServed: vendor.areaServed ?? null,
        capacity: vendor.capacity ?? null,
        marker: vendor.marker
          ? {
              lat: vendor.marker.lat,
              lng: vendor.marker.lng,
              approximate: vendor.marker.approximate,
            }
          : null,
        prices: await pricesOf(ctx, vendor._id),
        shortlist: shortlisted.get(vendor._id) ?? null,
      });
    }

    const functions = (
      await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(MAX_FUNCTIONS)
    )
      .sort((a, b) => a.order - b.order)
      .map((fn) => ({ key: fn.key, name: fn.name, guests: fn.guests }));

    return {
      city: event.city
        ? { name: event.city.name, centre: event.city.centre }
        : null,
      canMove: can(membership.role, "vendor.manage"),
      functions,
      budgetLines: await budgetLinesOf(ctx, args.eventId),
      vendors,
    };
  },
});

/**
 * Drags a Vendor's Marker into place (docs/design/vendors.md, "Approximate
 * Markers"): any Member may, for a Vendor in the Event's city or one the
 * Event shortlisted. One mutation moves the Marker on the shared record,
 * clears `approximate` and records the change in this Event's history only.
 */
export const moveMarker = mutation({
  args: {
    eventId: v.id("events"),
    vendorId: v.id("vendors"),
    lat: v.number(),
    lng: v.number(),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "vendor.manage",
    );
    const event = await ctx.db.get("events", args.eventId);
    if (event === null) notFound("event");
    const vendor = await ctx.db.get("vendors", args.vendorId);
    if (vendor === null) notFound("vendor");

    const nearby = event.city !== null && inCity(vendor, event.city.name);
    if (!nearby) {
      const items = await liveShortlistItems(ctx, args.eventId);
      if (!items.some((item) => item.data.vendorId === vendor._id))
        throw new AccessDenied("wrongEvent", "vendor.manage");
    }
    if (vendor.marker === undefined)
      invalid("This Vendor has no Marker to move.");
    if (
      !Number.isFinite(args.lat) ||
      !Number.isFinite(args.lng) ||
      Math.abs(args.lat) > 90 ||
      Math.abs(args.lng) > 180
    )
      invalid("That point isn't on the map.");

    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    return await memberWrite(ctx, {
      table: "vendors",
      id: vendor._id,
      patch: {
        marker: {
          lat: args.lat,
          lng: args.lng,
          // Placed by hand: a Member's own knowledge, not a geocode.
          confidence: 1,
          matchType: "member",
          approximate: false,
          provider: "member",
          attribution: "Placed by a Member",
        },
      },
      actor,
    });
  },
});
