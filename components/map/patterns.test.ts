import { describe, expect, it } from "vitest";
import { drawPattern, MAP_PATTERNS } from "./patterns";
import type { MapColours } from "./style";

// S15 (issue #48): the printed map's patterns are drawn on a canvas in the
// browser and added with map.addImage, so their ink comes from the tokens too.

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

/** A 2D context that records every colour set on it and every shape drawn. */
function recorder() {
  const colours: string[] = [];
  let marks = 0;
  const ctx = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "fill" || prop === "stroke" || prop === "fillRect")
          return () => {
            marks += 1;
          };
        return () => {};
      },
      set(_, prop, value) {
        if (prop === "fillStyle" || prop === "strokeStyle")
          colours.push(String(value));
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, colours, marks: () => marks };
}

describe("the map's printed patterns", () => {
  it.each(Object.keys(MAP_PATTERNS))(
    "%s inks only with token colours",
    (id) => {
      const { ctx, colours, marks } = recorder();
      drawPattern(id as keyof typeof MAP_PATTERNS, COLOURS, ctx);
      expect(marks()).toBeGreaterThan(0);
      expect(colours.length).toBeGreaterThan(0);
      for (const colour of colours)
        expect(Object.values(COLOURS), `${id} inks ${colour}`).toContain(
          colour,
        );
    },
  );

  it("prints the butta, leaf and lahariya in their own colours", () => {
    const inks = (id: keyof typeof MAP_PATTERNS) => {
      const { ctx, colours } = recorder();
      drawPattern(id, COLOURS, ctx);
      return colours;
    };
    expect(inks("map-butta")).toContain(COLOURS.butta);
    expect(inks("map-leaf")).toEqual(
      expect.arrayContaining([COLOURS.park, COLOURS.leaf]),
    );
    expect(inks("map-lahar")).toEqual(
      expect.arrayContaining([COLOURS.water, COLOURS.wave]),
    );
  });

  it("tiles each pattern in a whole number of pixels", () => {
    for (const [id, { width, height }] of Object.entries(MAP_PATTERNS)) {
      expect(Number.isInteger(width), id).toBe(true);
      expect(Number.isInteger(height), id).toBe(true);
    }
  });
});
