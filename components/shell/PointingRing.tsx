import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * "The Assistant is pointing here" (IMPLEMENTATION_PLAN.md section 7.3). A solid
 * marigold ring with an "Assistant" label, plus one pulse that runs three times
 * when it appears: the only marigold animation in the product. Remount it (a new
 * `key`) to replay the pulse when the Assistant points at the same thing again.
 */

export type PointingRingProps = {
  /** Draws the ring. When false the children render untouched. */
  active?: boolean;
  label?: string;
  /** Fills the pointed area with the pale marigold field (for rows and text). */
  tint?: boolean;
  /** Corner radius classes matching the wrapped element, e.g. "rounded-md". */
  radiusClassName?: string;
  /** Where the label sits along the top edge. */
  labelAlign?: "start" | "center" | "end";
  className?: string;
  children: ReactNode;
};

const align = {
  start: "left-3",
  center: "left-1/2 -translate-x-1/2",
  end: "right-3",
} as const;

export function PointingRing({
  active = true,
  label = "Assistant",
  tint = false,
  radiusClassName = "rounded-sm",
  labelAlign = "start",
  className,
  children,
}: PointingRingProps) {
  return (
    <div
      data-pointed={active ? "" : undefined}
      className={cn(
        "relative",
        radiusClassName,
        active && "outline-2 outline-offset-2 outline-point",
        active && tint && "bg-point-field",
        className,
      )}
    >
      {children}
      {active ? (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-1 animate-point-ring opacity-0",
              radiusClassName,
            )}
          />
          <span
            className={cn(
              "pointer-events-none absolute -top-[13px] z-10 inline-flex h-[18px] items-center rounded-full bg-point px-2",
              "text-[10.5px] leading-none font-bold tracking-[0.02em] text-point-label",
              align[labelAlign],
            )}
          >
            {label}
            <span className="sr-only"> is pointing here</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
