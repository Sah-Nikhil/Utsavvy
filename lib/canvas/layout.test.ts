import { describe, expect, it } from "vitest";
import {
  itemOffsetInBox,
  itemPositionFromBox,
  sectionBox,
  sectionUnder,
} from "./layout";

describe("sectionBox", () => {
  it("adds 24 px each side, a 56 px label row and 28 px below the frame", () => {
    expect(sectionBox({ x: 100, y: 200, w: 640, h: 440 }, [])).toEqual({
      x: 76,
      y: 144,
      w: 688,
      h: 524,
    });
  });

  it("grows with an Item past the frame's edge", () => {
    const box = sectionBox({ x: 0, y: 0, w: 640, h: 440 }, [
      { position: { x: 500, y: 300 }, size: { w: 300, h: 200 } },
    ]);
    expect(box.w).toBe(800 + 48);
    expect(box.h).toBe(500 + 56 + 28);
  });
});

describe("item positions inside a Section's box", () => {
  it("round-trips, and never goes above or left of the frame", () => {
    expect(itemPositionFromBox(itemOffsetInBox({ x: 320, y: 220 }))).toEqual({
      x: 320,
      y: 220,
    });
    expect(itemPositionFromBox({ x: 3, y: 10 })).toEqual({ x: 0, y: 0 });
  });
});

describe("sectionUnder", () => {
  const sections = [
    { id: "money", box: { x: 0, y: 0, w: 1000, h: 700 } },
    { id: "vendors", box: { x: 1100, y: 0, w: 1000, h: 700 } },
  ];

  it("finds the Section holding the Item's centre", () => {
    expect(
      sectionUnder(sections, { x: 1200, y: 100 }, { w: 300, h: 200 })?.id,
    ).toBe("vendors");
  });

  it("returns null outside every Section", () => {
    expect(sectionUnder(sections, { x: 0, y: 900 }, null)).toBeNull();
  });
});
