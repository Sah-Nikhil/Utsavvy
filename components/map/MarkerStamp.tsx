import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DROPPED_SLASH,
  STATUS_SHAPES,
  TONE_CLASS,
  type approximateTag,
  type MarkerTone,
} from "./markers";

/*
 * Our own Marker (IMPLEMENTATION_PLAN.md section 7.5), never MapLibre's
 * default, in the look Sah-Nikhil picked on 27 Oct: a hand-stamped motif
 * (option B) in the status colour, each status in its own shape, with the
 * category's line drawing inside. An approximate Marker is the same stamp,
 * hollow.
 *
 * Selecting it (on the map, by keyboard or from the list) plays option A's
 * rangoli frame as Sah-Nikhil asked on 27 Oct: the petals bloom out and pool
 * back into the stamp, then a ring comes around it, dotted when the Marker is
 * approximate and solid when it's exact. The ring stays while selected and
 * fades out when deselected. All CSS (keyframes and a transition in
 * app/globals.css), restarted by data-selected. With reduced motion or
 * Ornaments off there are no petals and the ring comes in at once.
 *
 * The block-print touches are ornaments: the slightly misregistered second
 * impression, the uneven ink, the dotted inner line of an approximate stamp
 * and the petals. With the Ornaments setting off they go and the shape, its
 * colour and the selection ring stay. The stamp sits on the Vendor's point
 * (anchored at its centre).
 */

/** The category drawings, simplified from CategoryIllustration to read at 14 px. */
const CATEGORY_GLYPHS: Record<string, ReactNode> = {
  venue: (
    <>
      <path d="M10 54V30M54 54V30M6 54h52" />
      <path d="M18 54V34c0-8 6-14 14-14s14 6 14 14v20" />
      <path d="M26 20c0-4 3-7 6-9 3 2 6 5 6 9" />
      <path d="M32 11V7" />
      <path d="M10 30c0-6 4-10 8-11M54 30c0-6-4-10-8-11" />
    </>
  ),
  caterer: (
    <>
      <circle cx="30" cy="36" r="20" />
      <circle cx="22" cy="29" r="5" />
      <circle cx="35" cy="27" r="4" />
      <circle cx="38" cy="40" r="5" />
      <path d="M56 14v20" />
    </>
  ),
  decorator: (
    <>
      <path d="M6 12h52" />
      <path d="M6 12c8 12 18 14 26 14s18-2 26-14" />
      <path d="M14 18v12M24 24v14M32 26v16M40 24v14M50 18v12" />
    </>
  ),
  photographer: (
    <>
      <rect x="8" y="22" width="48" height="30" rx="5" />
      <path d="M22 22l3-6h14l3 6" />
      <circle cx="32" cy="37" r="9" />
    </>
  ),
};

/** Eight rangoli petals around the 32 px box's centre. */
const PETALS = Array.from({ length: 8 }, (_, i) => i * 45);
const ORNAMENT = "ornaments-off:hidden";

export function MarkerStamp({
  category,
  tone,
  approximate,
  selected = false,
  tag,
  className,
}: {
  category: string;
  tone: MarkerTone;
  approximate: boolean;
  selected?: boolean;
  /** Whether "approximate" is written under it (see approximateTag). */
  tag: ReturnType<typeof approximateTag>;
  className?: string;
}) {
  const faint = tone === "other";
  const shape = STATUS_SHAPES[tone];
  const glyph = CATEGORY_GLYPHS[category];
  return (
    <span
      data-marker-tone={tone}
      data-approximate={approximate || undefined}
      data-selected={selected || undefined}
      className={cn(
        "group/mark relative grid place-items-center",
        TONE_CLASS[tone],
        className,
      )}
    >
      <svg
        viewBox="-4 -4 40 40"
        aria-hidden="true"
        focusable="false"
        className={cn(
          "block overflow-visible transition-transform duration-(--dur-shape) ease-standard",
          faint ? "size-6 opacity-85" : "size-10",
          selected && "scale-115",
        )}
      >
        {/* Petals: invisible at rest, bloom and pool when selected. */}
        <g
          data-ornament="petals"
          className={cn(
            ORNAMENT,
            "opacity-0 [transform-box:fill-box] origin-center motion-reduce:hidden",
            "group-data-selected/mark:animate-stamp-petals",
          )}
        >
          {PETALS.map((angle) => (
            <path
              key={angle}
              d="M16 -3Q21 -9 16 -16Q11 -9 16 -3Z"
              transform={`rotate(${angle} 16 16)`}
              fill="currentColor"
              fillOpacity={0.14}
              stroke="currentColor"
              strokeWidth={1}
              strokeOpacity={0.75}
            />
          ))}
        </g>
        {/* The ring: dotted for an approximate Marker, solid for an exact one. */}
        <circle
          data-selection-ring={approximate ? "dotted" : "solid"}
          cx="16"
          cy="16"
          r="19"
          fill="none"
          stroke="currentColor"
          strokeWidth={approximate ? 2.4 : 1.75}
          strokeLinecap="round"
          strokeDasharray={approximate ? "0.01 4.2" : undefined}
          className={cn(
            "[transform-box:fill-box] origin-center",
            // Leaving: fades and widens quickly.
            "scale-[1.3] opacity-0 transition-[opacity,scale] duration-(--dur-exit) ease-emphasized-accelerate",
            // Arriving: after the petals have pooled into the stamp.
            "group-data-selected/mark:scale-100 group-data-selected/mark:opacity-100 group-data-selected/mark:delay-[340ms] group-data-selected/mark:duration-(--dur-arrival) group-data-selected/mark:ease-emphasized",
            "motion-reduce:delay-0! ornaments-off:delay-0!",
          )}
        />
        {/* The uneven, hand-pressed ink (the filter is defined once, in MapCanvas). */}
        <g
          data-stamp-body
          className="[transform-box:fill-box] origin-center [filter:url(#map-ink)] group-data-selected/mark:animate-stamp-pool ornaments-off:[filter:none]"
        >
          <path
            data-ornament="misregistration"
            d={shape}
            transform="translate(1.6 1.4)"
            fill="currentColor"
            fillOpacity={0.22}
            className={ORNAMENT}
          />
          <path
            data-stamp-shape
            d={shape}
            fill={approximate ? "var(--surface)" : "currentColor"}
            stroke="currentColor"
            strokeWidth={faint ? 3.6 : 2.6}
            strokeLinejoin="round"
          />
          {approximate && !faint ? (
            <path
              data-ornament="inner-dots"
              d={shape}
              transform="translate(16 16) scale(.72) translate(-16 -16)"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeDasharray="1 2.2"
              strokeOpacity={0.8}
              className={ORNAMENT}
            />
          ) : null}
          {tone === "dropped" ? (
            <path
              data-stamp-slash
              d={DROPPED_SLASH}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
          {faint ? (
            <path
              data-ornament="butta"
              d="M16 12l4 4-4 4-4-4z"
              fill="currentColor"
              fillOpacity={0.55}
              className={ORNAMENT}
            />
          ) : glyph ? (
            <g
              transform="translate(9.5 9.5) scale(0.204)"
              fill="none"
              stroke={approximate ? "currentColor" : "var(--surface)"}
              strokeWidth={6.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {glyph}
            </g>
          ) : null}
        </g>
      </svg>
      {tag !== "none" ? (
        // Below the stamp and out of the layout, so the stamp stays the anchor.
        <span
          data-approximate-tag
          className={cn(
            "pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 rounded-xs bg-surface px-1.5 text-[10.5px] leading-[15px] font-semibold whitespace-nowrap text-ink-2 shadow-[0_0_0_1px_var(--rule)]",
            tag === "on-hover" &&
              "invisible group-hover/stamp:visible group-focus-visible/stamp:visible",
          )}
        >
          approximate
        </span>
      ) : null}
    </span>
  );
}

/** A small status shape for the list and the key: the Marker's own silhouette. */
export function StatusGlyph({
  tone,
  approximate,
  size = 16,
  className,
}: {
  tone: MarkerTone;
  approximate: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-approximate={approximate || undefined}
      className={cn("shrink-0", TONE_CLASS[tone], className)}
    >
      <path
        d={STATUS_SHAPES[tone]}
        fill={approximate ? "var(--surface)" : "currentColor"}
        stroke="currentColor"
        strokeWidth={tone === "other" ? 3.6 : 2.4}
        strokeLinejoin="round"
      />
      {tone === "dropped" ? (
        <path
          d={DROPPED_SLASH}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
