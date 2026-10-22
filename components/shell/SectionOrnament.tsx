import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Section decoration is one component (IMPLEMENTATION_PLAN.md section 7.4), so
 * swapping looks is a token change, not a rewrite. Both drawings render and CSS
 * shows the one that matches html[data-look], so the dev switch needs no rerender:
 *
 *   b, bd  a thin diamond chain beside the Section label (textile and rangoli
 *          geometry, drawn for Utsavvy)
 *   d      ornamental corner pieces on the Section frame
 *
 * Place <SectionOrnament /> inside the label row. The corner pieces position
 * themselves against the nearest positioned ancestor, which should be the
 * Section frame (SectionFrame below does both).
 */
export function SectionOrnament({ className }: { className?: string }) {
  return (
    <>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 82 10"
        width="82"
        height="10"
        className={cn(
          "hidden shrink-0 text-motif look-ledger:block",
          className,
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M0 5h82" strokeOpacity="0.55" />
        <path d="M10 1.5 13.5 5 10 8.5 6.5 5Z" fill="var(--canvas)" />
        <path d="M28 2.5 30.5 5 28 7.5 25.5 5Z" fill="var(--canvas)" />
        <path d="M41 0.5 45.5 5 41 9.5 36.5 5Z" fill="var(--canvas)" />
        <circle cx="41" cy="5" r="1" fill="currentColor" stroke="none" />
        <path d="M54 2.5 56.5 5 54 7.5 51.5 5Z" fill="var(--canvas)" />
        <path d="M72 1.5 75.5 5 72 8.5 68.5 5Z" fill="var(--canvas)" />
        <circle cx="19" cy="5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="63" cy="5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      <span aria-hidden className="pointer-events-none hidden look-d:contents">
        <Corner className="absolute -top-1.5 -left-1.5" />
        <Corner className="absolute -right-1.5 -bottom-1.5 rotate-180" />
      </span>
    </>
  );
}

function Corner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 56"
      width="56"
      height="56"
      fill="none"
      strokeWidth="1.4"
      focusable="false"
      className={className}
    >
      <path d="M1 55V20L20 1h35" stroke="var(--motif)" />
      <path d="M8 55V24L24 8h31" stroke="var(--motif)" strokeOpacity="0.4" />
      <path d="M16 28 28 16l12 12-12 12Z" stroke="var(--motif-2)" />
      <path
        d="M22 28 28 22l6 6-6 6Z"
        fill="var(--motif-2)"
        fillOpacity="0.16"
        stroke="var(--motif-2)"
        strokeOpacity="0.6"
      />
      <circle cx="46" cy="16" r="1.6" fill="var(--motif)" />
      <circle cx="16" cy="46" r="1.6" fill="var(--motif)" />
    </svg>
  );
}

export type SectionFrameProps = {
  /** The Section's name, e.g. "Money and dates". */
  label: ReactNode;
  /** A quiet count beside the label, e.g. "2 Items". */
  count?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * A Section's frame and label in every look: a ruled ledger heading in b and bd,
 * a softly filled region with corner pieces in d.
 */
export function SectionFrame({
  label,
  count,
  children,
  className,
}: SectionFrameProps) {
  return (
    <section
      className={cn(
        "relative px-4 pt-3 pb-4",
        "look-ledger:border-t look-ledger:border-item-line",
        "look-d:rounded-xl look-d:bg-surface/40 look-d:px-5 look-d:pt-4 look-d:pb-7",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2.5 look-d:pl-10">
        <h2 className="font-display text-[15px] leading-tight font-medium! text-ink look-ledger:italic">
          {label}
        </h2>
        {count ? (
          <span className="font-display text-label text-ink-3 look-ledger:italic">
            {count}
          </span>
        ) : null}
        <SectionOrnament />
      </div>
      {children}
    </section>
  );
}
