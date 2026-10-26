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

/** An eight-point star, for Booked, centred in a 32 px box. */
function star(outer = 13.6, cx = 16, cy = 16): string {
  const inner = outer * 0.765;
  const points = Array.from({ length: 16 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 8;
    const r = i % 2 ? inner : outer;
    return `${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}

/**
 * Each status's own silhouette in a 32 px box (the look picked on 27 Oct), so a
 * Marker's status never rests on colour alone: Considering a circle, Contacted
 * a four-petalled flower, Quoted a notched square, Booked an eight-point star,
 * Dropped a smaller circle struck through, and other Vendors a small ring.
 */
export const STATUS_SHAPES: Record<MarkerTone, string> = {
  considering: "M16 4.5a11.5 11.5 0 1 1 0 23a11.5 11.5 0 1 1 0-23Z",
  contacted:
    "M16 2.6C20.4 2.6 22.6 6 22 10C26 9.4 29.4 11.6 29.4 16C29.4 20.4 26 22.6 22 22C22.6 26 20.4 29.4 16 29.4C11.6 29.4 9.4 26 10 22C6 22.6 2.6 20.4 2.6 16C2.6 11.6 6 9.4 10 10C9.4 6 11.6 2.6 16 2.6Z",
  quoted:
    "M10 4H22A6 6 0 0 0 28 10V22A6 6 0 0 0 22 28H10A6 6 0 0 0 4 22V10A6 6 0 0 0 10 4Z",
  booked: star(),
  dropped: "M16 6a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z",
  other: "M16 9a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z",
};

/** The stroke across a Dropped Vendor's circle. */
export const DROPPED_SLASH = "M9 23 23 9";

/**
 * When a Marker writes "approximate" under itself: never on an exact one; at
 * street zoom always; at city zoom only on hover or keyboard focus, where the
 * hollow shape (and the dotted ring once selected) says it quietly. A faint
 * Vendor the Event hasn't shortlisted waits for hover or focus at any zoom,
 * so Markers on the same spot don't stack their tags.
 */
export function approximateTag({
  approximate,
  street,
  faint = false,
}: {
  approximate: boolean;
  street: boolean;
  faint?: boolean;
}): "none" | "shown" | "on-hover" {
  if (!approximate) return "none";
  return street && !faint ? "shown" : "on-hover";
}
