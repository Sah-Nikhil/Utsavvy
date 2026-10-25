import { cn } from "@/lib/utils";

/*
 * An original rangoli medallion for the public pages: eight lens petals, a
 * second ring of smaller petals in the Function colours, an eight-point star of
 * two squares and a ring of kolam dots, all plain geometry. It is decoration, so
 * it is hidden from assistive technology and follows the personal Ornaments
 * setting (lib/ornaments.ts), like the Section corner pieces.
 *
 * With `draw`, the lines draw themselves in once (the landing's one authored
 * moment). Under reduced motion the animation collapses to its end state, so
 * the medallion is simply there.
 */

const PETALS = Array.from({ length: 8 }, (_, i) => i * 45);
const SMALL_PETALS = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
const DOTS = Array.from({ length: 32 }, (_, i) => (i * 360) / 32);
const SMALL_COLOURS = [
  "var(--function-1)",
  "var(--function-2)",
  "var(--function-3)",
  "var(--function-4)",
];

export function Rangoli({
  className,
  draw = false,
}: {
  className?: string;
  draw?: boolean;
}) {
  // pathLength="1" lets one dash length cover every line for the draw-in.
  const line = draw
    ? {
        pathLength: 1,
        strokeDasharray: 1,
        className:
          "animate-[rangoli-draw_1.8s_var(--ease-emphasized)_both] motion-reduce:animate-none",
      }
    : {};
  const fadeIn = draw
    ? "animate-in fade-in-0 duration-700 delay-700 fill-mode-both ease-standard motion-reduce:animate-none"
    : undefined;

  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden
      focusable="false"
      data-ornament="rangoli"
      className={cn("pointer-events-none ornaments-off:hidden", className)}
    >
      <circle
        cx="200"
        cy="200"
        r="176"
        stroke="var(--motif)"
        strokeOpacity="0.35"
        strokeWidth="1"
        {...line}
      />
      <circle
        cx="200"
        cy="200"
        r="164"
        stroke="var(--motif-2)"
        strokeOpacity="0.3"
        strokeWidth="1"
        strokeDasharray={draw ? undefined : "2 6"}
      />
      <g className={fadeIn}>
        {DOTS.map((angle) => (
          <circle
            key={angle}
            cx="200"
            cy="12"
            r="2.2"
            fill="var(--motif)"
            fillOpacity="0.55"
            transform={`rotate(${angle} 200 200)`}
          />
        ))}
      </g>
      {PETALS.map((angle) => (
        <path
          key={angle}
          d="M200 152 Q238 98 200 36 Q162 98 200 152Z"
          stroke="var(--motif)"
          strokeWidth="1.4"
          fill="var(--motif)"
          fillOpacity="0.06"
          transform={`rotate(${angle} 200 200)`}
          {...line}
        />
      ))}
      {SMALL_PETALS.map((angle, i) => (
        <path
          key={angle}
          d="M200 150 Q222 118 200 84 Q178 118 200 150Z"
          stroke={SMALL_COLOURS[i % SMALL_COLOURS.length]}
          strokeWidth="1.2"
          fill={SMALL_COLOURS[i % SMALL_COLOURS.length]}
          fillOpacity="0.14"
          transform={`rotate(${angle} 200 200)`}
          {...line}
        />
      ))}
      <rect
        x="148"
        y="148"
        width="104"
        height="104"
        stroke="var(--motif-2)"
        strokeWidth="1.4"
        {...line}
      />
      <rect
        x="148"
        y="148"
        width="104"
        height="104"
        stroke="var(--motif-2)"
        strokeWidth="1.4"
        transform="rotate(45 200 200)"
        {...line}
      />
      <circle
        cx="200"
        cy="200"
        r="38"
        stroke="var(--motif)"
        strokeWidth="1.4"
        {...line}
      />
      <g className={fadeIn}>
        <path
          d="M200 176 224 200 200 224 176 200Z"
          fill="var(--motif-2)"
          fillOpacity="0.2"
          stroke="var(--motif-2)"
          strokeWidth="1.2"
        />
        <circle cx="200" cy="200" r="4" fill="var(--motif)" />
      </g>
    </svg>
  );
}

/** A small rangoli diamond, the wordmark's mark and a divider jewel. */
export function RangoliMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path
        d="M12 1.5 22.5 12 12 22.5 1.5 12Z"
        stroke="var(--motif)"
        strokeWidth="1.5"
      />
      <path
        d="M12 6.5 17.5 12 12 17.5 6.5 12Z"
        fill="var(--motif-2)"
        fillOpacity="0.85"
      />
      <circle cx="12" cy="12" r="1.6" fill="var(--surface)" />
    </svg>
  );
}

/**
 * A horizontal rule with a rangoli jewel in the middle. The jewel is an
 * ornament (hidden when Ornaments are off); the line stays.
 */
export function OrnamentRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("flex items-center gap-3 text-rule-strong", className)}
    >
      <span className="h-px flex-1 bg-rule" />
      <RangoliMark className="size-3.5 ornaments-off:hidden" />
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
