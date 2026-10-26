import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapStyle, MAP_TOKENS, type MapColours } from "./style";

// S15 (issue #48): the Vendor map's own style, built from the --map-* tokens
// (IMPLEMENTATION_PLAN.md section 7.5).

// Distinct made-up values, one per token, so a colour that isn't one of them
// (or is the wrong one) shows up.
const COLOURS: MapColours = {
  land: "token-1",
  water: "token-2",
  park: "token-3",
  road: "token-4",
  roadMajor: "token-5",
  building: "token-6",
  label: "token-7",
  labelHalo: "token-8",
  boundary: "token-9",
};
const ALLOWED = new Set(Object.values(COLOURS));

const style = buildMapStyle(COLOURS);

/** Every string literal in a paint value, skipping each expression's operator. */
function literals(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  const [head, ...rest] = value as unknown[];
  const args = typeof head === "string" ? rest : value;
  return (args as unknown[]).flatMap(literals);
}

/** Every value a layer paints with, by property name. */
function paintColours() {
  return style.layers.flatMap((layer) =>
    Object.entries(("paint" in layer ? layer.paint : undefined) ?? {}).flatMap(
      ([property, value]) =>
        property.endsWith("color")
          ? literals(value).map((colour) => ({ layer: layer.id, colour }))
          : [],
    ),
  );
}

describe("buildMapStyle", () => {
  it("paints only with the colours it was given", () => {
    const used = paintColours();
    expect(used.length).toBeGreaterThan(0);
    for (const { layer, colour } of used)
      expect(ALLOWED, `${layer} paints ${colour}`).toContain(colour);
  });

  it("uses each token for its own part of the map", () => {
    const paintOf = (id: string) => {
      const layer = style.layers.find((l) => l.id === id);
      expect(layer, id).toBeDefined();
      return Object.values(("paint" in layer! && layer!.paint) || {}).flatMap(
        literals,
      );
    };
    expect(paintOf("land")).toContain(COLOURS.land);
    expect(paintOf("water")).toContain(COLOURS.water);
    expect(paintOf("park")).toContain(COLOURS.park);
    expect(paintOf("road-minor")).toContain(COLOURS.road);
    expect(paintOf("road-major")).toContain(COLOURS.roadMajor);
    expect(paintOf("building")).toContain(COLOURS.building);
    expect(paintOf("boundary")).toContain(COLOURS.boundary);
    const place = paintOf("label-place");
    expect(place).toContain(COLOURS.label);
    expect(place).toContain(COLOURS.labelHalo);
  });

  it("draws buildings only at close zoom", () => {
    const building = style.layers.find((l) => l.id === "building");
    expect(building?.minzoom).toBeGreaterThanOrEqual(14);
  });

  it("reads OpenFreeMap's vector tiles and fonts", () => {
    const sources = Object.values(style.sources);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    });
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\/fonts\//);
  });

  it("credits OpenFreeMap, OpenMapTiles and OpenStreetMap on the source", () => {
    const [source] = Object.values(style.sources);
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
      const layout = ("layout" in layer ? layer.layout : undefined) ?? {};
      expect(layout, layer.id).not.toHaveProperty("icon-image");
    }
  });

  it("labels with the Latin name fields only", () => {
    const labels = style.layers.filter((l) => l.type === "symbol");
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

  it("names a --map-* token for every colour", () => {
    expect(Object.keys(MAP_TOKENS).sort()).toEqual(Object.keys(COLOURS).sort());
    for (const token of Object.values(MAP_TOKENS))
      expect(token).toMatch(/^--map-[a-z-]+$/);
  });

  it("writes no colour literal of its own", () => {
    const source = readFileSync(
      join(process.cwd(), "components/map/style.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(rgba?|hsla?)\(/i);
    expect(source).not.toMatch(/"(white|black|gr[ae]y)"/i);
  });
});
