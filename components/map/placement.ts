/*
 * Where the Vendor map may go and what it draws (issue #48: "centres on the
 * Event's city and stays zoomed to it"). The map is held to the city's reach;
 * a Vendor shortlisted from another city is listed beside the map as outside
 * it, never drawn by widening the map. Pure, so it's tested without the map.
 */

type Point = { lat: number; lng: number };

/** How far from the city's centre the map may pan, in degrees. */
export const CITY_REACH = { lat: 0.45, lng: 0.55 };

/** The map's bounds around the city, as [west, south, east, north]. */
export function cityBounds(centre: Point): [number, number, number, number] {
  return [
    centre.lng - CITY_REACH.lng,
    centre.lat - CITY_REACH.lat,
    centre.lng + CITY_REACH.lng,
    centre.lat + CITY_REACH.lat,
  ];
}

/**
 * The opening view: centred on the city and wide enough for every Marker
 * within its reach (one beyond it doesn't widen the view).
 */
export function openingFit(
  centre: Point,
  vendors: readonly { marker: Point }[],
): [number, number, number, number] {
  let lat = 0.04;
  let lng = 0.04;
  for (const { marker } of vendors) {
    const dLat = Math.abs(marker.lat - centre.lat);
    const dLng = Math.abs(marker.lng - centre.lng);
    if (dLat > CITY_REACH.lat || dLng > CITY_REACH.lng) continue;
    lat = Math.max(lat, dLat);
    lng = Math.max(lng, dLng);
  }
  return [
    centre.lng - lng,
    centre.lat - lat,
    centre.lng + lng,
    centre.lat + lat,
  ];
}

type Placeable = { marker: Point | null; inCity: boolean };

/**
 * Splits the Vendors into those drawn on the map, those listed as outside the
 * Event's city and those without an address. With no city to stay on
 * (`hasCity` false) every Marker is drawn.
 */
export function placeVendors<V extends Placeable>(
  vendors: readonly V[],
  hasCity: boolean,
): {
  onMap: (V & { marker: Point })[];
  outside: (V & { marker: Point })[];
  noAddress: V[];
} {
  const onMap: (V & { marker: Point })[] = [];
  const outside: (V & { marker: Point })[] = [];
  const noAddress: V[] = [];
  for (const vendor of vendors) {
    if (vendor.marker === null) noAddress.push(vendor);
    else if (vendor.inCity || !hasCity)
      onMap.push(vendor as V & { marker: Point });
    else outside.push(vendor as V & { marker: Point });
  }
  return { onMap, outside, noAddress };
}

/**
 * The space the opening view keeps around the Markers, in pixels, for a map
 * `width` pixels wide: clear of the zoom buttons down the right edge, the
 * credits along the bottom (two lines on a phone), the city's cartouche at
 * the top left on a desktop, and wide enough that a selected Marker's petals
 * and its "approximate" tag stay inside the map.
 */
export function fitPadding(width: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (width < 640) return { top: 40, right: 60, bottom: 52, left: 40 };
  return { top: 92, right: 64, bottom: 44, left: 48 };
}
