import { describe, expect, it } from "vitest";
import { communityKindKey, festivalDates, nextFestival } from "./festivalDates";

describe("festivalDates", () => {
  it("gives the Ganesh utsav of 2027 as 4 to 14 Sep, from Drik Panchang", () => {
    const dates = festivalDates("ganesh-utsav", 2027);
    expect(dates).not.toBeNull();
    expect(dates!.from).toBe("2027-09-04");
    expect(dates!.to).toBe("2027-09-14");
    expect(dates!.sources.join(" ")).toContain("drikpanchang.com");
  });

  it("knows nothing it has no source for", () => {
    expect(festivalDates("ganesh-utsav", 2031)).toBeNull();
    expect(festivalDates("society-annual-day", 2027)).toBeNull();
  });

  it("proposes the next festival after today", () => {
    // Today is 2026-10-21 in the first-brief worked examples; 2026's festival is over.
    expect(nextFestival("ganesh-utsav", "2026-10-21")?.from).toBe(
      "2027-09-04",
    );
  });

  it("reads the community kinds the Member types", () => {
    expect(communityKindKey("Ganesh utsav")).toBe("ganesh-utsav");
    expect(communityKindKey("Ganeshotsav")).toBe("ganesh-utsav");
    expect(communityKindKey("ganpati festival")).toBe("ganesh-utsav");
    expect(communityKindKey("Durga puja")).toBe("durga-puja");
    expect(communityKindKey("Society annual day")).toBe("society-annual-day");
    expect(communityKindKey("Holi milan")).toBeNull();
  });
});
