import { describe, expect, it } from "vitest";
import { fitFrame, placeInFreeSpace } from "./placement";

const item = (x: number, y: number, w = 300, h = 200) => ({
  position: { x, y },
  size: { w, h },
});

describe("placeInFreeSpace", () => {
  it("puts the first Item of an empty Section at its top left", () => {
    const section = { frame: { x: 40, y: 40, w: 640, h: 440 } };
    expect(placeInFreeSpace(section, [], { w: 300, h: 200 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("fills left to right first", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 440 } };
    expect(placeInFreeSpace(section, [item(0, 0)], { w: 300, h: 200 })).toEqual(
      { x: 320, y: 0 },
    );
  });

  // The worked example from the issue.
  it("goes down a row when the row is full: Items at (0,0) and (320,0), width 640, a 300 x 200 Item goes to (0, 220)", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 440 } };
    expect(
      placeInFreeSpace(section, [item(0, 0), item(320, 0)], { w: 300, h: 200 }),
    ).toEqual({ x: 0, y: 220 });
  });

  it("never overlaps an existing Item, keeping a 20 px gap", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 900 } };
    // A tall Item on the left and a short one on the right.
    const items = [item(0, 0, 300, 500), item(320, 0, 300, 100)];
    const spot = placeInFreeSpace(section, items, { w: 300, h: 200 });
    expect(spot).toEqual({ x: 320, y: 120 });
  });

  it("uses a gap left by a deleted Item before going further down", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 660 } };
    const items = [item(320, 0), item(0, 220), item(320, 220)];
    expect(placeInFreeSpace(section, items, { w: 300, h: 200 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("places below everything when the Section is full, so its frame grows", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 420 } };
    const items = [item(0, 0), item(320, 0), item(0, 220), item(320, 220)];
    const spot = placeInFreeSpace(section, items, { w: 300, h: 200 });
    expect(spot).toEqual({ x: 0, y: 440 });
    // 440 + 200 runs past the 420 px frame: the frame grows to hold it.
    expect(
      fitFrame(section.frame, [...items, { position: spot, size: null }], {
        w: 300,
        h: 200,
      }),
    ).toEqual({ x: 0, y: 0, w: 640, h: 640 });
  });

  it("treats an Item with no stored size as 300 x 200", () => {
    const section = { frame: { x: 0, y: 0, w: 640, h: 440 } };
    const items = [{ position: { x: 0, y: 0 }, size: null }];
    expect(placeInFreeSpace(section, items, { w: 300, h: 200 })).toEqual({
      x: 320,
      y: 0,
    });
  });

  it("puts an Item wider than the Section on its own row at the left", () => {
    const section = { frame: { x: 0, y: 0, w: 400, h: 440 } };
    expect(placeInFreeSpace(section, [item(0, 0)], { w: 560, h: 300 })).toEqual(
      { x: 0, y: 220 },
    );
  });
});

describe("fitFrame", () => {
  it("keeps a frame that already holds every Item", () => {
    const frame = { x: 10, y: 20, w: 640, h: 440 };
    expect(fitFrame(frame, [item(0, 0), item(320, 220)])).toEqual(frame);
  });

  it("grows the width and height to hold an Item past the edge, never shrinks", () => {
    const frame = { x: 10, y: 20, w: 640, h: 440 };
    expect(fitFrame(frame, [item(500, 300)])).toEqual({
      x: 10,
      y: 20,
      w: 800,
      h: 500,
    });
  });
});
