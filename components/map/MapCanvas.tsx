"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  AttributionControl,
  Marker,
  type MapRef,
} from "react-map-gl/maplibre";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import type { MapVendor, MapView } from "@/convex/map";
import { markerLabel, toneOf } from "./markers";
import { MarkerPin } from "./MarkerPin";
import { buildMapStyle, readMapColours } from "./style";

/*
 * The map itself (MapLibre through react-map-gl), loaded only in the browser.
 * It opens on the Event's city and stays near it, draws our own Markers and
 * lets a Member drag an approximate one into place, or move it with the arrow
 * keys and Enter. With NEXT_PUBLIC_MAP_STYLE_URL set it loads that style
 * instead of ours (ADR 0005).
 */

export type MapVendorShown = MapVendor & {
  marker: NonNullable<MapVendor["marker"]>;
  noPrice: boolean;
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
};

const CITY_ZOOM = 11.6;
const STREET_ZOOM = 15;
/** How far from the city the map may pan, in degrees. */
const CITY_REACH = { lat: 0.45, lng: 0.55 };

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

/** The city's reach, grown to take in every Marker (a Vendor shortlisted from elsewhere). */
function boundsOf(
  centre: { lat: number; lng: number },
  vendors: MapVendorShown[],
): [number, number, number, number] {
  let west = centre.lng - CITY_REACH.lng;
  let east = centre.lng + CITY_REACH.lng;
  let south = centre.lat - CITY_REACH.lat;
  let north = centre.lat + CITY_REACH.lat;
  for (const { marker } of vendors) {
    west = Math.min(west, marker.lng - 0.1);
    east = Math.max(east, marker.lng + 0.1);
    south = Math.min(south, marker.lat - 0.1);
    north = Math.max(north, marker.lat + 0.1);
  }
  return [west, south, east, north];
}

export default function MapCanvas({
  city,
  vendors,
  canMove,
  selectedId,
  onSelect,
  onMove,
  reveal,
}: MapCanvasProps) {
  const mapRef = useRef<MapRef>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  // A Marker being moved with the keyboard, before Enter saves it.
  const [draft, setDraft] = useState<{
    id: Id<"vendors">;
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    // Read the --map-* tokens once the map's element is in the document.
    const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
    setStyle(
      url
        ? url
        : buildMapStyle(readMapColours(holder.current ?? document.body)),
    );
  }, []);

  const centre = centreOf(city, vendors);
  // The opening view and reach are fixed when the map mounts.
  const [initial] = useState(() =>
    centre
      ? {
          view: {
            latitude: centre.lat,
            longitude: centre.lng,
            zoom: CITY_ZOOM,
          },
          bounds: boundsOf(centre, vendors),
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

  if (initial === null)
    return (
      <div className="grid size-full place-items-center bg-surface-high p-6 text-center text-body text-ink-2">
        This Event has no city yet, so there&rsquo;s nowhere to centre the map.
      </div>
    );

  return (
    <div
      ref={holder}
      className="relative size-full"
      data-map-ready={style ? true : undefined}
    >
      {style ? (
        <Map
          ref={mapRef}
          mapStyle={style}
          initialViewState={initial.view}
          maxBounds={initial.bounds}
          minZoom={9.5}
          maxZoom={18}
          dragRotate={false}
          touchPitch={false}
          pitchWithRotate={false}
          attributionControl={false}
          onClick={() => onSelect(null)}
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
                anchor="bottom"
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
                  className="block cursor-pointer rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <MarkerPin
                    category={vendor.category}
                    tone={toneOf(vendor)}
                    approximate={vendor.marker.approximate}
                    selected={selected || draft?.id === vendor._id}
                  />
                </button>
              </Marker>
            );
          })}
        </Map>
      ) : (
        <div className="size-full bg-[var(--map-land)]" />
      )}
      <p id="map-move-hint" className="sr-only">
        Approximate: drag it, or use the arrow keys and then Enter, to put it
        where the Vendor really is. Escape puts it back.
      </p>
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <Button
          variant="tonal"
          size="sm"
          icon
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus />
        </Button>
        <Button
          variant="tonal"
          size="sm"
          icon
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          variant="tonal"
          size="sm"
          icon
          aria-label={`Back to ${city?.name ?? "the city"}`}
          onClick={() =>
            mapRef.current?.flyTo({
              center: [initial.view.longitude, initial.view.latitude],
              zoom: CITY_ZOOM,
              duration: 600,
            })
          }
        >
          <LocateFixed />
        </Button>
      </div>
    </div>
  );
}
