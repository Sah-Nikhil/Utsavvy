import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type ShortlistedVendorItem = Extract<
  Doc<"items">,
  { kind: "shortlistedVendor" }
>;

/**
 * The shared Vendor a Shortlisted Vendor Item points at, or null for a
 * hand-typed Vendor private to the Event (X7). Readers that look up a shared
 * Vendor skip a null the same way they skip a missing Vendor.
 */
export function sharedVendorIdOf(
  item: Pick<ShortlistedVendorItem, "data">,
): Id<"vendors"> | null {
  return "vendorId" in item.data ? item.data.vendorId : null;
}

/**
 * A hand-typed Vendor, only when it belongs to `eventId`; null when it is
 * missing or belongs to another Event. Every reader of a `privateVendorId`
 * goes through this, so an Item that points at another Event's hand-typed
 * Vendor (a malformed write, a Restore) can never reveal it.
 */
export async function loadPrivateVendorForEvent(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">,
  id: Id<"privateVendors"> | null,
): Promise<Doc<"privateVendors"> | null> {
  if (id === null) return null;
  const row = await ctx.db.get("privateVendors", id);
  return row !== null && row.eventId === eventId ? row : null;
}

/**
 * Who a Shortlisted Vendor Item is, for Quotes and their comparison: a shared
 * Vendor (whose Listed prices may be compared), or this Event's own
 * hand-typed Vendor (no Listed prices). Null when it is neither: an Item of
 * another Event than `eventId` (the Event the caller authorized, such as a
 * link's), or an Item that points at another Event's hand-typed Vendor. The
 * name goes only to the Event's own Members and their Assistant run, never
 * to research.
 */
export async function shortlistedVendorOf(
  ctx: Pick<QueryCtx, "db">,
  item: Pick<ShortlistedVendorItem, "eventId" | "data">,
  eventId: Id<"events">,
): Promise<{
  name: string;
  /** A fixed category key, or the free label of a hand-typed Vendor. */
  category: string;
  /** The shared Vendor, whose Listed prices count; null for a hand-typed one. */
  sharedVendorId: Id<"vendors"> | null;
} | null> {
  if (item.eventId !== eventId) return null;
  const vendorId = sharedVendorIdOf(item);
  if (vendorId !== null) {
    const vendor = await ctx.db.get("vendors", vendorId);
    return vendor === null
      ? null
      : {
          name: vendor.name,
          category: vendor.category,
          sharedVendorId: vendorId,
        };
  }
  const typed = await loadPrivateVendorForEvent(
    ctx,
    item.eventId,
    privateVendorIdOf(item),
  );
  return typed === null
    ? null
    : {
        name: typed.name,
        category: typed.vendorCategory ?? typed.freeLabel ?? "",
        sharedVendorId: null,
      };
}

/** The hand-typed Vendor a Shortlisted Vendor Item points at, or null for a shared one. */
export function privateVendorIdOf(
  item: Pick<ShortlistedVendorItem, "data">,
): Id<"privateVendors"> | null {
  return "privateVendorId" in item.data ? item.data.privateVendorId : null;
}
