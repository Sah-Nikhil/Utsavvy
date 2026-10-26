import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

/*
 * The Vendor map's own style (IMPLEMENTATION_PLAN.md section 7.5): OpenFreeMap's
 * vector tiles (OpenMapTiles schema) drawn with a short list of our own layers,
 * in colours read from the --map-* tokens. Warm paper land, a soft water tint,
 * parks a shade off the land, muted roads with the major ones a little
 * stronger, faint buildings at close zoom and quiet labels on a paper halo.
 *
 * No points of interest and no sprite, so the only symbols on the map are our
 * Markers. Labels read the Latin name fields, because MapLibre can't shape
 * Devanagari. Built in the browser, so every colour stays in the token files:
 * this file must never hold a colour of its own.
 */

/** Each map colour and the token it comes from. */
export const MAP_TOKENS = {
  land: "--map-land",
  water: "--map-water",
  park: "--map-park",
  road: "--map-road",
  roadMajor: "--map-road-major",
  building: "--map-building",
  label: "--map-label",
  labelHalo: "--map-label-halo",
  boundary: "--map-boundary",
} as const;

export type MapColours = Record<keyof typeof MAP_TOKENS, string>;

/** The --map-* token values, read from the document's computed style when the map mounts. */
export function readMapColours(element: Element): MapColours {
  const computed = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(MAP_TOKENS).map(([key, token]) => [
      key,
      computed.getPropertyValue(token).trim(),
    ]),
  ) as MapColours;
}

export const OPENFREEMAP_SOURCE = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_GLYPHS =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** OpenFreeMap's own credit line, so it shows even before its TileJSON loads. */
export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const SOURCE = "openmaptiles";
const FONT = ["Noto Sans Regular"];

/** A Latin label: the English name where OpenStreetMap has one, else the transliteration. */
const LATIN_NAME: ExpressionSpecification = [
  "coalesce",
  ["get", "name_en"],
  ["get", "name:latin"],
];

/** Grows a width with zoom, roughly doubling every zoom level at street scale. */
function width(stops: [number, number][]): ExpressionSpecification {
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    ...stops.flat(),
  ] as ExpressionSpecification;
}

const MAJOR_ROADS = ["motorway", "trunk", "primary"];
const MINOR_ROADS = ["secondary", "tertiary", "minor", "service"];

export function buildMapStyle(colours: MapColours): StyleSpecification {
  const label = {
    "text-color": colours.label,
    "text-halo-color": colours.labelHalo,
    "text-halo-width": 1.4,
    "text-halo-blur": 0.4,
  };

  const layers: LayerSpecification[] = [
    {
      id: "land",
      type: "background",
      paint: { "background-color": colours.land },
    },
    {
      id: "park",
      type: "fill",
      source: SOURCE,
      "source-layer": "park",
      paint: { "fill-color": colours.park },
    },
    {
      id: "landcover",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["wood", "grass", "farmland"]],
      ],
      paint: { "fill-color": colours.park, "fill-opacity": 0.55 },
    },
    {
      id: "water",
      type: "fill",
      source: SOURCE,
      "source-layer": "water",
      paint: { "fill-color": colours.water },
    },
    {
      id: "waterway",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      paint: {
        "line-color": colours.water,
        "line-width": width([
          [10, 0.6],
          [16, 3],
        ]),
      },
    },
    {
      id: "building",
      type: "fill",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": colours.building,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, 0.7],
      },
    },
    {
      id: "boundary",
      type: "line",
      source: SOURCE,
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 4],
      paint: {
        "line-color": colours.boundary,
        "line-width": 1,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["in", ["get", "class"], ["literal", MINOR_ROADS]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colours.road,
        "line-width": width([
          [11, 0.5],
          [14, 2],
          [18, 12],
        ]),
      },
    },
    {
      id: "road-major",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", MAJOR_ROADS]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colours.roadMajor,
        "line-width": width([
          [8, 0.8],
          [12, 2.4],
          [14, 4],
          [18, 18],
        ]),
      },
    },
    {
      id: "label-water",
      type: "symbol",
      source: SOURCE,
      "source-layer": "water_name",
      layout: {
        "text-field": LATIN_NAME,
        "text-font": FONT,
        "text-size": 12,
      },
      paint: label,
    },
    {
      id: "label-road",
      type: "symbol",
      source: SOURCE,
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": LATIN_NAME,
        "text-font": FONT,
        "text-size": 11,
      },
      paint: label,
    },
    {
      id: "label-place",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      filter: [
        "in",
        ["get", "class"],
        [
          "literal",
          ["city", "town", "village", "suburb", "quarter", "neighbourhood"],
        ],
      ],
      layout: {
        "text-field": LATIN_NAME,
        "text-font": FONT,
        "text-size": [
          "match",
          ["get", "class"],
          ["city", "town"],
          15,
          ["suburb", "quarter"],
          12.5,
          11.5,
        ],
        "text-max-width": 8,
      },
      paint: label,
    },
  ];

  return {
    version: 8,
    name: "Utsavvy",
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      [SOURCE]: {
        type: "vector",
        url: OPENFREEMAP_SOURCE,
        attribution: OPENFREEMAP_ATTRIBUTION,
      },
    },
    layers,
  };
}
