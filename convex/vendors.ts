import { ConvexError, v, type Infer } from "convex/values";
import { checklistStatus } from "../components/items/checklist/status";
import {
  CATEGORY_LABELS,
  estimateLineFor,
  isVendorCategory,
  type VendorCategory,
} from "../components/vendors/cards";
import {
  comparableForFunction,
  type ComparablePrice,
} from "../components/vendors/comparable";
import { can } from "../lib/access/permissions";
import type { LineEstimate } from "../lib/pricing/pricePlan";
import type { Actor, MemberActor } from "../lib/types/actors";
import type { HistoryTable } from "../lib/types/history";
import starterSet from "../seed/jaipur-vendors.json";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { placeNewItem } from "./canvas";
import { nextOrder, planItemOf } from "./entries";
import { cachedOrTableEstimate } from "./estimates";
import { requireAccess } from "./lib/access";
import {
  memberInsert,
  memberWrite,
  type InsertValue,
  type Patch,
} from "./lib/write";

/*
 * S9: Vendors (docs/design/vendors.md, ADR 0008). A Vendor is one shared,
 * app-wide record with its Listed prices; in v1 the only Vendors are the
 * hand-checked Jaipur starter set (IMPLEMENTATION_PLAN.md section 2). What an
 * Event adds on top (its Shortlisted Vendors, their checklist links with
 * statuses, and Quotes) is that Event's private layer: every query here reads
 * it for one Event only, behind `requireAccess`.
 *
 * Members write through `memberInsert` and `memberWrite`; the Assistant's
 * tools (`convex/assistant/tools/vendors.ts`) reuse `shortlistIn` and
 * `markBooked` with `assistantInsert` and `assistantWrite`, so every change is
 * versioned, lands in the history and runs the post-write hooks.
 */

type Ctx = QueryCtx | MutationCtx;

/** The most Vendors one category in one city can have (the starter set has 6 at most). */
const MAX_VENDORS = 200;
/** Current Listed prices one card shows at most. */
const MAX_PRICES_PER_VENDOR = 50;
/** Listed price rows (history included) read for one Vendor at most. */
const MAX_PRICE_ROWS = 2000;
const MAX_SHORTLISTED = 200;
const MAX_LINKS_PER_ITEM = 50;
const MAX_ENTRY_ROWS = 2000;

/** A Shortlisted Vendor's place on the Canvas. */
export const SHORTLISTED_CARD_SIZE = { w: 320, h: 440 };

export const linkStatusValidator = v.union(
  v.literal("considering"),
  v.literal("contacted"),
  v.literal("quoted"),
  v.literal("booked"),
  v.literal("dropped"),
);
export type LinkStatus = Infer<typeof linkStatusValidator>;

function notFound(what: string): never {
  throw new ConvexError({ kind: "NotFound", what });
}

function invalid(message: string): never {
  throw new ConvexError({ kind: "Invalid", message });
}

// ---------------------------------------------------------------------------
// The starter set

type StarterVendor = Omit<
  Doc<"vendors">,
  "_id" | "_creationTime" | "version"
> & {
  listedPrices: Omit<
    Doc<"listedPrices">,
    "_id" | "_creationTime" | "vendorId" | "supersededAt"
  >[];
};

/** A Listed price's identity across reloads: the page it was read on and its exact sentence. */
const priceKey = (price: { sourceUrl: string; sentence: string }) =>
  `${price.sourceUrl}
${price.sentence}`;

/**
 * Makes sure every starter Vendor exists (IMPLEMENTATION_PLAN.md section 9.2):
 * inserts a missing one, by domain, with its Listed prices, and never rewrites
 * an existing row, so a Marker a Member moved from any Event stays moved. For
 * an existing Vendor it adds any seed Listed price it lacks (matched by page
 * and sentence, superseded rows included, so a refreshed price never comes
 * back as current). A plain function, so the demo reset can call it inside
 * its own mutation.
 */
export async function loadStarterSetRows(
  ctx: MutationCtx,
): Promise<{ inserted: number; existing: number; pricesAdded: number }> {
  let inserted = 0;
  let existing = 0;
  let pricesAdded = 0;
  for (const entry of starterSet as unknown as StarterVendor[]) {
    const { listedPrices, ...vendor } = entry;
    const found = await ctx.db
      .query("vendors")
      .withIndex("by_domain", (q) => q.eq("domain", entry.domain))
      .first();
    if (found === null) {
      const vendorId = await ctx.db.insert("vendors", {
        ...vendor,
        version: 1,
      });
      for (const price of listedPrices)
        await ctx.db.insert("listedPrices", {
          ...price,
          vendorId,
          supersededAt: null,
        });
      inserted += 1;
      continue;
    }
    existing += 1;
    const have = new Set<string>();
    await eachPriceRow(ctx, found._id, "asc", (row) => {
      have.add(priceKey(row));
      return true;
    });
    for (const price of listedPrices) {
      if (have.has(priceKey(price))) continue;
      await ctx.db.insert("listedPrices", {
        ...price,
        vendorId: found._id,
        supersededAt: null,
      });
      pricesAdded += 1;
    }
  }
  return { inserted, existing, pricesAdded };
}

/** `bunx convex run vendors:loadStarterSet` loads the starter set once; the demo reset calls it too. */
export const loadStarterSet = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    existing: v.number(),
    pricesAdded: v.number(),
  }),
  handler: async (ctx) => await loadStarterSetRows(ctx),
});

// ---------------------------------------------------------------------------
// Reading shared Vendors

/**
 * Visits a Vendor's Listed price rows, history included, streaming them in
 * index order until `visit` returns false or MAX_PRICE_ROWS rows have been
 * read, so no fixed page size can hide a row however long the history grows.
 */
async function eachPriceRow(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  order: "asc" | "desc",
  visit: (row: Doc<"listedPrices">) => boolean,
): Promise<void> {
  let read = 0;
  for await (const row of ctx.db
    .query("listedPrices")
    .withIndex("by_vendor", (q) => q.eq("vendorId", vendorId))
    .order(order)) {
    if (!visit(row) || ++read >= MAX_PRICE_ROWS) return;
  }
}

/**
 * The current Listed prices of a Vendor, oldest first (a refresh adds rows;
 * superseded ones are history). Read newest first, so a long history of
 * superseded rows never hides the current ones.
 */
async function currentPrices(
  ctx: Ctx,
  vendorId: Id<"vendors">,
): Promise<Doc<"listedPrices">[]> {
  const current: Doc<"listedPrices">[] = [];
  await eachPriceRow(ctx, vendorId, "desc", (row) => {
    if (row.supersededAt === null) current.push(row);
    return current.length < MAX_PRICES_PER_VENDOR;
  });
  return current.reverse();
}

/**
 * The shared Vendors of a category in a city: those with an address there,
 * and those with no address whose area served names the city (a caterer that
 * serves "Jaipur and Patna"). In v1 only Jaipur has any.
 */
export async function vendorsIn(
  ctx: Ctx,
  city: string,
  category: VendorCategory,
): Promise<Doc<"vendors">[]> {
  const located = await ctx.db
    .query("vendors")
    .withIndex("by_city_category", (q) =>
      q.eq("address.city", city).eq("category", category),
    )
    .take(MAX_VENDORS);
  const cityWord = city.trim().toLowerCase();
  const serving = (
    await ctx.db
      .query("vendors")
      .withIndex("by_city_category", (q) =>
        q.eq("address.city", undefined).eq("category", category),
      )
      .take(MAX_VENDORS)
  ).filter(
    (vendor) =>
      cityWord !== "" &&
      (vendor.areaServed ?? "").toLowerCase().includes(cityWord),
  );
  return [...located, ...serving].sort(
    (a, b) => a._creationTime - b._creationTime,
  );
}

export type ListedPriceView = {
  _id: Id<"listedPrices">;
  sourceUrl: string;
  sentence: string;
  seenAt: string;
  text: string;
  /** Per the price's own unit; null when the site gives no clear amount. */
  amount: { min: number; max: number } | null;
  unit: Doc<"listedPrices">["unit"] | null;
  qualifier: Doc<"listedPrices">["qualifier"] | null;
  diet: Doc<"listedPrices">["diet"] | null;
  inclusionsNote: string | null;
  /** Worked out for the Function's Guests; null when not comparable. */
  comparable: ComparablePrice | null;
};

/** What every Vendor card shows of the shared record, for one Function. */
export type VendorView = {
  vendor: Doc<"vendors">;
  listedPrices: ListedPriceView[];
  /** Shown only when no Listed price is comparable (vendors.md, "Estimates on Vendor cards"). */
  estimate: LineEstimate | null;
};

export type LinkView = {
  _id: Id<"vendorLinks">;
  version: number;
  status: LinkStatus;
  checklistEntryId: Id<"entries">;
  entryLabel: string;
  functionKeys: string[];
  /** The current (newest) Quote for this link, if any. */
  quote: Doc<"quotes"> | null;
};

/** One Event's own layer on a shared Vendor: its Shortlisted Vendor Item and links. */
export type EventLayer = { itemId: Id<"items">; links: LinkView[] } | null;

export type VendorCardView = VendorView & { eventLayer: EventLayer };

type Pricing = {
  city: string;
  tier: NonNullable<Doc<"events">["city"]>["tier"];
  functionKey: string | null;
  guests: number | null;
  /** Hour-rounded time for the Estimate cache, or null for the table only. */
  asOf: number | null;
};

async function vendorView(
  ctx: QueryCtx,
  vendor: Doc<"vendors">,
  pricing: Pricing | null,
): Promise<VendorView> {
  const prices = await currentPrices(ctx, vendor._id);
  const listedPrices: ListedPriceView[] = prices.map((price) => ({
    _id: price._id,
    sourceUrl: price.sourceUrl,
    sentence: price.sentence,
    seenAt: price.seenAt,
    text: price.text,
    amount: price.amount ?? null,
    unit: price.unit ?? null,
    qualifier: price.qualifier ?? null,
    diet: price.diet ?? null,
    inclusionsNote: price.inclusionsNote ?? null,
    comparable: comparableForFunction(price, pricing?.guests ?? null),
  }));
  let estimate: LineEstimate | null = null;
  if (pricing !== null && !listedPrices.some((p) => p.comparable !== null)) {
    const line = estimateLineFor(
      vendor.category,
      pricing.functionKey,
      pricing.guests,
    );
    estimate = await cachedOrTableEstimate(
      ctx,
      pricing.city,
      pricing.tier,
      line.category,
      line.unit,
      // With no time given, no cache row counts as fresh: the table prices it.
      pricing.asOf ?? Number.POSITIVE_INFINITY,
    );
  }
  return { vendor, listedPrices, estimate };
}

async function guestsOf(
  ctx: Ctx,
  eventId: Id<"events">,
  functionKey: string | null,
): Promise<number | null> {
  if (functionKey === null) return null;
  const functions = await ctx.db
    .query("eventFunctions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(50);
  return functions.find((fn) => fn.key === functionKey)?.guests ?? null;
}

async function pricingFor(
  ctx: Ctx,
  event: Doc<"events">,
  functionKey: string | null,
  asOf: number | null,
): Promise<Pricing | null> {
  if (event.city === null) return null;
  return {
    city: event.city.name,
    tier: event.city.tier,
    functionKey,
    guests: await guestsOf(ctx, event._id, functionKey),
    asOf,
  };
}

// ---------------------------------------------------------------------------
// Reading one Event's private layer

function entryLabel(entry: Doc<"entries">): string {
  if (entry.kind !== "checklist") return "Entry";
  const { freeLabel, vendorCategory } = entry.fields;
  if (freeLabel) return freeLabel;
  if (vendorCategory && isVendorCategory(vendorCategory))
    return CATEGORY_LABELS[vendorCategory];
  return vendorCategory ?? "Vendor";
}

async function linksOf(ctx: Ctx, itemId: Id<"items">): Promise<LinkView[]> {
  const links = await ctx.db
    .query("vendorLinks")
    .withIndex("by_item", (q) => q.eq("shortlistItemId", itemId))
    .take(MAX_LINKS_PER_ITEM);
  const views: LinkView[] = [];
  for (const link of links) {
    const entry = await ctx.db.get("entries", link.checklistEntryId);
    // A link to a deleted Entry is left out until Restore brings the Entry back.
    if (entry === null || entry.deletedAt !== null) continue;
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_link", (q) => q.eq("linkId", link._id))
      .order("desc")
      .first();
    views.push({
      _id: link._id,
      version: link.version,
      status: link.status,
      checklistEntryId: link.checklistEntryId,
      entryLabel: entryLabel(entry),
      functionKeys: entry.kind === "checklist" ? entry.fields.functionKeys : [],
      quote,
    });
  }
  return views;
}

async function shortlistItems(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<Extract<Doc<"items">, { kind: "shortlistedVendor" }>[]> {
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

/** The Event's live Shortlisted Vendor Item for a Vendor, if it has one. */
async function shortlistItemFor(
  ctx: Ctx,
  eventId: Id<"events">,
  vendorId: Id<"vendors">,
) {
  return (
    (await shortlistItems(ctx, eventId)).find(
      (item) => item.data.vendorId === vendorId,
    ) ?? null
  );
}

async function eventLayerOf(
  ctx: Ctx,
  eventId: Id<"events">,
  vendorId: Id<"vendors">,
): Promise<EventLayer> {
  const item = await shortlistItemFor(ctx, eventId, vendorId);
  if (item === null) return null;
  return { itemId: item._id, links: await linksOf(ctx, item._id) };
}

// ---------------------------------------------------------------------------
// Queries

export type FindFilters = {
  /** At least this many Guests (Venues); defaults to the Function's Guests. */
  minCapacity?: number | null;
  /** A comparable Listed price at most this much, per its own unit. */
  maxPrice?: number | null;
};

/**
 * The shared Vendors that match a category in the Event's city, filtered by
 * the Function's needs, each with this Event's own layer. Used by the
 * `findVendors` tool and by "Find Vendors" on a checklist Entry.
 */
export async function findKnownFor(
  ctx: QueryCtx,
  event: Doc<"events">,
  category: string,
  functionKey: string | null,
  filters: FindFilters,
  asOf: number | null,
): Promise<{
  city: string | null;
  guests: number | null;
  vendors: VendorCardView[];
}> {
  const pricing = await pricingFor(ctx, event, functionKey, asOf);
  if (pricing === null || !isVendorCategory(category))
    return { city: event.city?.name ?? null, guests: null, vendors: [] };
  const minCapacity =
    filters.minCapacity ?? (category === "venue" ? pricing.guests : null);
  const cards: VendorCardView[] = [];
  for (const vendor of await vendorsIn(ctx, pricing.city, category)) {
    if (
      minCapacity !== null &&
      vendor.capacity !== undefined &&
      vendor.capacity.max < minCapacity
    )
      continue;
    const view = await vendorView(ctx, vendor, pricing);
    const maxPrice = filters.maxPrice ?? null;
    // Per the price's own unit (₹600 a plate), not the Function's total. A
    // Vendor with no comparable Listed price can't show it's under the cap.
    if (
      maxPrice !== null &&
      !view.listedPrices.some(
        (p) =>
          p.comparable !== null &&
          p.amount !== null &&
          p.amount.min <= maxPrice,
      )
    )
      continue;
    cards.push({
      ...view,
      eventLayer: await eventLayerOf(ctx, event._id, vendor._id),
    });
  }
  return { city: pricing.city, guests: pricing.guests, vendors: cards };
}

async function loadEvent(ctx: Ctx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId);
  if (event === null) notFound("event");
  return event;
}

/**
 * "Find Vendors": the shared Vendors of a category in the Event's city,
 * filtered by the Function's Guests, each with this Event's own layer. Outside
 * Jaipur there are none in v1. `asOf` (hour-rounded) lets the card's Estimate
 * use the city's cached researched range; without it the table prices it.
 */
export const findKnown = query({
  args: {
    eventId: v.id("events"),
    category: v.string(),
    functionKey: v.union(v.string(), v.null()),
    asOf: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.eventId, "canvas.view");
    const event = await loadEvent(ctx, args.eventId);
    return await findKnownFor(
      ctx,
      event,
      args.category,
      args.functionKey,
      {},
      args.asOf ?? null,
    );
  },
});

/**
 * The Vendors on one Chat card, in the card's order, with this Event's own
 * layer, and whether this person may shortlist them.
 */
export const cards = query({
  args: {
    eventId: v.id("events"),
    vendorIds: v.array(v.id("vendors")),
    functionKey: v.union(v.string(), v.null()),
    asOf: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "canvas.view",
    );
    const event = await loadEvent(ctx, args.eventId);
    const pricing = await pricingFor(
      ctx,
      event,
      args.functionKey,
      args.asOf ?? null,
    );
    const vendors: VendorCardView[] = [];
    for (const vendorId of args.vendorIds.slice(0, 12)) {
      const vendor = await ctx.db.get("vendors", vendorId);
      if (vendor === null) continue;
      vendors.push({
        ...(await vendorView(ctx, vendor, pricing)),
        eventLayer: await eventLayerOf(ctx, args.eventId, vendorId),
      });
    }
    return {
      city: event.city?.name ?? null,
      guests: pricing?.guests ?? null,
      canManage: can(membership.role, "vendor.manage"),
      vendors,
    };
  },
});

/** One Shortlisted Vendor with its card and this Event's links. */
export type ShortlistedView = {
  itemId: Id<"items">;
  card: VendorView;
  links: LinkView[];
};

async function shortlistedView(
  ctx: QueryCtx,
  event: Doc<"events">,
  item: Extract<Doc<"items">, { kind: "shortlistedVendor" }>,
  asOf: number | null,
): Promise<ShortlistedView | null> {
  const vendor = await ctx.db.get("vendors", item.data.vendorId);
  if (vendor === null) return null;
  const links = await linksOf(ctx, item._id);
  // One Function linked: price the card for it; several or none: Event-wide.
  const keys = [...new Set(links.flatMap((l) => l.functionKeys))];
  const pricing = await pricingFor(
    ctx,
    event,
    keys.length === 1 ? keys[0]! : null,
    asOf,
  );
  return {
    itemId: item._id,
    card: await vendorView(ctx, vendor, pricing),
    links,
  };
}

/** The Event's Shortlisted Vendors, each with its card and its own links, statuses and Quotes. */
export const forEvent = query({
  args: { eventId: v.id("events"), asOf: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ShortlistedView[]> => {
    await requireAccess(ctx, args.eventId, "canvas.view");
    const event = await loadEvent(ctx, args.eventId);
    const views: ShortlistedView[] = [];
    for (const item of await shortlistItems(ctx, args.eventId)) {
      const view = await shortlistedView(ctx, event, item, args.asOf ?? null);
      if (view !== null) views.push(view);
    }
    return views;
  },
});

/**
 * One Shortlisted Vendor Item, for its card on the Canvas: the card, its
 * links, the checklist Entries it could link to and whether this person may
 * change them.
 */
export const forItem = query({
  args: { itemId: v.id("items"), asOf: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const item = await ctx.db.get("items", args.itemId);
    if (item === null || item.kind !== "shortlistedVendor") notFound("item");
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.view",
    );
    const event = await loadEvent(ctx, item.eventId);
    const view = await shortlistedView(ctx, event, item, args.asOf ?? null);
    const checklist = await planItemOf(ctx, item.eventId, "checklist");
    const linked = new Set(view?.links.map((l) => l.checklistEntryId));
    const linkable =
      checklist === null
        ? []
        : (await liveChecklistEntries(ctx, checklist._id))
            .filter((entry) => !linked.has(entry._id))
            .map((entry) => ({ _id: entry._id, label: entryLabel(entry) }));
    return {
      view,
      linkable,
      city: event.city?.name ?? null,
      canManage: can(membership.role, "vendor.manage"),
    };
  },
});

// ---------------------------------------------------------------------------
// Shortlisting and statuses (shared with the Assistant's tools)

async function liveChecklistEntries(
  ctx: Ctx,
  checklistItemId: Id<"items">,
): Promise<Extract<Doc<"entries">, { kind: "checklist" }>[]> {
  const rows = await ctx.db
    .query("entries")
    .withIndex("by_item", (q) => q.eq("itemId", checklistItemId))
    .take(MAX_ENTRY_ROWS);
  return rows
    .filter(
      (row): row is Extract<Doc<"entries">, { kind: "checklist" }> =>
        row.kind === "checklist" && row.deletedAt === null,
    )
    .sort((a, b) => a.order - b.order);
}

/** Inserts one row as whoever is acting: `memberInsert` or `assistantInsert`. */
export type Insert = <T extends HistoryTable>(
  table: T,
  value: InsertValue<T>,
) => Promise<Id<T>>;

/**
 * Shortlists a shared Vendor in an Event (vendors.md, "Shortlisted Vendors and
 * the Vendor checklist"): one Shortlisted Vendor Item per Event in its Vendors
 * Section, however many Entries it serves, linked to `checklistEntryId` with
 * the status Considering. With no Entry given it links to the checklist Entry
 * for the Vendor's category (preferring one that serves `functionKey`), and
 * adds that Entry when the checklist has none. Shortlisting a pair that is
 * already linked changes nothing.
 */
export async function shortlistIn(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    vendorId: Id<"vendors">;
    checklistEntryId: Id<"entries"> | null;
    functionKey: string | null;
    actor: Actor;
    insert: Insert;
  },
): Promise<{ itemId: Id<"items">; linkId: Id<"vendorLinks"> }> {
  const vendor = await ctx.db.get("vendors", args.vendorId);
  if (vendor === null) notFound("vendor");

  let entryId: Id<"entries">;
  if (args.checklistEntryId !== null) {
    const entry = await ctx.db.get("entries", args.checklistEntryId);
    if (
      entry === null ||
      entry.eventId !== args.eventId ||
      entry.kind !== "checklist" ||
      entry.deletedAt !== null
    )
      notFound("checklistEntry");
    entryId = entry._id;
  } else {
    const checklist = await planItemOf(ctx, args.eventId, "checklist");
    if (checklist === null)
      invalid("This Event has no Vendor checklist to link the Vendor to.");
    const same = (await liveChecklistEntries(ctx, checklist._id)).filter(
      (entry) => entry.fields.vendorCategory === vendor.category,
    );
    const forFunction =
      args.functionKey === null
        ? undefined
        : same.find((e) => e.fields.functionKeys.includes(args.functionKey!));
    const existing = forFunction ?? same[0];
    entryId =
      existing?._id ??
      (await args.insert("entries", {
        eventId: args.eventId,
        itemId: checklist._id,
        kind: "checklist",
        order: await nextOrder(ctx, checklist._id),
        functionKey: null,
        fields: {
          vendorCategory: vendor.category,
          freeLabel: null,
          functionKeys: args.functionKey === null ? [] : [args.functionKey],
          bookByEntryId: null,
          budgetEntryIds: [],
        },
        assumed: [],
        createdBy: args.actor,
      }));
  }

  const item = await shortlistItemFor(ctx, args.eventId, args.vendorId);
  let itemId: Id<"items">;
  if (item !== null) {
    itemId = item._id;
    const links = await ctx.db
      .query("vendorLinks")
      .withIndex("by_item", (q) => q.eq("shortlistItemId", itemId))
      .take(MAX_LINKS_PER_ITEM);
    const linked = links.find((link) => link.checklistEntryId === entryId);
    if (linked) return { itemId, linkId: linked._id };
  } else {
    const { sectionId, position } = await placeNewItem(ctx, {
      eventId: args.eventId,
      kind: "shortlistedVendor",
      size: SHORTLISTED_CARD_SIZE,
    });
    itemId = await args.insert("items", {
      eventId: args.eventId,
      sectionId,
      kind: "shortlistedVendor",
      position,
      size: SHORTLISTED_CARD_SIZE,
      functionKey: null,
      data: { vendorId: args.vendorId },
      createdBy: args.actor,
    });
  }
  const linkId = await args.insert("vendorLinks", {
    eventId: args.eventId,
    shortlistItemId: itemId,
    checklistEntryId: entryId,
    status: "considering",
  });
  return { itemId, linkId };
}

/**
 * Booking one Vendor for an Entry marks that Entry done: its Timeline
 * deadline ("Book the caterer") is ticked. The checklist Entry's own status
 * (booked) is worked out from its links, never stored.
 */
export async function markBooked(
  ctx: MutationCtx,
  link: Doc<"vendorLinks">,
  write: (
    id: Id<"entries">,
    patch: Patch<"entries">,
    version: number,
  ) => Promise<unknown>,
): Promise<Id<"entries"> | null> {
  const entry = await ctx.db.get("entries", link.checklistEntryId);
  if (entry?.kind !== "checklist" || entry.fields.bookByEntryId === null)
    return null;
  const deadline = await ctx.db.get("entries", entry.fields.bookByEntryId);
  if (
    deadline === null ||
    deadline.kind !== "timeline" ||
    deadline.deletedAt !== null ||
    deadline.fields.done
  )
    return null;
  await write(
    deadline._id,
    { fields: { ...deadline.fields, done: true } } as Patch<"entries">,
    deadline.version,
  );
  return deadline._id;
}

/** The checklist status of one Entry, from its links. */
export async function entryStatus(ctx: Ctx, entryId: Id<"entries">) {
  const links = await ctx.db
    .query("vendorLinks")
    .withIndex("by_entry", (q) => q.eq("checklistEntryId", entryId))
    .take(MAX_LINKS_PER_ITEM);
  return checklistStatus(links.map((l) => l.status));
}

function memberInserter(ctx: MutationCtx, actor: MemberActor): Insert {
  return async (table, value) =>
    (await memberInsert(ctx, { table, value, actor })).id;
}

/** "Add to Canvas" on a Vendor card: shortlist it and link it to a checklist Entry. */
export const shortlist = mutation({
  args: {
    eventId: v.id("events"),
    vendorId: v.id("vendors"),
    /** null links to the checklist Entry for the Vendor's category, adding one if needed. */
    checklistEntryId: v.union(v.id("entries"), v.null()),
    /** The Function the card was found for, used when no Entry is given. */
    functionKey: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ itemId: v.id("items"), linkId: v.id("vendorLinks") }),
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "vendor.manage",
    );
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    return await shortlistIn(ctx, {
      eventId: args.eventId,
      vendorId: args.vendorId,
      checklistEntryId: args.checklistEntryId,
      functionKey: args.functionKey ?? null,
      actor,
      insert: memberInserter(ctx, actor),
    });
  },
});

/** Sets one link's status. Booked also ticks the Entry's Timeline deadline. */
export const setLinkStatus = mutation({
  args: { linkId: v.id("vendorLinks"), status: linkStatusValidator },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const link = await ctx.db.get("vendorLinks", args.linkId);
    if (link === null) notFound("link");
    const { membership } = await requireAccess(
      ctx,
      link.eventId,
      "vendor.manage",
    );
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    if (link.status === args.status) return { version: link.version };
    const { version } = await memberWrite(ctx, {
      table: "vendorLinks",
      id: link._id,
      patch: { status: args.status },
      actor,
    });
    if (args.status === "booked") {
      await markBooked(ctx, link, (id, patch) =>
        memberWrite(ctx, { table: "entries", id, patch, actor }),
      );
    }
    return { version };
  },
});

/** Links a Shortlisted Vendor to one more checklist Entry ("Link to an Entry" on its card). */
export const link = mutation({
  args: { itemId: v.id("items"), checklistEntryId: v.id("entries") },
  returns: v.object({ itemId: v.id("items"), linkId: v.id("vendorLinks") }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("items", args.itemId);
    if (
      item === null ||
      item.kind !== "shortlistedVendor" ||
      item.deletedAt !== null
    )
      notFound("item");
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "vendor.manage",
    );
    const actor: MemberActor = { kind: "member", membershipId: membership._id };
    return await shortlistIn(ctx, {
      eventId: item.eventId,
      vendorId: item.data.vendorId,
      checklistEntryId: args.checklistEntryId,
      functionKey: null,
      actor,
      insert: memberInserter(ctx, actor),
    });
  },
});
