import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_PATTERNS, MARKER_FOOTPRINT } from "./patterns";
import {
  buildMapStyle,
  MAP_TOKENS,
  VENDOR_FOOTPRINTS,
  type MapColours,
} from "./style";

// S15 (issue #48): the Vendor map's own style, built from the map tokens
// (IMPLEMENTATION_PLAN.md section 7.5). Since 27 Oct it is option B's printed
// map on option A's sand ground: butta on the land, leaf print on parks,
// lahariya waves on water and inked roads. With Ornaments off the prints go
// and the flat colours stay.

// Distinct made-up values, one per token, so a colour that isn't one of them
// (or is the wrong one) shows up.
const COLOURS: MapColours = {
  land: "token-1",
  butta: "token-2",
  park: "token-3",
  leaf: "token-4",
  water: "token-5",
  wave: "token-6",
  road: "token-7",
  building: "token-8",
  ink: "token-9",
  label: "token-10",
  labelHalo: "token-11",
};
const ALLOWED = new Set(Object.values(COLOURS));

const printed = buildMapStyle(COLOURS);
const flat = buildMapStyle(COLOURS, { ornaments: false });

/** Every string literal in a paint value, skipping each expression's operator. */
function literals(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  const [head, ...rest] = value as unknown[];
  const args = typeof head === "string" ? rest : value;
  return (args as unknown[]).flatMap(literals);
}

type Style = ReturnType<typeof buildMapStyle>;

/** Every paint property of every layer, as [layer id, property, value]. */
function paints(style: Style) {
  return style.layers.flatMap((layer) =>
    Object.entries(("paint" in layer ? layer.paint : undefined) ?? {}).map(
      ([property, value]) => ({ layer: layer.id, property, value }),
    ),
  );
}

function paintOf(style: Style, id: string) {
  const layer = style.layers.find((l) => l.id === id);
  expect(layer, id).toBeDefined();
  return Object.values(("paint" in layer! && layer!.paint) || {}).flatMap(
    literals,
  );
}

describe.each([
  ["printed", printed],
  ["flat (Ornaments off)", flat],
])("buildMapStyle, %s", (_, style) => {
  it("paints only with the colours it was given", () => {
    const used = paints(style).filter((p) => p.property.endsWith("color"));
    expect(used.length).toBeGreaterThan(0);
    for (const { layer, value } of used)
      for (const colour of literals(value))
        expect(ALLOWED, `${layer} paints ${colour}`).toContain(colour);
  });

  it("draws the sand ground, inked major roads and quiet labels", () => {
    expect(paintOf(style, "land")).toContain(COLOURS.land);
    expect(paintOf(style, "road-major-ink")).toContain(COLOURS.ink);
    expect(paintOf(style, "road-major")).toContain(COLOURS.road);
    expect(paintOf(style, "road-minor")).toContain(COLOURS.road);
    expect(paintOf(style, "building")).toContain(COLOURS.building);
    expect(paintOf(style, "boundary")).toContain(COLOURS.ink);
    const place = paintOf(style, "label-place");
    expect(place).toContain(COLOURS.label);
    expect(place).toContain(COLOURS.labelHalo);
  });

  it("draws buildings only at close zoom", () => {
    const building = style.layers.find((l) => l.id === "building");
    expect(building?.minzoom).toBeGreaterThanOrEqual(14);
  });

  it("reads OpenFreeMap's vector tiles and fonts, and nothing else from the network", () => {
    const sources = Object.values(style.sources);
    // OpenFreeMap's tiles, and the Vendors' own points, held in the page.
    expect(sources).toHaveLength(2);
    expect(style.sources[VENDOR_FOOTPRINTS]).toMatchObject({
      type: "geojson",
    });
    const tiles = sources.filter((s) => s.type === "vector");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    });
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\/fonts\//);
  });

  it("credits OpenFreeMap, OpenMapTiles and OpenStreetMap on the source", () => {
    const source = Object.values(style.sources).find(
      (s) => s.type === "vector",
    );
    const attribution = (source as { attribution?: string }).attribution ?? "";
    expect(attribution).toContain("OpenFreeMap");
    expect(attribution).toContain("OpenMapTiles");
    expect(attribution).toContain("OpenStreetMap");
  });

  it("has no sprite and no point-of-interest layer, so the only symbols are our Markers", () => {
    expect(style).not.toHaveProperty("sprite");
    for (const layer of style.layers) {
      const sourceLayer = (layer as { "source-layer"?: string })[
        "source-layer"
      ];
      expect(sourceLayer, layer.id).not.toBe("poi");
      // The one icon is the Markers' own invisible footprint.
      if (layer.id === VENDOR_FOOTPRINTS) continue;
      const layout = ("layout" in layer ? layer.layout : undefined) ?? {};
      expect(layout, layer.id).not.toHaveProperty("icon-image");
    }
  });

  it("keeps place and road labels from drawing through the Markers", () => {
    const footprints = style.layers.find((l) => l.id === VENDOR_FOOTPRINTS);
    expect(footprints).toMatchObject({
      type: "symbol",
      source: VENDOR_FOOTPRINTS,
      layout: {
        "icon-image": MARKER_FOOTPRINT.id,
        // Always placed, and counted when MapLibre places the labels below.
        "icon-allow-overlap": true,
        "icon-ignore-placement": false,
      },
    });
    // Above every label layer: MapLibre places the top layer's symbols first,
    // so a label under a footprint is hidden instead of drawn through it.
    const ids = style.layers.map((l) => l.id);
    const at = ids.indexOf(VENDOR_FOOTPRINTS);
    for (const label of style.layers.filter(
      (l) => l.type === "symbol" && l.id !== VENDOR_FOOTPRINTS,
    ))
      expect(ids.indexOf(label.id), label.id).toBeLessThan(at);
    // It paints nothing: the icon itself is transparent.
    expect(paints(style).filter((p) => p.layer === VENDOR_FOOTPRINTS)).toEqual(
      [],
    );
    expect(
      (footprints as { layout: Record<string, unknown> }).layout,
    ).not.toHaveProperty("text-field");
  });

  it("labels with the Latin name fields only", () => {
    const labels = style.layers.filter(
      (l) => l.type === "symbol" && l.id !== VENDOR_FOOTPRINTS,
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const layer of labels) {
      const field = JSON.stringify(
        (layer.layout as Record<string, unknown>)["text-field"],
      );
      const read = [...field.matchAll(/\["get","([^"]+)"\]/g)].map((m) => m[1]);
      expect(read.length, layer.id).toBeGreaterThan(0);
      for (const name of read)
        expect(["name:latin", "name_en", "name_int"], layer.id).toContain(name);
    }
  });
});

type FeatureCollection = {
  features: {
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown>;
  }[];
};

describe("the Vendors' footprints", () => {
  it("holds one point per Marker drawn, faint ones smaller", () => {
    const withPoints = buildMapStyle(COLOURS, {
      points: [
        { id: "a", lat: 26.9, lng: 75.8, faint: false },
        { id: "b", lat: 27.04, lng: 75.89, faint: true },
      ],
    });
    const source = withPoints.sources[VENDOR_FOOTPRINTS] as {
      data: FeatureCollection;
    };
    expect(source.data.features).toHaveLength(2);
    expect(source.data.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [75.8, 26.9] },
      properties: { faint: false },
    });
    expect(source.data.features[1]!.properties).toMatchObject({ faint: true });
    const layer = withPoints.layers.find((l) => l.id === VENDOR_FOOTPRINTS);
    const size = JSON.stringify(
      (layer as { layout: Record<string, unknown> }).layout["icon-size"],
    );
    expect(size).toContain("faint");
  });

  it("starts empty when no Marker is drawn", () => {
    const source = printed.sources[VENDOR_FOOTPRINTS] as {
      data: FeatureCollection;
    };
    expect(source.data.features).toEqual([]);
  });
});

describe("the prints, which follow the Ornaments setting", () => {
  const patternsIn = (style: Style) =>
    paints(style)
      .filter((p) => p.property.endsWith("-pattern"))
      .map((p) => ({ layer: p.layer, pattern: p.value }));

  it("prints butta on the land, leaves on parks and lahariya on water", () => {
    const used = patternsIn(printed);
    expect(used).toContainEqual({ layer: "butta", pattern: "map-butta" });
    expect(used).toContainEqual({ layer: "park", pattern: "map-leaf" });
    expect(used).toContainEqual({ layer: "water", pattern: "map-lahar" });
  });

  it("uses only patterns this module draws", () => {
    for (const { layer, pattern } of patternsIn(printed))
      expect(Object.keys(MAP_PATTERNS), layer).toContain(pattern);
  });

  it("drops every print with Ornaments off and keeps flat colours in their place", () => {
    expect(patternsIn(flat)).toEqual([]);
    expect(flat.layers.map((l) => l.id)).not.toContain("butta");
    expect(paintOf(flat, "park")).toContain(COLOURS.park);
    expect(paintOf(flat, "water")).toContain(COLOURS.water);
    // Everything that isn't a print is drawn the same either way.
    const printless = printed.layers
      .map((l) => l.id)
      .filter((id) => id !== "butta");
    expect(flat.layers.map((l) => l.id)).toEqual(printless);
  });
});

describe("the map tokens", () => {
  it("names a map token for every colour", () => {
    expect(Object.keys(MAP_TOKENS).sort()).toEqual(Object.keys(COLOURS).sort());
    for (const token of Object.values(MAP_TOKENS))
      expect(token).toMatch(/^--map-[a-z-]+$/);
  });

  it.each(["style.ts", "patterns.ts"])(
    "%s writes no colour literal of its own",
    (file) => {
      const source = readFileSync(
        join(process.cwd(), "components/map", file),
        "utf8",
      );
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source).not.toMatch(/\b(rgba?|hsla?)\(/i);
      expect(source).not.toMatch(/"(white|black|gr[ae]y)"/i);
    },
  );

  /** Every map token's value in app/globals.css. */
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const valueOf = (token: string) =>
    css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, "i"))?.[1];

  it("defines every map token as a hex colour MapLibre can parse", () => {
    for (const token of Object.values(MAP_TOKENS))
      expect(valueOf(token), token).toMatch(/^#[0-9a-f]{6}$/i);
  });

  /** The hue of a hex colour, in degrees. */
  function hue(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const max = Math.max(r!, g!, b!);
    const min = Math.min(r!, g!, b!);
    if (max === min) return 0;
    const d = max - min;
    const h =
      max === r!
        ? ((g! - b!) / d) % 6
        : max === g!
          ? (b! - r!) / d + 2
          : (r! - g!) / d + 4;
    return (h * 60 + 360) % 360;
  }

  // Sah-Nikhil, 27 Oct: the printed map sits on the sand ground, with no pink.
  it.each(["land", "butta", "building", "label", "labelHalo"] as const)(
    "keeps the %s on sand, not pink",
    (key) => {
      const value = valueOf(MAP_TOKENS[key])!;
      expect(hue(value), `${MAP_TOKENS[key]} ${value}`).toBeGreaterThanOrEqual(
        25,
      );
      expect(hue(value), `${MAP_TOKENS[key]} ${value}`).toBeLessThanOrEqual(65);
    },
  );
});
