/* eslint-disable no-restricted-syntax -- Theme colours here are data (the hex values a photo or a Member gives), not UI styling. */
import { describe, expect, it } from "vitest";
import type { Theme, ThemeUpdate } from "../types/brief";
import {
  asksForTheme,
  colourName,
  isThemeUnchanged,
  mergeTheme,
  themeChangeLine,
  themeUpdateFromImage,
} from "./theme";

// S13 seams (issue #46): merging a change into the Theme (inspirations.md
// rules 15 to 17) and the Chat line a Member's "Use for Theme" posts.

const JAIPUR: Theme = {
  palette: ["#C2185B", "#F4A300", "#F8C8DC"],
  styleWords: ["royal Rajputana", "festive"],
  decorKeywords: ["marigold", "pastel pink drapes", "brass urli"],
};

function update(over: Partial<ThemeUpdate>): ThemeUpdate {
  return {
    addPalette: [],
    removePalette: [],
    addStyleWords: [],
    addDecorKeywords: [],
    fromInspiration: null,
    ...over,
  };
}

describe("mergeTheme", () => {
  it("adds new colours and words after the old ones", () => {
    expect(
      mergeTheme(
        JAIPUR,
        update({ addPalette: ["#1F6F78"], addStyleWords: ["lantern-lit"] }),
      ),
    ).toEqual({
      palette: ["#C2185B", "#F4A300", "#F8C8DC", "#1F6F78"],
      styleWords: ["royal Rajputana", "festive", "lantern-lit"],
      decorKeywords: ["marigold", "pastel pink drapes", "brass urli"],
    });
  });

  it("never holds more than 5 colours, 4 style words or 6 decor keywords; new ones replace the oldest", () => {
    const merged = mergeTheme(
      JAIPUR,
      update({
        addPalette: ["#111111", "#222222", "#333333"],
        addStyleWords: ["a", "b", "c"],
        addDecorKeywords: ["d1", "d2", "d3", "d4"],
      }),
    );
    expect(merged.palette).toEqual([
      "#F4A300",
      "#F8C8DC",
      "#111111",
      "#222222",
      "#333333",
    ]);
    expect(merged.styleWords).toEqual(["festive", "a", "b", "c"]);
    expect(merged.decorKeywords).toEqual([
      "pastel pink drapes",
      "brass urli",
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
  });

  it("keeps only the newest when one update brings more than fit", () => {
    const merged = mergeTheme(
      { palette: [], styleWords: [], decorKeywords: [] },
      update({ addPalette: ["#1", "#2", "#3", "#4", "#5", "#6"].map(hex) }),
    );
    expect(merged.palette).toEqual(["#2", "#3", "#4", "#5", "#6"].map(hex));
  });

  it("removes colours, and doesn't add one it already has (any case)", () => {
    const merged = mergeTheme(
      JAIPUR,
      update({
        removePalette: ["#f4a300"],
        addPalette: ["#c2185b"],
        addDecorKeywords: ["Marigold"],
      }),
    );
    expect(merged.palette).toEqual(["#C2185B", "#F8C8DC"]);
    expect(merged.decorKeywords).toEqual(JAIPUR.decorKeywords);
  });

  it("reports when nothing changed", () => {
    expect(isThemeUnchanged(JAIPUR, mergeTheme(JAIPUR, update({})))).toBe(true);
    expect(
      isThemeUnchanged(
        JAIPUR,
        mergeTheme(JAIPUR, update({ addPalette: ["#1F6F78"] })),
      ),
    ).toBe(false);
  });
});

function hex(short: string): string {
  const digit = short.slice(1);
  return `#${digit.repeat(6)}`;
}

describe("themeChangeLine", () => {
  it("reads \"Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'\"", () => {
    const after = mergeTheme(
      JAIPUR,
      update({ addPalette: ["#1F6F78"], addStyleWords: ["lantern-lit"] }),
    );
    expect(themeChangeLine("Meera", JAIPUR, after)).toBe(
      "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'",
    );
  });

  it("lists removed colours with a minus", () => {
    const after = mergeTheme(
      JAIPUR,
      update({ addPalette: ["#1F6F78"], removePalette: ["#F4A300"] }),
    );
    expect(themeChangeLine("Rohan", JAIPUR, after)).toBe(
      "Utsavvy updated the Theme for Rohan: + teal #1F6F78, − marigold #F4A300",
    );
  });
});

describe("colourName", () => {
  it("names a colour by its nearest decor colour", () => {
    expect(colourName("#1F6F78")).toBe("teal");
    expect(colourName("#F4A300")).toBe("marigold");
    expect(colourName("#F8C8DC")).toBe("pastel pink");
    expect(colourName("#FFFFFF")).toBe("white");
  });
});

describe("themeUpdateFromImage", () => {
  it("takes a library photo's two leading palette colours and its decor tags, not its occasion, Function or colour words", () => {
    const result = themeUpdateFromImage(
      {
        palette: ["#988b5c", "#b69b0a", "#afc5d0", "#405854", "#8a5e10"],
        decorKeywords: [
          "wedding",
          "haldi",
          "yellow",
          "gold",
          "marigold",
          "urli",
          "pots",
        ],
      },
      JAIPUR,
      "item1",
    );
    expect(result).toEqual({
      addPalette: ["#988B5C", "#B69B0A"],
      removePalette: [],
      addStyleWords: [],
      // "marigold" is already in the Theme.
      addDecorKeywords: ["urli", "pots"],
      fromInspiration: "item1",
    });
  });

  it("skips a colour too close to one the Theme already has", () => {
    const result = themeUpdateFromImage(
      { palette: ["#C3195C", "#1F6F78"], decorKeywords: [] },
      JAIPUR,
      null,
    );
    expect(result.addPalette).toEqual(["#1F6F78"]);
  });
});

describe("asksForTheme (review of #107, M1)", () => {
  it.each([
    "Add teal to our Theme",
    "change the theme to pastel pink and gold",
    "please update the palette with this teal",
    "use these colours for the theme",
    "make the colour scheme more pastel",
    "Replace the gold in our palette with teal.",
    "थीम बदल दो",
  ])("is a request to change the Theme: %s", (text) => {
    expect(asksForTheme(text)).toBe(true);
  });

  it.each([
    "what colours suit a haldi?",
    "which theme would suit a small mehendi?",
    "should we change the theme?",
    "How do we use colour at the sangeet",
    "don't change the theme",
    "Please do not update the palette",
    "never touch our colours",
    "थीम मत बदलो",
    "find some haldi decor ideas",
    "love these colours",
    "Add teal to the theme. Don't touch the palette.",
  ])("is not: %s", (text) => {
    expect(asksForTheme(text)).toBe(false);
  });
});
