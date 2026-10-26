"use client";

import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import type { ReactNode } from "react";
import { Money } from "@/components/ui/money";
import { PriceBadge } from "@/components/ui/price-badge";
import {
  formatSeenDay,
  LINK_STATUS_LABELS,
  siteOf,
} from "@/components/vendors/cards";
import type { LineComparison } from "@/convex/quotes";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { compareWithPlanned, type Comparison } from "./quotes";

/*
 * The Budget comparison under one budget line (docs/design/vendors.md, "The
 * Budget comparison"): for each Vendor linked to it, the comparable Listed
 * prices worked out for the Function's Guests and the current Quote, each with
 * its own badge, beside the line's planned amount and Estimate and never added
 * into them. A Quote says in words and colour how far it is over or under the
 * planned amount and the Function's budget.
 */

/** At most this many Listed prices per Vendor, so a long price list stays short here. */
const MAX_LISTED = 2;

export function BudgetQuotes({
  label,
  comparison,
  functionName,
  functionTotal,
}: {
  label: string;
  comparison: LineComparison | undefined;
  /** The line's Function, or null for an Event-wide line. */
  functionName: string | null;
  /** The Function's total in the Budget now. */
  functionTotal: number | null;
}) {
  if (!comparison || comparison.vendors.length === 0) return null;
  return (
    <ul
      aria-label={`Vendor prices for ${label}`}
      className="grid gap-1.5 rounded-xs bg-surface-sunk px-2 py-1.5"
    >
      {comparison.vendors.map((vendor) => (
        <li
          key={vendor.linkId}
          data-comparison-link={vendor.linkId}
          className="grid min-w-0 gap-1"
        >
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-caption">
            <span className="min-w-0 truncate font-semibold text-ink">
              {vendor.vendorName}
            </span>
            <span className="text-ink-3">
              {LINK_STATUS_LABELS[vendor.status]}
            </span>
          </span>

          {vendor.listed.slice(0, MAX_LISTED).map((price) => (
            <span
              key={`${price.sourceUrl}\n${price.label}`}
              className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5"
            >
              <PriceBadge
                kind="listed"
                source={siteOf(price.sourceUrl)}
                seenOn={formatSeenDay(price.seenAt)}
                detail="none"
              />
              <span className="num text-caption text-price-listed">
                {price.label}
              </span>
              {/* Its own line that wraps, so a long site name stays inside a narrow card. */}
              <span className="min-w-0 text-caption text-ink-3 [overflow-wrap:anywhere]">
                from {siteOf(price.sourceUrl)} · seen{" "}
                {formatSeenDay(price.seenAt)}
              </span>
            </span>
          ))}

          {vendor.quote ? (
            <QuoteComparison
              quote={vendor.quote}
              functionName={functionName}
              functionTotal={functionTotal}
            />
          ) : (
            <span className="text-caption text-ink-3">No Quote yet</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function QuoteComparison({
  quote,
  functionName,
  functionTotal,
}: {
  quote: NonNullable<LineComparison["vendors"][number]["quote"]>;
  functionName: string | null;
  functionTotal: number | null;
}) {
  const line = compareWithPlanned(quote.total, quote.comparedWith);
  const plannedWords =
    quote.covers > 1
      ? `the ${quote.covers} lines' planned ${formatINR(quote.comparedWith)}`
      : `the planned ${formatINR(quote.comparedWith)}`;
  // The Function's total if this Quote took the place of the lines it covers.
  const withQuote =
    functionName !== null && functionTotal !== null
      ? functionTotal - quote.comparedWith + quote.total
      : null;
  const fn =
    withQuote !== null && functionTotal !== null
      ? compareWithPlanned(withQuote, functionTotal)
      : null;
  return (
    <span className="grid gap-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <PriceBadge kind="quote" detail="none" />
        <span className="num text-caption font-semibold text-quote">
          {quote.line}
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        <Verdict comparison={line}>
          {line.kind === "same"
            ? `Same as ${plannedWords}`
            : `${line.text} ${plannedWords}`}
        </Verdict>
        {fn !== null && functionName !== null && functionTotal !== null ? (
          <Verdict comparison={fn}>
            {fn.kind === "same" ? (
              <>
                {functionName} stays at <Money amount={functionTotal} />
              </>
            ) : (
              <>
                {functionName} <Money amount={withQuote!} />, {fn.text} its{" "}
                <Money amount={functionTotal} />
              </>
            )}
          </Verdict>
        ) : null}
      </span>
    </span>
  );
}

const VERDICT = {
  over: { className: "bg-warn-soft text-warn", Icon: ArrowUp },
  under: { className: "bg-booked-soft text-booked", Icon: ArrowDown },
  same: { className: "bg-surface text-ink-2", Icon: Equal },
} as const;

/** Over, under or the same, in colour and in words, with an arrow that adds nothing a screen reader needs. */
function Verdict({
  comparison,
  children,
}: {
  comparison: Comparison;
  children: ReactNode;
}) {
  const { className, Icon } = VERDICT[comparison.kind];
  return (
    <span
      data-verdict={comparison.kind}
      className={cn(
        "num inline-flex max-w-full items-start gap-1 rounded-sm px-2 py-0.5 text-caption font-medium",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
