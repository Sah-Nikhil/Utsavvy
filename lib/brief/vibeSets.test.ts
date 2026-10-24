/* eslint-disable no-restricted-syntax -- Theme colours here are data (the hex values a photo gives), not UI styling. */
import { describe, expect, it } from "vitest";
import { findLibraryPhoto, setPhotos } from "../inspirations/library";
import type { BriefExtraction, Theme } from "../types/brief";
import { aaravBirthday, jaipurWedding, puneGaneshUtsav } from "./examples";
import {
  isVibeCandidate,
  setForBrief,
  VIBE_PICK,
  vibePickPhotos,
  vibeTheme,
} from "./vibeSets";

// S18 seams (issue #51): which vibe pick set a Brief gets (IMPLEMENTATION_PLAN.md
// section 2, inspirations.md rule 21) and the Theme three tapped photos make.
// Expected photos come from seed/vibe-sets.json as curated.

const NONE: BriefExtraction = {
  eventType: null,
  city: null,
  date: null,
  guests: null,
  budget: null,
  tradition: null,
  honoree: null,
  communityKind: null,
  households: null,
  notes: [],
};

describe("setForBrief", () => {
  it("gives the Jaipur wedding the North Indian Hindu set once the Member taps that Tradition", () => {
    expect(
      setForBrief({
        ...jaipurWedding.extraction,
        tradition: "North Indian Hindu",
      }),
    ).toBe("wedding-north-indian-hindu");
  });

  it("gives a Punjabi wedding the general wedding set", () => {
    expect(
      setForBrief({
        ...NONE,
        eventType: "wedding",
        tradition: "Punjabi",
      }),
    ).toBe("wedding-general");
  });

  it("gives a wedding whose Tradition isn't known yet the general wedding set", () => {
    expect(setForBrief(jaipurWedding.extraction)).toBe("wedding-general");
  });

  it("gives Aarav's 6th birthday the child birthday set", () => {
    expect(setForBrief(aaravBirthday.extraction)).toBe("birthday-child");
  });

  it("has no set for an adult's or a grandparent's birthday", () => {
    for (const who of ["adult", "elder"] as const) {
      expect(
        setForBrief({
          ...NONE,
          eventType: "birthday",
          honoree: { who, age: 60, name: null },
        }),
      ).toBeNull();
    }
  });

  it("gives the Pune society Ganesh utsav its set", () => {
    expect(setForBrief(puneGaneshUtsav.extraction)).toBe(
      "community-ganesh-utsav",
    );
  });

  it("has no set for a Durga puja or a society annual day", () => {
    for (const communityKind of ["Durga puja", "Society annual day"]) {
      expect(
        setForBrief({ ...NONE, eventType: "community", communityKind }),
      ).toBeNull();
    }
  });

  it("has no set while the kind of Event is unknown", () => {
    expect(setForBrief(NONE)).toBeNull();
  });
});

describe("vibePickPhotos", () => {
  it("starts with the set's 12 vibe pick photos", () => {
    const photos = vibePickPhotos("wedding-north-indian-hindu", 0);
    expect(photos).toHaveLength(VIBE_PICK.page);
    expect(photos.every((p) => p.vibePick)).toBe(true);
    expect(
      photos.every((p) => p.setKey === "wedding-north-indian-hindu"),
    ).toBe(true);
    expect(photos[0]!.pexelsId).toBe(31002035);
  });

  it('"Show me more" adds the set\'s other photos 12 at a time, never a branded one', () => {
    // The child birthday set has 17 photos of licensed characters.
    const once = vibePickPhotos("birthday-child", 1);
    expect(once).toHaveLength(24);
    expect(once.slice(12).every((p) => !p.vibePick)).toBe(true);
    const all = vibePickPhotos("birthday-child", 99);
    expect(all).toHaveLength(80 - 17);
    expect(all.some((p) => p.tags.includes("branded"))).toBe(false);
    expect(new Set(all.map((p) => p.pexelsId)).size).toBe(all.length);
  });

  it("has nothing for a set that doesn't exist", () => {
    expect(vibePickPhotos("durga-puja", 3)).toEqual([]);
  });
});

describe("isVibeCandidate", () => {
  it("accepts any unbranded photo of the set, and nothing from another set", () => {
    expect(isVibeCandidate("wedding-north-indian-hindu", 31002035)).toBe(true);
    expect(isVibeCandidate("wedding-general", 31002035)).toBe(false);
    expect(isVibeCandidate("wedding-general", 1)).toBe(false);
  });

  it("refuses a branded photo even though it is in the set", () => {
    const branded = setPhotos(["birthday-child"]).find((p) =>
      p.tags.includes("branded"),
    )!;
    expect(isVibeCandidate("birthday-child", branded.pexelsId)).toBe(false);
  });
});

/** Three of the North Indian Hindu set's vibe pick photos: two haldi, one mandap. */
const PICKS = [31002035, 19569602, 33417236].map(
  (id) => findLibraryPhoto(id)!,
);

const EMPTY: Theme = { palette: [], styleWords: [], decorKeywords: [] };

describe("vibeTheme", () => {
  it("makes a Theme with 3 to 5 colours and some style words from 3 tapped photos", () => {
    const theme = vibeTheme(EMPTY, PICKS);
    expect(theme.palette.length).toBeGreaterThanOrEqual(3);
    expect(theme.palette.length).toBeLessThanOrEqual(5);
    const picked = new Set(
      PICKS.flatMap((p) => p.palette.map((c) => c.toUpperCase())),
    );
    for (const colour of theme.palette) expect(picked).toContain(colour);
    expect(theme.styleWords.length).toBeGreaterThanOrEqual(2);
    expect(theme.styleWords.length).toBeLessThanOrEqual(4);
    expect(theme.decorKeywords.length).toBeGreaterThanOrEqual(3);
    expect(theme.decorKeywords.length).toBeLessThanOrEqual(6);
    // Decor keywords are pieces of decor, never the occasion or a Function.
    for (const word of ["wedding", "haldi", "yellow"])
      expect(theme.decorKeywords).not.toContain(word);
  });

  it("still makes 3 colours when the photos' leading colours are nearly the same", () => {
    const same = PICKS.map((p) => ({
      ...p,
      palette: ["#F4A300", "#F4A301", ...p.palette],
    }));
    expect(vibeTheme(EMPTY, same).palette.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps what the Member already wrote and adds after it", () => {
    const theme = vibeTheme(
      {
        palette: ["#1F6F78"],
        styleWords: ["royal Rajputana"],
        decorKeywords: [],
      },
      PICKS,
    );
    expect(theme.palette[0]).toBe("#1F6F78");
    expect(theme.styleWords[0]).toBe("royal Rajputana");
  });

  it("changes nothing when no photo is tapped", () => {
    expect(vibeTheme(EMPTY, [])).toEqual(EMPTY);
  });
});
