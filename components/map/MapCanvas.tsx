"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  setWorkerUrl,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  AttributionControl,
  Marker,
  type MapRef,
} from "react-map-gl/maplibre";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { MapVendor, MapView } from "@/convex/map";
import {
  approximateTag,
  markerLabel,
  toneOf,
  TONE_LABELS,
  type MarkerTone,
} from "./markers";
import { MarkerStamp } from "./MarkerStamp";
import {
  footprintImage,
  isMapPattern,
  MARKER_FOOTPRINT,
  patternImage,
} from "./patterns";
import { cityBounds, fitPadding, openingFit } from "./placement";
import {
  buildMapStyle,
  readMapColours,
  type MapColours,
  type MarkerPoint,
} from "./style";

/*
 * The map itself (MapLibre through react-map-gl), loaded only in the browser.
 * It opens on the Event's city and stays near it, draws our own Markers and
 * lets a Member drag an approximate one into place, or move it with the arrow
 * keys and Enter. With NEXT_PUBLIC_MAP_STYLE_URL set it loads that style
 * instead of ours (ADR 0005). The printed look follows the Ornaments setting:
 * with it off the map is redrawn without its prints.
 */

// MapLibre looks for its worker next to its own module, which the bundler
// moves; point it at the worker file the bundler emits instead.
setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
);

export type MapVendorShown = MapVendor & {
  marker: NonNullable<MapVendor["marker"]>;
  noPrice: boolean;
};

/** A hand-typed Vendor's Marker, which a Member dropped (issue #136). */
export type HandTypedPin = {
  id: Id<"privateVendors">;
  name: string;
  category: string;
  categoryLabel: string;
  tone: MarkerTone;
  marker: { lat: number; lng: number } | null;
};

export type MapCanvasProps = {
  city: MapView["city"];
  vendors: MapVendorShown[];
  canMove: boolean;
  selectedId: Id<"vendors"> | null;
  onSelect: (id: Id<"vendors"> | null) => void;
  onMove: (id: Id<"vendors">, lat: number, lng: number) => void;
  /** Fly to this Vendor's Marker and focus it; `n` repeats the same request. */
  reveal: { id: Id<"vendors">; n: number } | null;
  /** The Event's hand-typed Vendors; those with a Marker are drawn. */
  handTyped?: HandTypedPin[];
  /** The hand-typed Vendor whose Marker the next click on the map drops. */
  placing?: Id<"privateVendors"> | null;
  /** Drops or moves a hand-typed Vendor's Marker. */
  onPlace?: (id: Id<"privateVendors">, lat: number, lng: number) => void;
};

const STREET_ZOOM = 15;
/** From this zoom on, approximate Markers write "approximate" under themselves. */
const TAG_ZOOM = 14;
/** The opening view never comes closer than this, so it reads as the city. */
const CITY_MAX_ZOOM = 12.5;

/** The city's name in Devanagari for the cartouche, where we know it. */
const CITY_NAMES_HI: Record<string, string> = {
  Jaipur: "जयपुर",
  Pune: "पुणे",
};

/** Whether this page shows ornaments (lib/ornaments.ts marks <html> when off). */
function ornamentsOn(): boolean {
  return document.documentElement.dataset.ornaments !== "off";
}

/**
 * Adds the images the style asks for: the printed patterns, drawn in the
 * token colours, and the Markers' transparent footprint.
 */
function addImages(map: MapLibreMap, colours: MapColours) {
  const add = (id: string) => {
    if (map.hasImage(id)) return;
    // Drawn at least at 2x, so the small prints stay crisp on any screen.
    const ratio = Math.max(2, Math.round(window.devicePixelRatio || 1));
    if (id === MARKER_FOOTPRINT.id)
      map.addImage(id, footprintImage(ratio), { pixelRatio: ratio });
    else if (isMapPattern(id))
      map.addImage(id, patternImage(id, colours, ratio), { pixelRatio: ratio });
  };
  map.on("styleimagemissing", (e) => add(e.id));
  for (const id of ["map-butta", "map-leaf", "map-lahar", MARKER_FOOTPRINT.id])
    add(id);
}

const GEOAPIFY_ATTRIBUTION =
  'Geocoding by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a>';

/** Where the map opens: the city's centre, else the middle of the Markers. */
function centreOf(
  city: MapView["city"],
  vendors: MapVendorShown[],
): { lat: number; lng: number } | null {
  if (city?.centre) return city.centre;
  if (vendors.length === 0) return null;
  const sum = vendors.reduce(
    (acc, v) => ({ lat: acc.lat + v.marker.lat, lng: acc.lng + v.marker.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / vendors.length, lng: sum.lng / vendors.length };
}

export default function MapCanvas({
  city,
  vendors,
  canMove,
  selectedId,
  onSelect,
  onMove,
  reveal,
  handTyped = [],
  placing = null,
  onPlace,
}: MapCanvasProps) {
  const mapRef = useRef<MapRef>(null);
  const holder = useRef<HTMLDivElement>(null);
  // Our style's inputs (or a whole style URL), set once the map mounts.
  const [look, setLook] = useState<
    { colours: MapColours; ornaments: boolean } | { url: string } | null
  >(null);
  const [street, setStreet] = useState(false);
  const [padding, setPadding] = useState(() => fitPadding(1024));
  // A Marker being moved with the keyboard, before Enter saves it.
  const [draft, setDraft] = useState<{
    id: Id<"vendors">;
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    // Read the map tokens once the map's element is in the document.
    const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
    const colours = readMapColours(holder.current ?? document.body);
    const build = () => {
      setPadding(fitPadding(holder.current?.clientWidth ?? 1024));
      setLook(url ? { url } : { colours, ornaments: ornamentsOn() });
    };
    build();
    if (url) return;
    // Turning ornaments off or on redraws the map with or without its prints.
    const watch = new MutationObserver(build);
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ornaments"],
    });
    return () => watch.disconnect();
  }, []);

  // The Markers drawn, where they stand now, for their footprints in the
  // style; MapLibre hides any label that would cross one.
  const points = useMemo<MarkerPoint[]>(
    () =>
      vendors.map((v) => {
        const at = draft?.id === v._id ? draft : v.marker;
        return {
          id: v._id,
          lat: at.lat,
          lng: at.lng,
          faint: v.shortlist === null,
        };
      }),
    [vendors, draft],
  );
  const style = useMemo<StyleSpecification | string | null>(() => {
    if (look === null) return null;
    if ("url" in look) return look.url;
    return buildMapStyle(look.colours, { ornaments: look.ornaments, points });
  }, [look, points]);

  const centre = centreOf(city, vendors);
  // The opening view and reach are fixed when the map mounts.
  const [initial] = useState(() =>
    centre
      ? {
          fit: openingFit(centre, vendors),
          bounds: cityBounds(centre),
        }
      : null,
  );

  useEffect(() => {
    if (reveal === null) return;
    const vendor = vendors.find((v) => v._id === reveal.id);
    if (!vendor) return;
    const map = mapRef.current;
    map?.flyTo({
      center: [vendor.marker.lng, vendor.marker.lat],
      zoom: Math.max(map.getZoom(), STREET_ZOOM - 1),
      duration: 700,
    });
    holder.current
      ?.querySelector<HTMLButtonElement>(`[data-marker-id="${reveal.id}"]`)
      ?.focus({ preventScroll: true });
    // Only a new request moves the map, not new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  const ordered = useMemo(
    // Faint Markers under Shortlisted ones, the selected one on top.
    () =>
      [...vendors].sort(
        (a, b) =>
          Number(a.shortlist !== null) - Number(b.shortlist !== null) ||
          Number(a._id === selectedId) - Number(b._id === selectedId),
      ),
    [vendors, selectedId],
  );

  function nudge(
    vendor: MapVendorShown,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const map = mapRef.current;
    if (!map) return;
    const step = event.shiftKey ? 60 : 12;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const current =
      draft?.id === vendor._id
        ? draft
        : { id: vendor._id, lat: vendor.marker.lat, lng: vendor.marker.lng };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key]!;
      const point = map.project([current.lng, current.lat]);
      const moved = map.unproject([point.x + dx, point.y + dy]);
      setDraft({ id: vendor._id, lat: moved.lat, lng: moved.lng });
    } else if (event.key === "Enter" && draft?.id === vendor._id) {
      event.preventDefault();
      onMove(vendor._id, draft.lat, draft.lng);
      setDraft(null);
    } else if (event.key === "Escape" && draft?.id === vendor._id) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  }

  const fit = { padding, maxZoom: CITY_MAX_ZOOM };

  if (initial === null)
    return (
      <div className="grid size-full place-items-center bg-surface-high p-6 text-center text-body text-ink-2">
        This Event has no city yet, so there&rsquo;s nowhere to centre the map.
      </div>
    );

  return (
    <div
      ref={holder}
      className={cn(
        "relative size-full",
        // The credits on a quiet sand panel, in the panel's own type.
        "[&_.maplibregl-ctrl-attrib]:rounded-tl-md [&_.maplibregl-ctrl-attrib]:bg-surface-container/90! [&_.maplibregl-ctrl-attrib]:px-2! [&_.maplibregl-ctrl-attrib]:text-[11px] [&_.maplibregl-ctrl-attrib]:text-ink-2 [&_.maplibregl-ctrl-attrib_a]:text-ink-2!",
      )}
      data-map-ready={style ? true : undefined}
    >
      {/* A slightly uneven, hand-pressed edge for the stamped Markers. */}
      <svg aria-hidden className="absolute size-0">
        <filter id="map-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={7}
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale={1.6}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      {style ? (
        <Map
          ref={mapRef}
          mapStyle={style}
          initialViewState={{ bounds: initial.fit, fitBoundsOptions: fit }}
          maxBounds={initial.bounds}
          minZoom={9.5}
          maxZoom={18}
          dragRotate={false}
          touchPitch={false}
          pitchWithRotate={false}
          attributionControl={false}
          onClick={(e) => {
            if (placing !== null && onPlace) {
              onPlace(placing, e.lngLat.lat, e.lngLat.lng);
              return;
            }
            onSelect(null);
          }}
          cursor={placing !== null ? "crosshair" : undefined}
          onLoad={(e) => {
            if (look && "colours" in look) addImages(e.target, look.colours);
          }}
          onZoom={(e) => setStreet(e.viewState.zoom >= TAG_ZOOM)}
          style={{ width: "100%", height: "100%" }}
        >
          <AttributionControl
            position="bottom-right"
            compact={false}
            customAttribution={GEOAPIFY_ATTRIBUTION}
          />
          {ordered.map((vendor) => {
            const at = draft?.id === vendor._id ? draft : vendor.marker;
            const movable = canMove && vendor.marker.approximate;
            const selected = vendor._id === selectedId;
            return (
              <Marker
                key={vendor._id}
                latitude={at.lat}
                longitude={at.lng}
                anchor="center"
                draggable={movable}
                onDragEnd={(e) =>
                  onMove(vendor._id, e.lngLat.lat, e.lngLat.lng)
                }
              >
                <button
                  type="button"
                  data-marker-id={vendor._id}
                  aria-label={markerLabel(vendor, { noPrice: vendor.noPrice })}
                  aria-pressed={selected}
                  aria-describedby={movable ? "map-move-hint" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected ? null : vendor._id);
                  }}
                  onKeyDown={movable ? (e) => nudge(vendor, e) : undefined}
                  className="group/stamp block cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <MarkerStamp
                    category={vendor.category}
                    tone={toneOf(vendor)}
                    approximate={vendor.marker.approximate}
                    selected={selected || draft?.id === vendor._id}
                    tag={approximateTag({
                      approximate: vendor.marker.approximate,
                      street,
                      faint: vendor.shortlist === null,
                    })}
                  />
                </button>
              </Marker>
            );
          })}
          {handTyped.map((pin) =>
            pin.marker === null ? null : (
              <Marker
                key={pin.id}
                latitude={pin.marker.lat}
                longitude={pin.marker.lng}
                anchor="center"
                draggable={canMove && onPlace !== undefined}
                onDragEnd={(e) => onPlace?.(pin.id, e.lngLat.lat, e.lngLat.lng)}
              >
                <span
                  role="img"
                  data-hand-typed-marker={pin.id}
                  aria-label={`${pin.name}, ${pin.categoryLabel}, ${TONE_LABELS[pin.tone]}, Marker placed by a Member`}
                  className="block"
                >
                  <MarkerStamp
                    category={pin.category}
                    tone={pin.tone}
                    approximate={false}
                    tag="none"
                  />
                </span>
              </Marker>
            ),
          )}
        </Map>
      ) : (
        <div className="size-full bg-[var(--map-land)]" />
      )}
      <p id="map-move-hint" className="sr-only">
        Approximate: drag it, or use the arrow keys and then Enter, to put it
        where the Vendor really is. Escape puts it back.
      </p>
      <Cartouche city={city?.name ?? null} count={vendors.length} />
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <Button
          variant="tonal"
          size="sm"
          icon
          className={CONTROL}
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus />
        </Button>
        <Button
          variant="tonal"
          size="sm"
          icon
          className={CONTROL}
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          variant="tonal"
          size="sm"
          icon
          className={CONTROL}
          aria-label={`Back to ${city?.name ?? "the city"}`}
          onClick={() =>
            mapRef.current?.fitBounds(initial.fit, { ...fit, duration: 600 })
          }
        >
          <LocateFixed />
        </Button>
      </div>
    </div>
  );
}

const CONTROL =
  "bg-surface-container text-action shadow-overlay hover:bg-surface-high";

/** The city's name over the map, as on an atlas page (desktop only). */
function Cartouche({ city, count }: { city: string | null; count: number }) {
  if (city === null) return null;
  const hi = CITY_NAMES_HI[city];
  return (
    <div className="pointer-events-none absolute top-3 left-4 hidden rounded-md bg-surface-container/90 px-4 pt-2 pb-2.5 shadow-overlay md:block">
      <p className="font-display text-[21px] leading-none font-medium text-ink italic">
        {city}
        {hi ? (
          <span
            lang="hi"
            className="ml-2 font-display-hi text-[17px] text-motif-2 not-italic"
          >
            {hi}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-[11.5px] tracking-[0.02em] text-ink-2">
        {count === 1 ? "1 Vendor" : `${count} Vendors`} on the map
      </p>
    </div>
  );
}
