"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import type { FunctionIndex } from "@/components/ui/function-marker";
import { CategoryIllustration } from "@/components/vendors/CategoryIllustration";
import {
  CATEGORY_LABELS,
  VENDOR_CATEGORIES,
  type VendorCategory,
} from "@/components/vendors/cards";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MapHandTypedVendor, MapVendor, MapView } from "@/convex/map";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { budgetLineFor, filterForFunction } from "./filter";
import { placeVendors } from "./placement";
import type { HandTypedPin, MapVendorShown } from "./MapCanvas";
import {
  LEGEND,
  TONE_CLASS,
  TONE_LABELS,
  TONE_TEXT_CLASS,
  toneOf,
} from "./markers";
import { StatusGlyph } from "./MarkerStamp";
import { SectionOrnament } from "@/components/shell/SectionOrnament";

/*
 * The full-screen Vendor map: filters and the list of Vendors beside the map
 * (below it on a phone). Every Vendor with a Marker has a row that shows it on
 * the map and moves focus to its Marker; Vendors without an address are
 * listed here only.
 *
 * The panel is option A, "Rangoli atlas", from the look picked on 27 Oct:
 * Look D's corner pieces, Fraunces headings, the filter chips, a compact key
 * inside the panel (so it never covers the map), Shortlisted and Others lists
 * and a diamond between them. Corner pieces and the diamond follow the
 * Ornaments setting.
 *
 * Hand-typed Vendors (X7) are listed under "Typed in by Members". A Member
 * drops one's Marker with "Drop a Marker" and a click on the map, and moves
 * it the same way or by dragging it (issue #136); the Marker is labelled as
 * placed by a Member and stays private to the Event.
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
  const placeMarker = useMutation(api.map.placeHandTypedMarker);
  const [placing, setPlacing] = useState<Id<"privateVendors"> | null>(null);
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [functionKey, setFunctionKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"vendors"> | null>(null);
  const [reveal, setReveal] = useState<{
    id: Id<"vendors"> | Id<"privateVendors">;
    n: number;
  } | null>(null);
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
  const handTyped = view.handTyped;
  const pins: HandTypedPin[] = handTyped.map((v) => ({
    id: v._id,
    name: v.name,
    category: v.category,
    categoryLabel: v.categoryLabel,
    tone: v.status ?? "considering",
    marker: v.marker,
  }));
  const placingName = handTyped.find((v) => v._id === placing)?.name ?? null;
  const place = (id: Id<"privateVendors">, lat: number, lng: number) => {
    const vendor = handTyped.find((v) => v._id === id);
    setPlacing(null);
    if (!vendor) return;
    setMoveError(null);
    placeMarker({
      eventId,
      privateVendorId: id,
      expectedVersion: vendor.version,
      lat,
      lng,
    }).catch((error: unknown) => setMoveError(errorMessage(error)));
  };
  const move = (id: Id<"vendors">, lat: number, lng: number) => {
    setMoveError(null);
    moveMarker({ eventId, vendorId: id, lat, lng }).catch((error: unknown) =>
      setMoveError(errorMessage(error)),
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 md:flex-row">
      <div className="relative order-2 flex min-h-0 flex-1 flex-col bg-surface-container md:order-1 md:w-[22.5rem] md:flex-none md:border-r md:border-rule">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* The corner pieces scroll with the list, so they never cover a row. */}
          <div className="relative flex min-h-full shrink-0 flex-col gap-3 px-5 pt-3 pb-16 ornaments-off:pb-6">
            <div aria-hidden className="pointer-events-none absolute inset-2.5">
              <SectionOrnament />
            </div>
            <div
              role="group"
              aria-label="Category"
              className="flex flex-wrap gap-1.5 pl-9 ornaments-off:pl-0"
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
                {view.functions.map((fn, i) => (
                  <Chip
                    key={fn.key}
                    selected={functionKey === fn.key}
                    onSelectedChange={(on) =>
                      setFunctionKey(on ? fn.key : null)
                    }
                    functionIndex={((i % 8) + 1) as FunctionIndex}
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
                Venues too small for the Guests and Vendors priced above the
                budget line are hidden. Vendors without a comparable Listed
                price stay, marked &ldquo;no price&rdquo;.
              </p>
            ) : null}

            <MapKey />

            <VendorList
              title="Shortlisted"
              empty="No Shortlisted Vendors match. Add Vendors from their cards in the Chat."
              vendors={shortlisted}
              selectedId={selectedId}
              onShow={show}
            />
            <DiamondRule />
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
            <HandTypedList
              vendors={handTyped}
              canPlace={view.canMove && view.city?.centre != null}
              placing={placing}
              onPlace={(id) => setPlacing((p) => (p === id ? null : id))}
              onShow={(id) => setReveal((r) => ({ id, n: (r?.n ?? 0) + 1 }))}
            />
            <PlainList
              title="Without an address"
              vendors={noAddress}
              detail={(v) => (v.areaServed ? `serves ${v.areaServed}` : null)}
            />
          </div>
        </div>
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
          handTyped={pins}
          placing={placing}
          onPlace={place}
          onCancelPlace={() => setPlacing(null)}
        />
        {placingName ? (
          <p
            role="status"
            className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md bg-surface-container px-3 py-1.5 text-label text-ink shadow-overlay"
          >
            Click the map where {placingName} is, or move the Marker with the
            arrow keys and press Enter.
          </p>
        ) : null}
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
      <h3
        id={id}
        className="font-display text-[15px] leading-tight font-medium text-ink"
      >
        {title}{" "}
        <span className="ml-1 font-text text-[13px] font-normal text-ink-3">
          {vendors.length}
        </span>
      </h3>
      {vendors.length === 0 ? (
        <p className="text-caption text-ink-3">{empty}</p>
      ) : (
        <ul className="grid gap-0.5">
          {vendors.map((v) => {
            const tone = toneOf(v);
            const faint = tone === "other";
            const approximate = v.marker.approximate;
            const selected = v._id === selectedId;
            return (
              <li key={v._id}>
                <button
                  type="button"
                  data-list-vendor={v._id}
                  aria-pressed={selected}
                  onClick={() => onShow(v._id)}
                  className={cn(
                    "state-layer relative flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2 text-left",
                    faint ? "py-1" : "py-1.5",
                    "focus-visible:outline-2 focus-visible:outline-focus",
                    selected && "bg-selected",
                  )}
                >
                  {selected ? (
                    // The selected row's edge in its status colour.
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-0 left-0 w-[3px] bg-current",
                        TONE_CLASS[tone],
                      )}
                    />
                  ) : null}
                  <span className="grid w-7 shrink-0 place-items-center">
                    <StatusGlyph
                      tone={tone}
                      approximate={approximate}
                      size={faint ? 14 : 24}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Show on the map: </span>
                    <span
                      className={cn(
                        "block truncate font-medium",
                        faint
                          ? "text-[13.5px] text-ink-2"
                          : "text-[14.5px] text-ink",
                      )}
                    >
                      {v.name}
                    </span>
                    <span className="block truncate text-caption text-ink-2">
                      {CATEGORY_LABELS[v.category]}
                      {v.locality
                        ? ` · ${approximate ? "around " : ""}${v.locality}`
                        : ""}
                      {approximate ? (
                        <span className="sr-only">, approximate</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {!faint ? (
                      <span
                        className={cn(
                          "text-caption font-semibold",
                          TONE_TEXT_CLASS[tone],
                        )}
                      >
                        {TONE_LABELS[tone]}
                      </span>
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

/** The Event's hand-typed Vendors, with "Drop a Marker" for a Member. */
function HandTypedList({
  vendors,
  canPlace,
  placing,
  onPlace,
  onShow,
}: {
  vendors: MapHandTypedVendor[];
  canPlace: boolean;
  placing: Id<"privateVendors"> | null;
  onPlace: (id: Id<"privateVendors">) => void;
  onShow: (id: Id<"privateVendors">) => void;
}) {
  const id = useId();
  if (vendors.length === 0) return null;
  return (
    <section aria-labelledby={id} className="grid gap-1.5">
      <h3
        id={id}
        className="font-display text-[15px] leading-tight font-medium text-ink"
      >
        Typed in by Members{" "}
        <span className="ml-1 font-text text-[13px] font-normal text-ink-3">
          {vendors.length}
        </span>
      </h3>
      <ul className="grid gap-1">
        {vendors.map((v) => {
          const tone = v.status ?? "considering";
          return (
            <li
              key={v._id}
              data-hand-typed-vendor={v._id}
              className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-label text-ink-2"
            >
              <span className="grid w-7 shrink-0 place-items-center">
                <StatusGlyph tone={tone} approximate={false} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {v.name}
                </span>
                <span className="block truncate text-caption text-ink-3">
                  {v.categoryLabel}
                  {v.area ? ` · ${v.area}` : ""}
                </span>
                {/* Its own line, so it is never cut short on a phone. */}
                <span className="block text-caption text-ink-3">
                  {v.marker ? "Marker placed by a Member" : "No Marker yet"}
                </span>
              </span>
              {v.marker ? (
                <Button
                  size="sm"
                  variant="text"
                  className="shrink-0"
                  aria-label={`Show on the map: ${v.name}`}
                  onClick={() => onShow(v._id)}
                >
                  Show
                </Button>
              ) : null}
              {canPlace ? (
                <Button
                  size="sm"
                  className="shrink-0"
                  variant={placing === v._id ? "filled" : "tonal"}
                  aria-pressed={placing === v._id}
                  aria-label={`${v.marker ? "Move the Marker" : "Drop a Marker"}: ${v.name}`}
                  onClick={() => onPlace(v._id)}
                >
                  {placing === v._id
                    ? "Cancel"
                    : v.marker
                      ? "Move"
                      : "Drop a Marker"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
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
      <h3
        id={id}
        className="font-display text-[15px] leading-tight font-medium text-ink"
      >
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
                      TONE_TEXT_CLASS[tone],
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

/**
 * The compact key, inside the panel so it never covers the map: each status's
 * shape and colour, and what a hollow shape means.
 */
function MapKey() {
  return (
    <ul
      aria-label="Marker key"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-low px-2.5 py-2 text-caption text-ink-2"
    >
      {LEGEND.map((tone) => (
        <li key={tone} className="flex items-center gap-1">
          <StatusGlyph tone={tone} approximate={tone === "other"} size={13} />
          {TONE_LABELS[tone]}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <StatusGlyph
          tone="considering"
          approximate
          size={13}
          className="text-ink-2"
        />
        hollow = approximate
      </li>
    </ul>
  );
}

/** A rule with Look D's diamond between the lists; the diamond is an ornament. */
function DiamondRule() {
  return (
    <div aria-hidden className="flex items-center gap-2.5 px-1 pt-1">
      <span className="h-px flex-1 bg-rule" />
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        data-ornament="diamond"
        className="ornaments-off:hidden"
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
      </svg>
      <span className="h-px flex-1 bg-rule ornaments-off:hidden" />
    </div>
  );
}
