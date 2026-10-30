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

/** The hand-typed Vendor a Shortlisted Vendor Item points at, or null for a shared one. */
export function privateVendorIdOf(
  item: Pick<ShortlistedVendorItem, "data">,
): Id<"privateVendors"> | null {
  return "privateVendorId" in item.data ? item.data.privateVendorId : null;
}
