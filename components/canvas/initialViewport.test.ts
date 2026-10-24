import { describe, expect, it } from "vitest";
import { readableViewport } from "./initialViewport";

// Money and dates as S1 lays it out and the Canvas draws it: the 720 x 560
// frame with 24 px padding either side, the 56 px label row and 28 px below.
const MONEY = { x: -24, y: -56, w: 768, h: 644 };

describe("readableViewport", () => {
  it("opens a desktop Canvas at full size on the first Section, its top left in view", () => {
    // 1440 x 900 window: the Canvas beside the Chat is about 1050 x 830.
    expect(readableViewport(MONEY, { width: 1050, height: 830 })).toEqual({
      x: 24 + 24,
      y: 64 + 56,
      zoom: 1,
    });
  });

  it("zooms out only as far as the readable floor on a short desktop window", () => {
    // 1280 x 720: 656 px tall, so the 644 px Section would need 0.82.
    const view = readableViewport(MONEY, { width: 890, height: 600 });
    expect(view.zoom).toBe(0.85);
    expect(view.x).toBeCloseTo(24 + 24 * 0.85);
    expect(view.y).toBeCloseTo(64 + 56 * 0.85);
  });

  it("keeps a phone at the readable floor and shows the Section's first Item, not the whole Section", () => {
    const view = readableViewport(MONEY, { width: 390, height: 300 });
    expect(view.zoom).toBe(0.85);
    // The left edge of the Section is in view, so the Budget is.
    expect(view.x + MONEY.x * view.zoom).toBeCloseTo(24);
  });

  it("never opens closer than full size when the Section is small", () => {
    const small = { x: 0, y: 0, w: 300, h: 200 };
    expect(readableViewport(small, { width: 1050, height: 830 }).zoom).toBe(1);
  });
});
