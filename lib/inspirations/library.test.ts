import { describe, expect, it } from "vitest";
import {
  findLibraryPhoto,
  ownSetKeys,
  queryWords,
  searchLibrary,
  setPhotos,
} from "./library";

// S13 seam (issue #46): the stock library search (ADR 0012, inspirations.md
// rules 2 and 3). Expected photos come from seed/vibe-sets.json as curated.

describe("searchLibrary", () => {
  it('"find some haldi decor ideas" returns 6 photos, every one tagged haldi', () => {
    const photos = searchLibrary("find some haldi decor ideas");
    expect(photos).toHaveLength(6);
    for (const photo of photos) expect(photo.tags).toContain("haldi");
  });

  it('"halloween pumpkin" returns none', () => {
    expect(searchLibrary("halloween pumpkin")).toEqual([]);
  });

  it("a query matching 2 photos returns those 2", () => {
    const photos = searchLibrary("teal");
    expect(photos.map((p) => p.pexelsId).sort()).toEqual([10949660, 17808202]);
  });

  it("puts photos with more matching words first", () => {
    // Only one photo is tagged both haldi and umbrella.
    const [first] = searchLibrary("haldi umbrella");
    expect(first?.pexelsId).toBe(30672290);
  });

  it("on a tie, the Event's own set comes first", () => {
    expect(searchLibrary("lanterns").map((p) => p.setKey)).toEqual([
      "wedding-general",
      "community-ganesh-utsav",
    ]);
    expect(
      searchLibrary("lanterns", { setKeys: ["community-ganesh-utsav"] }).map(
        (p) => p.setKey,
      ),
    ).toEqual(["community-ganesh-utsav", "wedding-general"]);
  });

  it("matches a word of the query case-insensitively, never part of a word", () => {
    expect(searchLibrary("TEAL")).toHaveLength(2);
    // "tea" is part of "teal", not one of its words.
    expect(searchLibrary("tea")).toEqual([]);
  });

  it("an empty query, or only stop words, returns nothing", () => {
    expect(searchLibrary("")).toEqual([]);
    expect(searchLibrary("find some ideas")).toEqual([]);
  });
});

describe("queryWords", () => {
  it("lowercases, splits and drops stop words", () => {
    expect(queryWords("Find me SOME haldi, decor ideas!")).toEqual([
      "haldi",
      "decor",
    ]);
  });
});

describe("findLibraryPhoto", () => {
  it("finds a seed record by Pexels id, or null", () => {
    expect(findLibraryPhoto(31002035)).toMatchObject({
      photographer: "Naresh Babu",
      localPath: "/inspirations/wedding-north-indian-hindu/31002035.webp",
    });
    expect(findLibraryPhoto(1)).toBeNull();
  });
});

describe("ownSetKeys", () => {
  it("picks the Event's own set from its type and Brief", () => {
    expect(
      ownSetKeys({
        eventType: "wedding",
        tradition: "North Indian Hindu",
        honoree: null,
        communityKind: null,
      }),
    ).toEqual(["wedding-north-indian-hindu"]);
    expect(
      ownSetKeys({
        eventType: "wedding",
        tradition: "Christian",
        honoree: null,
        communityKind: null,
      }),
    ).toEqual(["wedding-general"]);
    expect(
      ownSetKeys({
        eventType: "birthday",
        tradition: null,
        honoree: { who: "child", age: 6, name: "Aarav" },
        communityKind: null,
      }),
    ).toEqual(["birthday-child"]);
    expect(
      ownSetKeys({
        eventType: "community",
        tradition: null,
        honoree: null,
        communityKind: "Ganesh utsav",
      }),
    ).toEqual(["community-ganesh-utsav"]);
    // Adult birthdays and Durga puja have no set yet.
    expect(
      ownSetKeys({
        eventType: "birthday",
        tradition: null,
        honoree: { who: "adult", age: 40, name: null },
        communityKind: null,
      }),
    ).toEqual([]);
  });
});

describe("setPhotos", () => {
  it("lists a set's photos in seed order", () => {
    const photos = setPhotos(["birthday-child"]);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((p) => p.setKey === "birthday-child")).toBe(true);
  });
});
