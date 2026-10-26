import { cn } from "@/lib/utils";
import type { VendorCategory } from "./cards";

/*
 * The neutral illustration a Vendor card shows for its category
 * (docs/design/vendors.md, "The Vendor card"): our own line drawings, never a
 * Vendor's photo or a search thumbnail. One generic drawing covers any other
 * category. Drawn in `currentColor`, so the card's colour token sets the ink.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Venue() {
  // A haveli gateway: a scalloped arch between two chhatri domes.
  return (
    <g {...STROKE}>
      <path d="M10 54V30M54 54V30M6 54h52" />
      <path d="M10 30c0-6 4-10 8-11M54 30c0-6-4-10-8-11" />
      <path d="M18 54V34c0-8 6-14 14-14s14 6 14 14v20" />
      <path d="M24 54V38c0-5 3.5-8 8-8s8 3 8 8v16" />
      <path d="M26 20c0-4 3-7 6-9 3 2 6 5 6 9" />
      <path d="M32 11V7" />
      <path d="M7 30h6M51 30h6M8 26c0-3 2-5 4-5M56 26c0-3-2-5-4-5" />
    </g>
  );
}

function Caterer() {
  // A thali: a round plate with katoris, a roti and a ladle beside it.
  return (
    <g {...STROKE}>
      <circle cx="30" cy="36" r="20" />
      <circle cx="30" cy="36" r="16" strokeDasharray="1 4" />
      <circle cx="22" cy="29" r="5" />
      <circle cx="35" cy="27" r="4" />
      <circle cx="38" cy="40" r="5" />
      <path d="M20 42c2 4 8 5 11 3" />
      <path d="M56 14v20M56 34c-3 0-4 2-4 4s1 4 4 4 4-2 4-4-1-4-4-4" />
    </g>
  );
}

function Decorator() {
  // A marigold toran: a garland swag with hanging strings and a diya below.
  return (
    <g {...STROKE}>
      <path d="M6 12h52" />
      <path d="M6 12c8 12 18 14 26 14s18-2 26-14" />
      <path d="M14 18v12M24 24v14M32 26v16M40 24v14M50 18v12" />
      <circle cx="14" cy="32" r="2" />
      <circle cx="24" cy="40" r="2" />
      <circle cx="32" cy="44" r="2" />
      <circle cx="40" cy="40" r="2" />
      <circle cx="50" cy="32" r="2" />
      <path d="M24 56h16c0-4-3-6-8-6s-8 2-8 6zM32 50c-2-2-2-5 0-7 2 2 2 5 0 7z" />
    </g>
  );
}

function Photographer() {
  // A camera with a paisley-shaped flash of light.
  return (
    <g {...STROKE}>
      <rect x="8" y="22" width="48" height="30" rx="5" />
      <path d="M22 22l3-6h14l3 6" />
      <circle cx="32" cy="37" r="9" />
      <circle cx="32" cy="37" r="4" />
      <path d="M46 28h4" />
      <path d="M50 8c3 0 5 2 5 5 0 4-4 6-7 9 0-3-2-5-2-8 0-4 2-6 4-6z" />
    </g>
  );
}

function Generic() {
  // A rangoli flower: the mark for any other kind of Vendor.
  return (
    <g {...STROKE}>
      <circle cx="32" cy="32" r="5" />
      <path d="M32 27c-3-6-3-12 0-16 3 4 3 10 0 16zM32 37c-3 6-3 12 0 16 3-4 3-10 0-16zM27 32c-6-3-12-3-16 0 4 3 10 3 16 0zM37 32c6-3 12-3 16 0-4 3-10 3-16 0z" />
      <circle cx="32" cy="32" r="24" strokeDasharray="1 5" />
    </g>
  );
}

const DRAWINGS: Record<VendorCategory, () => React.JSX.Element> = {
  venue: Venue,
  caterer: Caterer,
  decorator: Decorator,
  photographer: Photographer,
};

export function CategoryIllustration({
  category,
  className,
}: {
  /** A starter category, or any free label, which gets the generic drawing. */
  category: string;
  className?: string;
}) {
  const Drawing =
    (DRAWINGS as Record<string, (() => React.JSX.Element) | undefined>)[
      category
    ] ?? Generic;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      data-illustration={category}
      className={cn("size-12 text-motif", className)}
    >
      <Drawing />
    </svg>
  );
}
