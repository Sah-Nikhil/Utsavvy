import { describe, expect, it } from "vitest";
import { isOffScreen } from "./reveal";

// "Show me that Item" on the desktop Canvas (review of #90): a history row or
// a Chat reference pans the view only when the Item is out of sight.

const CANVAS = { width: 1000, height: 800 };
const BUDGET = { x: 100, y: 100, w: 332, h: 400 };

describe("isOffScreen", () => {
  it("is false for an Item in view", () => {
    expect(isOffScreen(BUDGET, { x: 0, y: 0, zoom: 1 }, CANVAS)).toBe(false);
  });

  it("is false for an Item with a good part in view", () => {
    // Panned left so the Budget's right 132 px show.
    expect(isOffScreen(BUDGET, { x: -300, y: 0, zoom: 1 }, CANVAS)).toBe(false);
  });

  it("is true when only a sliver of the Item shows, such as a new Note's top edge", () => {
    // Its last 32 px at the left edge, or its top 15 px at the bottom.
    expect(isOffScreen(BUDGET, { x: -400, y: 0, zoom: 1 }, CANVAS)).toBe(true);
    expect(isOffScreen(BUDGET, { x: 0, y: 685, zoom: 1 }, CANVAS)).toBe(true);
  });

  it("is true once the Item is wholly past an edge", () => {
    expect(isOffScreen(BUDGET, { x: -500, y: 0, zoom: 1 }, CANVAS)).toBe(true);
    expect(isOffScreen(BUDGET, { x: 0, y: 760, zoom: 1 }, CANVAS)).toBe(true);
  });

  it("counts the zoom: far away at full size, in view zoomed out", () => {
    const far = { x: 3000, y: 2000, w: 300, h: 200 };
    expect(isOffScreen(far, { x: 0, y: 0, zoom: 1 }, CANVAS)).toBe(true);
    expect(isOffScreen(far, { x: 0, y: 0, zoom: 0.25 }, CANVAS)).toBe(false);
  });
});
