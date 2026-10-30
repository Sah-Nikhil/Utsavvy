import type { Doc, Id } from "../_generated/dataModel";

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

/** The hand-typed Vendor a Shortlisted Vendor Item points at, or null for a shared one. */
export function privateVendorIdOf(
  item: Pick<ShortlistedVendorItem, "data">,
): Id<"privateVendors"> | null {
  return "privateVendorId" in item.data ? item.data.privateVendorId : null;
}
