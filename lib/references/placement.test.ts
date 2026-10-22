import { describe, expect, it } from "vitest";
import { placeReference } from "./placement";

describe("placeReference", () => {
  it("follows S2's worked example: the next row, 20 px below", () => {
    const size = { w: 300, h: 200 };
    expect(
      placeReference(
        { frame: { w: 640 } },
        [
          { position: { x: 0, y: 0 }, size },
          { position: { x: 320, y: 0 }, size },
        ],
        size,
      ),
    ).toEqual({ x: 0, y: 220 });
  });

  it("fills the row left to right first", () => {
    const size = { w: 300, h: 200 };
    expect(
      placeReference(
        { frame: { w: 640 } },
        [{ position: { x: 0, y: 0 }, size }],
        size,
      ),
    ).toEqual({ x: 320, y: 0 });
  });

  it("starts at the top left of an empty Section", () => {
    expect(
      placeReference({ frame: { w: 640 } }, [], { w: 300, h: 420 }),
    ).toEqual({ x: 0, y: 0 });
  });
});
