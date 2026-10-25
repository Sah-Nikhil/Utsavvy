import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import records from "./vibe-sets.json";

// Each set is split into categories: the Functions of a wedding, or the parts of a party.
const CATEGORIES: Record<string, string[]> = {
  "wedding-north-indian-hindu": [
    "haldi",
    "mehendi",
    "sangeet",
    "engagement",
    "wedding",
  ],
  "wedding-general": ["mandap", "ceremony", "reception", "stage"],
  "birthday-child": ["theme", "characters", "cake", "backdrop", "gifts"],
  "community-ganesh-utsav": ["pandal", "home", "rangoli", "community"],
};
const OCCASION: Record<string, string> = {
  "wedding-north-indian-hindu": "wedding",
  "wedding-general": "wedding",
  "birthday-child": "birthday",
  "community-ganesh-utsav": "ganesh",
};
const SET_KEYS = Object.keys(CATEGORIES);
const PER_CATEGORY = 16;
const FIELDS = [
  "setKey",
  "category",
  "pexelsId",
  "pageUrl",
  "photographer",
  "photographerUrl",
  "localPath",
  "alt",
  "tags",
  "palette",
  "curatedAt",
] as const;
const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

// Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X).
function webpSize(file: Buffer) {
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = file.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return {
      width: file.readUIntLE(24, 3) + 1,
      height: file.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

describe("stock library seed", () => {
  it(`has the 4 sets, each with ${PER_CATEGORY} photos in every category`, () => {
    expect(records).toHaveLength(288);
    for (const record of records) {
      expect(CATEGORIES[record.setKey], `${record.pexelsId}`).toContain(
        record.category,
      );
    }
    for (const [setKey, categories] of Object.entries(CATEGORIES)) {
      for (const category of categories) {
        const photos = records.filter(
          (r) => r.setKey === setKey && r.category === category,
        );
        expect(photos, `${setKey}/${category}`).toHaveLength(PER_CATEGORY);
      }
    }
  });

  it("marks 12 vibe picks per set", () => {
    for (const setKey of SET_KEYS) {
      const picks = records.filter((r) => r.setKey === setKey && r.vibePick);
      expect(picks, setKey).toHaveLength(12);
    }
  });

  // Licensed characters may show up in Search, but never in the vibe pick.
  it("tags licensed characters as branded and keeps them out of the vibe pick", () => {
    const character =
      /mickey|minnie|spider-?man|superman|batman|frozen|elsa|hello kitty|\bkitty\b/i;
    for (const record of records) {
      const text = `${record.alt} ${record.tags.join(" ")}`;
      if (character.test(text)) {
        expect(record.tags, `${record.pexelsId}`).toContain("branded");
      }
      if (record.tags.includes("branded")) {
        expect(record.vibePick, `${record.pexelsId}`).toBe(false);
      }
    }
  });

  it("never repeats a Pexels id", () => {
    const ids = records.map((r) => r.pexelsId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fills every field", () => {
    for (const record of records) {
      for (const field of FIELDS) {
        expect(record[field], `${record.pexelsId}.${field}`).toBeTruthy();
      }
      expect(typeof record.pexelsId).toBe("number");
      expect(typeof record.vibePick).toBe("boolean");
      expect(record.tags.length, `${record.pexelsId} tags`).toBeGreaterThan(0);
    }
  });

  it("credits the photographer and the photo page on pexels.com", () => {
    for (const record of records) {
      for (const url of [record.pageUrl, record.photographerUrl]) {
        const { protocol, hostname } = new URL(url);
        expect(`${protocol}//${hostname}`, url).toBe("https://www.pexels.com");
      }
    }
  });

  it("uses 4 to 12 lowercase tags and 3 to 5 palette colours", () => {
    for (const record of records) {
      expect(
        record.tags.length,
        `${record.pexelsId} tags`,
      ).toBeGreaterThanOrEqual(4);
      expect(record.tags.length, `${record.pexelsId} tags`).toBeLessThanOrEqual(
        12,
      );
      for (const tag of record.tags)
        expect(tag, `${record.pexelsId}`).toBe(tag.toLowerCase());
      expect(
        record.palette.length,
        `${record.pexelsId} palette`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        record.palette.length,
        `${record.pexelsId} palette`,
      ).toBeLessThanOrEqual(5);
      for (const hex of record.palette) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps each photo's category and occasion in its tags", () => {
    for (const record of records) {
      expect(record.tags, `${record.pexelsId}`).toContain(record.category);
      expect(record.tags, `${record.pexelsId}`).toContain(
        OCCASION[record.setKey],
      );
    }
  });

  it("has at least 6 haldi photos for the demo search", () => {
    expect(
      records.filter((r) => r.tags.includes("haldi")).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("never points at a Pexels image URL", () => {
    expect(JSON.stringify(records)).not.toContain("images.pexels.com");
  });
});

describe("stock library files", () => {
  it("serves every record from its own WebP under public/", () => {
    for (const record of records) {
      expect(record.localPath).toBe(
        `/inspirations/${record.setKey}/${record.pexelsId}.webp`,
      );
      const file = readFileSync(join(PUBLIC, record.localPath));
      const size = webpSize(file);
      expect(size, record.localPath).not.toBeNull();
      expect(
        Math.max(size!.width, size!.height),
        record.localPath,
      ).toBeGreaterThanOrEqual(1100);
      expect(
        Math.max(size!.width, size!.height),
        record.localPath,
      ).toBeLessThanOrEqual(1300);
      expect(file.length, record.localPath).toBeLessThan(300_000);
    }
  });

  it("has no file without a record, and stays under 25 MB", () => {
    const paths = new Set(records.map((r) => r.localPath));
    let total = 0;
    for (const setKey of readdirSync(join(PUBLIC, "inspirations"))) {
      for (const name of readdirSync(join(PUBLIC, "inspirations", setKey))) {
        expect(paths, `${setKey}/${name}`).toContain(
          `/inspirations/${setKey}/${name}`,
        );
        total += statSync(join(PUBLIC, "inspirations", setKey, name)).size;
      }
    }
    expect(total).toBeLessThan(25 * 1024 * 1024);
  });
});
