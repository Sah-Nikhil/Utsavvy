import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

/*
 * The Vendor map's own style (IMPLEMENTATION_PLAN.md section 7.5): OpenFreeMap's
 * vector tiles (OpenMapTiles schema) drawn with a short list of our own layers,
 * in colours read from the map tokens.
 *
 * The look Sah-Nikhil picked on 27 Oct is a Jaipur block print on the sand
 * ground: a faint butta printed on the land, a leaf print on parks, lahariya
 * waves on water, major roads inked in terracotta with a white road inside,
 * faint buildings at close zoom and quiet umber labels on a sand halo. The
 * prints are ornaments: with the Ornaments setting off they go, and parks and
 * water keep their flat colours. The patterns are drawn in patterns.ts.
 *
 * No points of interest and no sprite, so the only symbols on the map are our
 * Markers. Labels read the Latin name fields, because MapLibre can't shape
 * Devanagari. Built in the browser, so every colour stays in the token files:
 * this file must never hold a colour of its own.
 */

/** Each map colour and the token it comes from. */
export const MAP_TOKENS = {
  land: "--map-land",
  butta: "--map-print-butta",
  park: "--map-print-park",
  leaf: "--map-print-leaf",
  water: "--map-print-water",
  wave: "--map-print-wave",
  road: "--map-road",
  building: "--map-print-building",
  ink: "--map-print-ink",
  label: "--map-print-label",
  labelHalo: "--map-label-halo",
} as const;

export type MapColours = Record<keyof typeof MAP_TOKENS, string>;

/** The map token values, read from the document's computed style when the map mounts. */
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
const ITALIC = ["Noto Sans Italic"];

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
const MID_ROADS = ["secondary", "tertiary"];
const MINOR_ROADS = ["minor", "service"];

type Layer = LayerSpecification;

/** A vector-tile layer, written without its source. */
type TileLayer = Layer extends infer L
  ? L extends { source: string }
    ? Omit<L, "source">
    : never
  : never;

/** A layer drawn from OpenFreeMap's vector source. */
function tiles(layer: TileLayer): Layer {
  return { ...layer, source: SOURCE } as Layer;
}

const ROUND = { "line-cap": "round", "line-join": "round" } as const;

export function buildMapStyle(
  colours: MapColours,
  { ornaments = true }: { ornaments?: boolean } = {},
): StyleSpecification {
  const label = {
    "text-color": colours.label,
    "text-halo-color": colours.labelHalo,
    "text-halo-width": 1.4,
    "text-halo-blur": 0.4,
  };
  // A print where ornaments are on, the flat colour where they're off.
  const fill = (pattern: string, colour: string) =>
    ornaments ? { "fill-pattern": pattern } : { "fill-color": colour };

  const layers: Layer[] = [
    {
      id: "land",
      type: "background",
      paint: { "background-color": colours.land },
    },
    ...(ornaments
      ? [
          {
            id: "butta",
            type: "background",
            paint: { "background-pattern": "map-butta" },
          } satisfies Layer,
        ]
      : []),
    tiles({
      id: "landcover",
      type: "fill",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]],
      paint: { ...fill("map-leaf", colours.park), "fill-opacity": 0.75 },
    }),
    tiles({
      id: "park",
      type: "fill",
      "source-layer": "park",
      paint: fill("map-leaf", colours.park),
    }),
    tiles({
      id: "water",
      type: "fill",
      "source-layer": "water",
      paint: fill("map-lahar", colours.water),
    }),
    tiles({
      id: "water-edge",
      type: "line",
      "source-layer": "water",
      paint: { "line-color": colours.wave, "line-width": 1 },
    }),
    tiles({
      id: "waterway",
      type: "line",
      "source-layer": "waterway",
      paint: {
        "line-color": colours.wave,
        "line-width": width([
          [10, 0.8],
          [16, 3.5],
        ]),
      },
    }),
    tiles({
      id: "building",
      type: "fill",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": colours.building,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          15.5,
          0.85,
        ],
      },
    }),
    tiles({
      id: "boundary",
      type: "line",
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 4],
      paint: {
        "line-color": colours.ink,
        "line-opacity": 0.5,
        "line-width": 1,
        "line-dasharray": [5, 2, 1, 2],
      },
    }),
    tiles({
      id: "road-minor",
      type: "line",
      "source-layer": "transportation",
      minzoom: 12.5,
      filter: ["in", ["get", "class"], ["literal", MINOR_ROADS]],
      layout: ROUND,
      paint: {
        "line-color": colours.road,
        "line-width": width([
          [12.5, 0.6],
          [14, 2],
          [18, 12],
        ]),
      },
    }),
    tiles({
      id: "road-mid-edge",
      type: "line",
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["in", ["get", "class"], ["literal", MID_ROADS]],
      layout: ROUND,
      paint: {
        "line-color": colours.butta,
        "line-width": width([
          [11, 2],
          [14, 5],
          [18, 18],
        ]),
      },
    }),
    tiles({
      id: "road-mid",
      type: "line",
      "source-layer": "transportation",
      minzoom: 9.5,
      filter: ["in", ["get", "class"], ["literal", MID_ROADS]],
      layout: ROUND,
      paint: {
        "line-color": colours.road,
        "line-width": width([
          [9.5, 0.6],
          [12, 1.4],
          [14, 3],
          [18, 14],
        ]),
      },
    }),
    tiles({
      id: "road-major-ink",
      type: "line",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", MAJOR_ROADS]],
      layout: ROUND,
      paint: {
        "line-color": colours.ink,
        "line-width": width([
          [8, 2.4],
          [12, 4.4],
          [14, 7],
          [18, 22],
        ]),
      },
    }),
    tiles({
      id: "road-major",
      type: "line",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", MAJOR_ROADS]],
      layout: ROUND,
      paint: {
        "line-color": colours.road,
        "line-width": width([
          [8, 1],
          [12, 2.4],
          [14, 4.4],
          [18, 18],
        ]),
      },
    }),
    tiles({
      id: "label-water",
      type: "symbol",
      "source-layer": "water_name",
      layout: {
        "text-field": LATIN_NAME,
        "text-font": ITALIC,
        "text-size": 12,
        "text-letter-spacing": 0.05,
      },
      paint: label,
    }),
    tiles({
      id: "label-road",
      type: "symbol",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": LATIN_NAME,
        "text-font": FONT,
        "text-size": 11,
      },
      paint: label,
    }),
    tiles({
      id: "label-place",
      type: "symbol",
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
          14,
          ["suburb", "quarter"],
          12,
          11.5,
        ],
        "text-max-width": 8,
        // Keep a label clear of the map's edges rather than cut by them.
        "text-padding": 6,
        "symbol-avoid-edges": true,
      },
      paint: label,
    }),
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
