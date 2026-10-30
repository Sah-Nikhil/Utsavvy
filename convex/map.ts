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
import starterSet from "../seed/jaipur-vendors.json";
import {
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { planItemOf } from "./entries";
import { requireAccess } from "./lib/access";
import { AccessDenied, VersionConflict } from "./lib/errors";
import { memberInsert, memberWrite } from "./lib/write";
import {
  loadPrivateVendorForEvent,
  privateVendorIdOf,
  sharedVendorIdOf,
} from "./lib/vendors";
import {
  loadStarterSetRows,
  MAX_PRICE_ROWS,
  shortlistIn,
  vendorsIn,
} from "./vendors";

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
 *
 * A hand-typed Vendor (X7) has a Marker only once a Member drops one
 * (issue #136). That Marker is private to the Event, like the Vendor, and is
 * held to the same area as a dragged shared Marker.
 */

const MAX_SHORTLISTED = 200;
const MAX_LINKS_PER_ITEM = 50;
const MAX_FUNCTIONS = 50;
const MAX_BUDGET_ROWS = 500;

/*
 * How far a Member may move a Marker (review of #123). The Marker is shared by
 * every Event, so a point far from the Vendor must never reach it:
 * - within MAX_MOVE_KM of the Marker it replaces: an approximate Marker is a
 *   city- or locality-level geocode, which can sit a suburb or two away from
 *   the Vendor, never further;
 * - and, for a Vendor in the Event's city, within MAX_FROM_CITY_KM of the
 *   city's centre, the same area the map is held to.
 * Only an approximate Marker moves, and a moved one is no longer approximate,
 * so moves can't chain a Marker away step by step.
 */
export const MAX_MOVE_KM = 15;
export const MAX_FROM_CITY_KM = 25;

/** The great-circle distance between two points, in kilometres. */
function kmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
  /** In the Event's city; false for a Vendor shortlisted from elsewhere, listed but not drawn. */
  inCity: boolean;
};

/** A hand-typed Vendor of this Event, with the Marker a Member dropped, if any. */
export type MapHandTypedVendor = {
  _id: Id<"privateVendors">;
  itemId: Id<"items">;
  name: string;
  /** A fixed category key, for the stamp's drawing; "" for a free label. */
  category: string;
  /** "Caterer", or the free label as typed. */
  categoryLabel: string;
  area: string | null;
  /** null until a Member drops one: the Vendor is listed beside the map. */
  marker: { lat: number; lng: number } | null;
  status: LinkStatus | null;
  /** The Functions its linked checklist Entries serve; null when one serves every Function. */
  functionKeys: string[] | null;
  /** For `placeHandTypedMarker`'s stale-write check. */
  version: number;
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
  handTyped: MapHandTypedVendor[];
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

/**
 * The Functions a Shortlisted Vendor's live checklist Entries serve, for the
 * map's Function filter; null when one of them serves every Function.
 */
async function functionKeysOf(
  ctx: QueryCtx,
  itemId: Id<"items">,
): Promise<string[] | null> {
  const links = await ctx.db
    .query("vendorLinks")
    .withIndex("by_item", (q) => q.eq("shortlistItemId", itemId))
    .take(MAX_LINKS_PER_ITEM);
  const keys: string[] = [];
  for (const link of links) {
    const entry = await ctx.db.get("entries", link.checklistEntryId);
    if (entry?.kind !== "checklist" || entry.deletedAt !== null) continue;
    if (entry.fields.functionKeys.length === 0) return null;
    for (const key of entry.fields.functionKeys)
      if (!keys.includes(key)) keys.push(key);
  }
  return keys;
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
    const handTyped: MapHandTypedVendor[] = [];
    for (const item of await liveShortlistItems(ctx, args.eventId)) {
      const vendorId = sharedVendorIdOf(item);
      if (vendorId === null) {
        // This Event's own hand-typed Vendor only, never another Event's.
        const row = await loadPrivateVendorForEvent(
          ctx,
          args.eventId,
          privateVendorIdOf(item),
        );
        if (row !== null)
          handTyped.push({
            _id: row._id,
            itemId: item._id,
            name: row.name,
            category: row.freeLabel ? "" : (row.vendorCategory ?? ""),
            categoryLabel: handTypedLabel(row),
            area: row.area,
            marker: row.marker,
            status: await statusOf(ctx, item._id),
            functionKeys: await functionKeysOf(ctx, item._id),
            version: row.version,
          });
        continue;
      }
      if (shortlisted.has(vendorId)) continue;
      shortlisted.set(vendorId, {
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
        inCity: event.city !== null && inCity(vendor, event.city.name),
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
      handTyped,
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
      if (!items.some((item) => sharedVendorIdOf(item) === vendor._id))
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
    if (!vendor.marker.approximate)
      invalid(
        "This Marker is already in place; only an approximate one moves.",
      );
    const to = { lat: args.lat, lng: args.lng };
    if (kmBetween(vendor.marker, to) > MAX_MOVE_KM)
      invalid(
        `A Marker moves at most ${MAX_MOVE_KM} km from where it was; that point is too far from this Vendor.`,
      );
    if (
      nearby &&
      event.city!.centre !== null &&
      kmBetween(event.city!.centre, to) > MAX_FROM_CITY_KM
    )
      invalid(`That point is outside ${event.city!.name}.`);

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

function handTypedLabel(row: Doc<"privateVendors">): string {
  if (row.freeLabel) return row.freeLabel;
  const category = row.vendorCategory;
  if (category && (VENDOR_CATEGORIES as readonly string[]).includes(category))
    return category[0]!.toUpperCase() + category.slice(1);
  return category ?? "Vendor";
}

/**
 * Drops or moves a hand-typed Vendor's Marker (issue #136): a Member's own
 * knowledge of where the family's Vendor is, since a hand-typed Vendor is
 * never geocoded. Only this Event's Members, for this Event's own hand-typed
 * Vendor. The point must lie within MAX_FROM_CITY_KM of the Event's city, and
 * a Marker already placed moves at most MAX_MOVE_KM, as a dragged shared
 * Marker does. `expectedVersion` is the version the map showed; a newer edit
 * refuses this one with `VersionConflict`.
 */
export const placeHandTypedMarker = mutation({
  args: {
    eventId: v.id("events"),
    privateVendorId: v.id("privateVendors"),
    expectedVersion: v.number(),
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
    const row = await loadPrivateVendorForEvent(
      ctx,
      args.eventId,
      args.privateVendorId,
    );
    if (row === null) throw new AccessDenied("wrongEvent", "vendor.manage");
    const event = await ctx.db.get("events", args.eventId);
    if (event === null) notFound("event");
    if (
      !Number.isFinite(args.lat) ||
      !Number.isFinite(args.lng) ||
      Math.abs(args.lat) > 90 ||
      Math.abs(args.lng) > 180
    )
      invalid("That point isn't on the map.");
    const to = { lat: args.lat, lng: args.lng };
    if (event.city === null || event.city.centre === null)
      invalid("Set the Event's city before dropping a Marker.");
    if (kmBetween(event.city.centre, to) > MAX_FROM_CITY_KM)
      invalid(`That point is outside ${event.city.name}.`);
    if (row.marker !== null && kmBetween(row.marker, to) > MAX_MOVE_KM)
      invalid(
        `A Marker moves at most ${MAX_MOVE_KM} km from where it was; that point is too far from this Vendor.`,
      );
    if (row.version !== args.expectedVersion)
      throw new VersionConflict({
        table: "privateVendors",
        id: row._id,
        expectedVersion: args.expectedVersion,
        currentVersion: row.version,
        current: { marker: row.marker, version: row.version },
      });
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    return await memberWrite(ctx, {
      table: "privateVendors",
      id: row._id,
      patch: { marker: to },
      actor,
    });
  },
});

// ---------------------------------------------------------------------------
// Browser check

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

/** The Shortlisted Vendors the browser check puts on the map, with their statuses. */
const CHECK_SHORTLIST: { domain: string; status: LinkStatus }[] = [
  { domain: "roodmahal.com", status: "quoted" },
  { domain: "umaidhaveli.com", status: "considering" },
  { domain: "mlcaterers.com", status: "booked" },
  { domain: "weddingvelvet.com", status: "contacted" },
];

/**
 * Puts an Event made by `canvas:seedLocalCheck` (and filled by
 * `entries:seedPlanForLocalCheck`) in Jaipur with a 300-Guest sangeet, loads
 * the starter set, puts its starter Markers back where the seed has them and
 * shortlists four Vendors with different statuses. For e2e/map.spec.ts
 * against `bun run dev`; refuses anything but a local deployment.
 */
export const seedForLocalCheck = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    refuseOutsideLocal();
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).find((m) => m.role === "owner");
    if (!owner) throw new Error("That Event has no Owner");
    const actor: MemberActor = { kind: "member", membershipId: owner._id };

    await loadStarterSetRows(ctx);
    // An earlier run may have dragged a Marker into place: start from the seed.
    for (const seed of starterSet) {
      const vendor = await ctx.db
        .query("vendors")
        .withIndex("by_domain", (q) => q.eq("domain", seed.domain))
        .first();
      if (vendor !== null && "marker" in seed && seed.marker)
        await ctx.db.patch("vendors", vendor._id, { marker: seed.marker });
    }

    await ctx.db.patch("events", eventId, {
      city: {
        name: "Jaipur",
        tier: "Y",
        centre: { lat: 26.9124, lng: 75.7873 },
      },
    });
    const functions = await ctx.db
      .query("eventFunctions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_FUNCTIONS);
    const sangeet = functions.find((fn) => fn.key === "sangeet");
    if (sangeet)
      await ctx.db.patch("eventFunctions", sangeet._id, { guests: 300 });

    for (const { domain, status } of CHECK_SHORTLIST) {
      const vendor = await ctx.db
        .query("vendors")
        .withIndex("by_domain", (q) => q.eq("domain", domain))
        .first();
      if (vendor === null) throw new Error(`No starter Vendor ${domain}`);
      const { linkId } = await shortlistIn(ctx, {
        eventId,
        vendorId: vendor._id,
        checklistEntryId: null,
        functionKey: "sangeet",
        actor,
        insert: async (table, value) =>
          (await memberInsert(ctx, { table, value, actor })).id,
      });
      await ctx.db.patch("vendorLinks", linkId, { status });
    }
    return null;
  },
});
