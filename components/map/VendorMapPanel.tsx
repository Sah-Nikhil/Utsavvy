"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { CategoryIllustration } from "@/components/vendors/CategoryIllustration";
import {
  CATEGORY_LABELS,
  VENDOR_CATEGORIES,
  type VendorCategory,
} from "@/components/vendors/cards";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MapVendor, MapView } from "@/convex/map";
import { cn } from "@/lib/utils";
import { budgetLineFor, filterForFunction } from "./filter";
import { placeVendors } from "./placement";
import type { MapVendorShown } from "./MapCanvas";
import { LEGEND, TONE_CLASS, TONE_LABELS, toneOf } from "./markers";
import { MarkerPin } from "./MarkerPin";

/*
 * The full-screen Vendor map: filters and the list of Vendors beside the map
 * (below it on a phone). Every Vendor with a Marker has a row that shows it on
 * the map and moves focus to its Marker; Vendors without an address are
 * listed here only.
 */

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-[var(--map-land)]" />,
});

const CATEGORY_CHIPS: Record<VendorCategory, string> = {
  venue: "Venues",
  caterer: "Caterers",
  decorator: "Decorators",
  photographer: "Photographers",
};

type Listed = MapVendor & { noPrice: boolean };

/** The Vendors that pass the category and Function filters. */
function applyFilters(
  view: MapView,
  category: VendorCategory | null,
  functionKey: string | null,
): Listed[] {
  const inCategory = view.vendors.filter(
    (v) => category === null || v.category === category,
  );
  const fn = view.functions.find((f) => f.key === functionKey);
  if (!fn) return inCategory.map((v) => ({ ...v, noPrice: false }));
  // One budget line per category, so filter each category against its own.
  const kept = new Set<Id<"vendors">>();
  const marked = new Map<Id<"vendors">, Listed>();
  for (const cat of VENDOR_CATEGORIES) {
    const group = inCategory.filter((v) => v.category === cat);
    if (group.length === 0) continue;
    const line = budgetLineFor(view.budgetLines, fn.key, cat);
    for (const v of filterForFunction(group, fn, line)) {
      kept.add(v._id);
      marked.set(v._id, v);
    }
  }
  return inCategory
    .filter((v) => kept.has(v._id))
    .map((v) => marked.get(v._id)!);
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string; message?: string };
    if (data.kind === "AccessDenied") return "You can't move this Marker.";
    if (data.message) return data.message;
  }
  return "The Marker couldn't be moved. Try again.";
}

export function VendorMapPanel({ eventId }: { eventId: Id<"events"> }) {
  const view = useQuery(api.map.view, { eventId });
  const moveMarker = useMutation(api.map.moveMarker);
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [functionKey, setFunctionKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"vendors"> | null>(null);
  const [reveal, setReveal] = useState<{ id: Id<"vendors">; n: number } | null>(
    null,
  );
  const [moveError, setMoveError] = useState<string | null>(null);

  const listed = useMemo(
    () => (view ? applyFilters(view, category, functionKey) : []),
    [view, category, functionKey],
  );
  // Held to the Event's city: a Vendor shortlisted from elsewhere is listed, not drawn.
  const { onMap, outside, noAddress } = placeVendors(
    listed,
    view?.city != null,
  );
  const shortlisted = onMap.filter((v) => v.shortlist !== null);
  const others = onMap.filter((v) => v.shortlist === null);

  if (view === undefined)
    return (
      <div
        className="grid h-full place-items-center text-label text-ink-3"
        role="status"
      >
        Loading the map…
      </div>
    );

  const cityName = view.city?.name ?? "this city";
  const show = (id: Id<"vendors">) => {
    setSelectedId(id);
    setReveal((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  };
  const move = (id: Id<"vendors">, lat: number, lng: number) => {
    setMoveError(null);
    moveMarker({ eventId, vendorId: id, lat, lng }).catch((error: unknown) =>
      setMoveError(errorMessage(error)),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 md:flex-row">
      <div className="order-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-5 md:order-1 md:w-[22rem] md:flex-none md:border-r md:border-rule md:pt-1">
        <div
          role="group"
          aria-label="Category"
          className="flex flex-wrap gap-1.5"
        >
          <Chip
            selected={category === null}
            onSelectedChange={() => setCategory(null)}
          >
            All
          </Chip>
          {VENDOR_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              selected={category === cat}
              onSelectedChange={(on) => setCategory(on ? cat : null)}
            >
              {CATEGORY_CHIPS[cat]}
            </Chip>
          ))}
        </div>
        {view.functions.length > 0 ? (
          <div
            role="group"
            aria-label="Function"
            className="flex flex-wrap gap-1.5"
          >
            <Chip
              selected={functionKey === null}
              onSelectedChange={() => setFunctionKey(null)}
            >
              Any Function
            </Chip>
            {view.functions.map((fn) => (
              <Chip
                key={fn.key}
                selected={functionKey === fn.key}
                onSelectedChange={(on) => setFunctionKey(on ? fn.key : null)}
              >
                {fn.name}
                {fn.guests !== null ? (
                  <span className="text-ink-3">· {fn.guests}</span>
                ) : null}
              </Chip>
            ))}
          </div>
        ) : null}
        {functionKey !== null ? (
          <p className="text-caption text-ink-3">
            Venues too small for the Guests and Vendors priced above the budget
            line are hidden. Vendors without a comparable Listed price stay,
            marked &ldquo;no price&rdquo;.
          </p>
        ) : null}

        <VendorList
          title="Shortlisted"
          empty="No Shortlisted Vendors match. Add Vendors from their cards in the Chat."
          vendors={shortlisted}
          selectedId={selectedId}
          onShow={show}
        />
        <VendorList
          title={`Others in ${cityName}`}
          empty={`No other Vendors in ${cityName} match.`}
          vendors={others}
          selectedId={selectedId}
          onShow={show}
        />
        <PlainList
          title={`Shortlisted outside ${cityName}`}
          vendors={outside}
          detail={(v) => v.locality}
          note={`outside ${cityName}`}
        />
        <PlainList
          title="Without an address"
          vendors={noAddress}
          detail={(v) => (v.areaServed ? `serves ${v.areaServed}` : null)}
        />
      </div>

      <div className="relative order-1 h-[52dvh] shrink-0 overflow-hidden border-b border-rule md:order-2 md:h-auto md:flex-1 md:border-b-0">
        <MapCanvas
          city={view.city}
          vendors={onMap}
          canMove={view.canMove}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={move}
          reveal={reveal}
        />
        <Legend />
        {moveError ? (
          <p
            role="alert"
            className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-warn-soft px-3 py-1.5 text-label text-warn shadow-overlay"
          >
            {moveError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function VendorList({
  title,
  empty,
  vendors,
  selectedId,
  onShow,
}: {
  title: string;
  empty: string;
  vendors: (MapVendorShown & { noPrice: boolean })[];
  selectedId: Id<"vendors"> | null;
  onShow: (id: Id<"vendors">) => void;
}) {
  const id = `map-list-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="grid gap-1.5">
      <h3 id={id} className="text-label font-semibold text-ink-2">
        {title} <span className="font-normal text-ink-3">{vendors.length}</span>
      </h3>
      {vendors.length === 0 ? (
        <p className="text-caption text-ink-3">{empty}</p>
      ) : (
        <ul className="grid gap-0.5">
          {vendors.map((v) => {
            const tone = toneOf(v);
            return (
              <li key={v._id}>
                <button
                  type="button"
                  data-list-vendor={v._id}
                  aria-pressed={v._id === selectedId}
                  onClick={() => onShow(v._id)}
                  className={cn(
                    "state-layer flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                    "focus-visible:outline-2 focus-visible:outline-focus",
                    v._id === selectedId && "bg-selected",
                  )}
                >
                  <MarkerPin
                    category={v.category}
                    tone={tone}
                    approximate={v.marker.approximate}
                    labelled={false}
                    className="shrink-0 scale-75"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Show on the map: </span>
                    <span className="block truncate text-label font-medium text-ink">
                      {v.name}
                    </span>
                    <span className="block truncate text-caption text-ink-3">
                      {CATEGORY_LABELS[v.category]}
                      {v.locality ? ` · ${v.locality}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {tone !== "other" ? (
                      <span
                        className={cn(
                          "text-caption font-semibold",
                          TONE_CLASS[tone],
                        )}
                      >
                        {TONE_LABELS[tone]}
                      </span>
                    ) : null}
                    {v.marker.approximate ? (
                      <Badge tone="outline">approximate</Badge>
                    ) : null}
                    {v.noPrice ? <Badge tone="outline">no price</Badge> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Vendors listed beside the map but not drawn on it. */
function PlainList({
  title,
  vendors,
  detail,
  note,
}: {
  title: string;
  vendors: Listed[];
  detail: (vendor: Listed) => string | null;
  note?: string;
}) {
  const id = useId();
  if (vendors.length === 0) return null;
  return (
    <section aria-labelledby={id} className="grid gap-1.5">
      <h3 id={id} className="text-label font-semibold text-ink-2">
        {title}
      </h3>
      <ul className="grid gap-1">
        {vendors.map((v) => {
          const tone = toneOf(v);
          const more = detail(v);
          return (
            <li
              key={v._id}
              data-plain-vendor={v._id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-label text-ink-2"
            >
              <CategoryIllustration
                category={v.category}
                className="size-6 shrink-0 text-ink-3"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {v.name}
                </span>
                <span className="block truncate text-caption text-ink-3">
                  {CATEGORY_LABELS[v.category]}
                  {more ? ` · ${more}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {tone !== "other" ? (
                  <span
                    className={cn(
                      "text-caption font-semibold",
                      TONE_CLASS[tone],
                    )}
                  >
                    {TONE_LABELS[tone]}
                  </span>
                ) : null}
                {note ? <Badge tone="outline">{note}</Badge> : null}
                {v.noPrice ? <Badge tone="outline">no price</Badge> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Marker colours"
      className="absolute bottom-9 left-3 hidden flex-wrap gap-x-3 gap-y-1 rounded-md bg-surface/90 px-3 py-2 text-caption text-ink-2 shadow-overlay sm:flex sm:max-w-[30rem]"
    >
      {LEGEND.map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full bg-current",
              TONE_CLASS[tone],
              tone === "other" && "opacity-60",
            )}
          />
          {TONE_LABELS[tone]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-full border-[1.5px] border-dashed border-ink-2"
        />
        Hollow: approximate
      </li>
    </ul>
  );
}
