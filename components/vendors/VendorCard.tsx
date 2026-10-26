"use client";

import { ExternalLink, Quote as QuoteIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Money } from "@/components/ui/money";
import { PriceBadge } from "@/components/ui/price-badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import type { EventLayer, ListedPriceView, VendorView } from "@/convex/vendors";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  LINK_STATUS_LABELS,
  formatSeenDay,
  isVendorCategory,
  provenanceLine,
  siteOf,
  wedMeGoodUrl,
  type Provenance,
} from "./cards";
import { CategoryIllustration } from "./CategoryIllustration";

/*
 * The Vendor card (docs/design/vendors.md, "The Vendor card"), shared by the
 * Chat's Vendor cards and the Shortlisted Vendor on the Canvas. Every section
 * says where its facts came from; a Listed price shows the exact sentence on
 * hover or tap. The only image is our neutral category illustration: never a
 * Vendor's photo or a search thumbnail.
 */

const UNIT_LABELS: Record<string, string> = {
  per_plate: "per plate",
  per_person: "per person",
  per_day: "per day",
  per_function: "per Function",
  total: "in total",
};

function provenanceFor(vendor: Doc<"vendors">, fields: string[]): Provenance[] {
  return fields.flatMap((field) =>
    vendor.provenance.filter((p) => p.field === field),
  );
}

/**
 * "The exact sentence": the quote-checked sentence(s) a fact or price was read
 * from, in a tooltip on hover and inline on tap, so touch screens get it too.
 */
function ExactSentence({
  sentences,
}: {
  sentences: { sentence: string; url: string }[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (sentences.length === 0) return null;
  const several = sentences.length > 1;
  const label = several ? "The exact sentences" : "The exact sentence";
  return (
    <>
      <div>
        <Tooltip content={sentences.map((s) => `“${s.sentence}”`).join(" ")}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <QuoteIcon aria-hidden className="size-3" />
            {open
              ? several
                ? "Hide the sentences"
                : "Hide the sentence"
              : label}
          </button>
        </Tooltip>
      </div>
      {open ? (
        <div id={id} className="grid gap-1">
          {sentences.map((s) => (
            <blockquote
              key={`${s.url}
${s.sentence}`}
              cite={s.url}
              className="border-l-2 border-rule-strong pl-2 text-caption text-ink-2"
            >
              “{s.sentence}”
            </blockquote>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** A section's short provenance line, with its exact sentences on hover or tap. */
function SourceLine({ sources }: { sources: Provenance[] }) {
  const first = sources[0];
  if (first === undefined) return null;
  const seen = new Set<string>();
  const sentences: { sentence: string; url: string }[] = [];
  for (const source of sources) {
    if (source.sentence === null || seen.has(source.sentence)) continue;
    seen.add(source.sentence);
    sentences.push({ sentence: source.sentence, url: source.url });
  }
  return (
    <>
      <p className="text-caption text-ink-3 num">{provenanceLine(first)}</p>
      <ExactSentence sentences={sentences} />
    </>
  );
}

function Section({
  label,
  children,
  source,
}: {
  label: string;
  children: ReactNode;
  source?: ReactNode;
}) {
  return (
    <section aria-label={label} className="grid gap-0.5">
      <h4 className="text-caption font-semibold tracking-[0.04em] text-ink-3 uppercase">
        {label}
      </h4>
      {children}
      {source}
    </section>
  );
}

/** A Listed price, its worked-out comparison and its exact sentence on hover or tap. */
function ListedPriceRow({ price }: { price: ListedPriceView }) {
  return (
    <li className="grid gap-1">
      <PriceBadge
        kind="listed"
        source={siteOf(price.sourceUrl)}
        seenOn={formatSeenDay(price.seenAt)}
        detail="inline"
        className="flex-wrap"
      />
      <p className="text-label text-ink num">{price.text}</p>
      {price.comparable ? (
        <p className="text-caption text-ink-2 num">{price.comparable.label}</p>
      ) : (
        <p className="text-caption text-ink-3">
          Not comparable with a per-Guest budget line
        </p>
      )}
      <ExactSentence
        sentences={[{ sentence: price.sentence, url: price.sourceUrl }]}
      />
    </li>
  );
}

export type VendorCardProps = {
  /** The shared Vendor, its Listed prices and, with none comparable, its Estimate. */
  vendor: VendorView;
  /** This Event's own links, statuses and Quotes, or null when it hasn't shortlisted the Vendor. */
  eventLayer: EventLayer;
  /** The Event's city, for "Compare on WedMeGood". */
  city: string | null;
  /** "Add to Canvas" and the like. */
  actions?: ReactNode;
  className?: string;
};

export function VendorCard({
  vendor: view,
  eventLayer,
  city,
  actions,
  className,
}: VendorCardProps) {
  const { vendor, listedPrices, estimate, pricesTruncated } = view;
  const categoryLabel = isVendorCategory(vendor.category)
    ? CATEGORY_LABELS[vendor.category]
    : vendor.category;
  const site = vendor.website ? siteOf(vendor.website) : null;
  const hasContact = Boolean(vendor.address || vendor.phone || vendor.email);

  return (
    <article
      aria-label={vendor.name}
      data-vendor={vendor.domain}
      className={cn(
        "grid gap-3 rounded-md border border-rule bg-surface-raised p-3 text-ink",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <div className="grid size-14 shrink-0 place-items-center rounded-sm bg-motif-soft">
          <CategoryIllustration category={vendor.category} />
        </div>
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-title leading-tight font-semibold text-balance">
            {vendor.name}
          </h3>
          <p className="text-label text-ink-2">
            {categoryLabel}
            {site ? (
              <>
                {" · "}
                <a
                  href={vendor.website!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action underline-offset-2 hover:underline"
                >
                  {site}
                </a>
              </>
            ) : vendor.profileUrl ? (
              <>
                {" · "}
                <a
                  href={vendor.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action underline-offset-2 hover:underline"
                >
                  Instagram profile
                </a>
              </>
            ) : null}
          </p>
          <SourceLine sources={provenanceFor(vendor, ["name"])} />
        </div>
      </header>

      <Section
        label="Summary"
        source={
          <p className="text-caption text-ink-3">Summary by the Assistant</p>
        }
      >
        <p className="text-body text-ink-2">{vendor.summary}</p>
      </Section>

      {hasContact ? (
        <Section
          label="Contact"
          source={
            <SourceLine
              sources={provenanceFor(vendor, ["address", "phone", "email"])}
            />
          }
        >
          {vendor.address ? (
            <p className="text-label text-ink">
              {vendor.address.line}, {vendor.address.locality},{" "}
              {vendor.address.city}
            </p>
          ) : null}
          {vendor.phone || vendor.email ? (
            <p className="text-label text-ink-2 num">
              {[vendor.phone, vendor.email].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </Section>
      ) : null}

      {vendor.category === "venue" && vendor.capacity ? (
        <Section
          label="Capacity"
          source={<SourceLine sources={provenanceFor(vendor, ["capacity"])} />}
        >
          <p className="text-label text-ink num">
            {vendor.capacity.min !== undefined
              ? `${vendor.capacity.min} to ${vendor.capacity.max} Guests`
              : `Up to ${vendor.capacity.max} Guests`}
          </p>
        </Section>
      ) : vendor.areaServed ? (
        <Section
          label="Area served"
          source={
            <SourceLine sources={provenanceFor(vendor, ["areaServed"])} />
          }
        >
          <p className="text-label text-ink">{vendor.areaServed}</p>
        </Section>
      ) : null}

      {listedPrices.length > 0 || pricesTruncated ? (
        <Section label="Listed prices">
          <ul className="grid gap-2">
            {listedPrices.map((price) => (
              <ListedPriceRow key={price._id} price={price} />
            ))}
          </ul>
          {pricesTruncated ? (
            <p className="text-caption text-warn">
              This Vendor's price history is too long to read whole, so some
              Listed prices may be missing.
            </p>
          ) : null}
        </Section>
      ) : null}

      {estimate ? (
        <Section
          label="Estimate"
          source={
            <p className="text-caption text-ink-3">{estimate.basis.text}</p>
          }
        >
          <p className="flex flex-wrap items-center gap-2 text-label text-ink">
            <PriceBadge kind="estimate" />
            <span className="num">
              {formatINR(estimate.unitLow)} to {formatINR(estimate.unitHigh)}{" "}
              {UNIT_LABELS[estimate.unit] ?? estimate.unit}
            </span>
          </p>
        </Section>
      ) : null}

      {eventLayer && eventLayer.links.length > 0 ? (
        <Section label="In this Event">
          <ul className="flex flex-wrap gap-1.5">
            {eventLayer.links.map((link) => (
              <li
                key={link._id}
                data-status={link.status}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption",
                  link.status === "booked"
                    ? "border-booked bg-booked-soft text-ink"
                    : "border-rule-strong text-ink-2",
                )}
              >
                {link.entryLabel}: {LINK_STATUS_LABELS[link.status]}
                {link.quote ? (
                  <span className="inline-flex items-center gap-1">
                    <PriceBadge kind="quote" detail="none" />
                    <Money amount={link.quote.amount} />{" "}
                    {UNIT_LABELS[link.quote.unit] ?? ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2">
        {city && isVendorCategory(vendor.category) ? (
          <a
            href={wedMeGoodUrl(city, vendor.category)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-label font-medium text-action underline-offset-2 hover:underline"
          >
            Compare on WedMeGood
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : (
          <span />
        )}
        {actions}
      </footer>
    </article>
  );
}
