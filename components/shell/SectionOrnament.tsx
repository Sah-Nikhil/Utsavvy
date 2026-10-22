import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Section decoration is one component (IMPLEMENTATION_PLAN.md section 7.4): the
 * ornamental corner pieces of look D, Contemporary rangoli. They are purely
 * decorative, so they are hidden from assistive technology and follow the
 * personal Ornaments setting (lib/ornaments.ts). They are absolutely positioned,
 * so turning them off moves nothing else.
 *
 * Place <SectionOrnament /> inside the Section frame. The corner pieces position
 * themselves against the nearest positioned ancestor, which should be the
 * Section frame (SectionFrame below does both).
 */
export function SectionOrnament({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-ornament="section-corners"
      className={cn(
        "pointer-events-none contents ornaments-off:hidden",
        className,
      )}
    >
      <Corner className="absolute -top-1.5 -left-1.5" />
      <Corner className="absolute -right-1.5 -bottom-1.5 rotate-180" />
    </span>
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

/** A Section's frame and label: a softly filled region with corner pieces. */
export function SectionFrame({
  label,
  count,
  children,
  className,
}: SectionFrameProps) {
  return (
    <section
      className={cn(
        "relative rounded-xl bg-surface/40 px-5 pt-4 pb-7",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2.5 pl-10">
        <h2 className="font-display text-[15px] leading-tight font-medium! text-ink">
          {label}
        </h2>
        {count ? (
          <span className="font-display text-label text-ink-3">{count}</span>
        ) : null}
        <SectionOrnament />
      </div>
      {children}
    </section>
  );
}
