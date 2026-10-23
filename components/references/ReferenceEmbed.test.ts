import { describe, expect, it } from "vitest";
import { embedSrc } from "./ReferenceEmbed";

describe("embedSrc", () => {
  const BOARD = "https://www.pinterest.com/meera/haldi-decor/";

  it("asks for no height by default, so cards keep the 240 px board", () => {
    expect(embedSrc("pinterest", BOARD)).toBe(
      `/embed/pinterest?url=${encodeURIComponent(BOARD)}`,
    );
  });

  it("passes a board height to the Pinterest page", () => {
    expect(embedSrc("pinterest", BOARD, { boardHeight: 640 })).toBe(
      `/embed/pinterest?url=${encodeURIComponent(BOARD)}&height=640`,
    );
  });

  it("has no preview for a pin.it short link", () => {
    expect(embedSrc("pinterest", "https://pin.it/AbC123")).toBeNull();
  });
});
