import {
  CATEGORY_LABELS,
  LINK_STATUS_LABELS,
  type LinkStatus,
} from "@/components/vendors/cards";
import type { MapVendor } from "@/convex/map";

/*
 * How a Vendor shows on the map: a Shortlisted Vendor in its status colour,
 * every other shared Vendor in the city faint. Colours are token classes, so
 * they follow the look and the hex lint rule.
 */

/** "other" is a shared Vendor this Event hasn't shortlisted: a faint Marker. */
export type MarkerTone = LinkStatus | "other";

/** The text colour each tone draws its Marker in (the SVG uses currentColor). */
export const TONE_CLASS: Record<MarkerTone, string> = {
  considering: "text-action",
  contacted: "text-motif-2",
  quoted: "text-motif",
  booked: "text-booked",
  dropped: "text-rule-strong",
  other: "text-ink-3",
};

/** The legend's order: the way a Vendor moves along. */
export const LEGEND: readonly MarkerTone[] = [
  "considering",
  "contacted",
  "quoted",
  "booked",
  "dropped",
  "other",
];

export const TONE_LABELS: Record<MarkerTone, string> = {
  ...LINK_STATUS_LABELS,
  other: "Not shortlisted",
};

export function toneOf(vendor: Pick<MapVendor, "shortlist">): MarkerTone {
  if (vendor.shortlist === null) return "other";
  // Shortlisted, but every linked Entry was deleted: show it as considered.
  return vendor.shortlist.status ?? "considering";
}

/** What a screen reader hears for a Marker or its row. */
export function markerLabel(
  vendor: Pick<MapVendor, "name" | "category" | "shortlist" | "marker">,
  extra: { noPrice?: boolean } = {},
): string {
  const parts = [vendor.name, CATEGORY_LABELS[vendor.category]];
  const tone = toneOf(vendor);
  parts.push(tone === "other" ? "not shortlisted" : TONE_LABELS[tone]);
  if (vendor.marker?.approximate) parts.push("approximate");
  if (extra.noPrice) parts.push("no price");
  return parts.join(", ");
}
