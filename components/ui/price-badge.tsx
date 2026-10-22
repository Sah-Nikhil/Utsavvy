import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Every price wears a labelled badge (IMPLEMENTATION_PLAN.md section 7.3):
 * Estimate, Listed price or Quote. The label is always shown, and the three
 * kinds are never added into one total, so this component takes no amount.
 */

export type PriceKind = "estimate" | "listed" | "quote";

export const PRICE_LABELS: Record<PriceKind, string> = {
  estimate: "Estimate",
  listed: "Listed price",
  quote: "Quote",
};

export type PriceBadgeProps = (
  | { kind: "estimate"; source?: never; seenOn?: never }
  | {
      kind: "listed";
      /** Where the price was read, e.g. "example.in". */
      source: string;
      /** When it was read, already formatted, e.g. "21 Oct 2026". */
      seenOn: string;
    }
  | {
      kind: "quote";
      /** Who quoted it, e.g. "Gulmohar Garden". */ source?: string;
      seenOn?: never;
    }
) & {
  /** "below" puts the source line under the badge; "inline" beside it. */
  detail?: "below" | "inline" | "none";
  className?: string;
};

const badgeClass: Record<PriceKind, string> = {
  estimate:
    "border border-dashed border-price-estimate-line bg-transparent text-price-estimate",
  listed:
    "border border-price-listed-line bg-price-listed-bg text-price-listed",
  quote: "border border-quote-line bg-quote-soft text-quote",
};

export function PriceBadge(props: PriceBadgeProps) {
  const { kind, detail = "below", className } = props;
  let line: ReactNode = null;
  if (kind === "listed") line = `from ${props.source} · seen ${props.seenOn}`;
  if (kind === "quote" && props.source) line = `from ${props.source}`;

  const badge = (
    <span
      data-slot="price-badge"
      data-kind={kind}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-caption leading-none font-semibold tracking-[0.015em] whitespace-nowrap",
        badgeClass[kind],
      )}
    >
      {PRICE_LABELS[kind]}
    </span>
  );

  if (!line || detail === "none")
    return <span className={cn("inline-flex", className)}>{badge}</span>;

  return (
    <span
      className={cn(
        "inline-flex",
        detail === "below"
          ? "flex-col items-start gap-0.5"
          : "items-center gap-1.5",
        className,
      )}
    >
      {badge}
      <span className="text-caption text-ink-3 num whitespace-nowrap">
        {line}
      </span>
    </span>
  );
}
