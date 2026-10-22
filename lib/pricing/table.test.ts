import { describe, expect, it } from "vitest";
import {
  REFERENCE_TABLE_VERSION,
  TIER_MULTIPLIER,
  cityTier,
  referenceTable,
  tableRange,
} from "./table";

describe("the reference table is the first-brief seed, frozen", () => {
  it("is version 2026-10-22", () => {
    expect(REFERENCE_TABLE_VERSION).toBe("2026-10-22");
  });

  it("holds the seed rows at tier Y", () => {
    expect(referenceTable.catering_main).toMatchObject({
      unit: "per_plate",
      low: 1000,
      high: 2000,
    });
    expect(referenceTable.photography_video).toMatchObject({
      unit: "per_day",
      low: 25000,
      high: 50000,
    });
    expect(referenceTable.prasad).toMatchObject({
      unit: "per_guest_day",
      low: 30,
      high: 60,
    });
    expect(referenceTable.prasad_daily_aarti).toMatchObject({
      unit: "per_guest_day",
      low: 20,
      high: 40,
    });
  });

  it("cites the starter set's Listed prices where D2 found them", () => {
    expect(referenceTable.catering_main.source).toContain("M L Caterers");
    expect(referenceTable.catering_standard.source).toContain("M L Caterers");
    expect(referenceTable.catering_light.source).toContain("Vinayak");
    expect(referenceTable.photography_video.source).toContain("Candid Life");
    expect(referenceTable.party_catering.source).toContain("Vinayak");
    expect(referenceTable.catering_standard.unsourced).toBe(false);
  });

  it("keeps the † note on rows still unsourced", () => {
    expect(referenceTable.dhol.unsourced).toBe(true);
    expect(referenceTable.dhol.source).toContain("†");
    expect(referenceTable.transport_misc.unsourced).toBe(true);
  });

  it("says which Vendor categories and units feed a row", () => {
    expect(referenceTable.catering_main.feeds).toContainEqual({
      vendorCategory: "caterer",
      unit: "per_plate",
    });
    expect(referenceTable.dhol.feeds).toEqual([]);
  });
});

describe("cityTier", () => {
  it("puts Jaipur in Y", () => expect(cityTier("Jaipur")).toBe("Y"));
  it("puts Pune in X", () => expect(cityTier("Pune")).toBe("X"));
  it("ignores case, spaces and a state suffix", () => {
    expect(cityTier("  mumbai ")).toBe("X");
    expect(cityTier("Jaipur, Rajasthan")).toBe("Y");
  });
  it("knows the old names of X cities", () => {
    expect(cityTier("Bangalore")).toBe("X");
    expect(cityTier("New Delhi")).toBe("X");
  });
  it("treats an unlisted town as Z", () => {
    expect(cityTier("Sawai Madhopur")).toBe("Z");
  });
});

describe("tableRange", () => {
  it("returns the Y row as it is", () => {
    expect(tableRange("catering_main", "per_plate", "Y")).toEqual({
      unitLow: 1000,
      unitHigh: 2000,
    });
  });

  it("multiplies tier X by 1.25 and tier Z by 0.8", () => {
    expect(TIER_MULTIPLIER).toEqual({ X: 1.25, Y: 1, Z: 0.8 });
    expect(tableRange("idol", "per_event", "X")).toEqual({
      unitLow: 25000,
      unitHigh: 50000,
    });
    expect(tableRange("venue_large", "per_function", "Z")).toEqual({
      unitLow: 60000,
      unitHigh: 160000,
    });
  });

  it("is null for an unknown category or another unit", () => {
    expect(tableRange("tent_house", "per_function", "Y")).toBeNull();
    expect(tableRange("catering_main", "per_function", "Y")).toBeNull();
  });
});
