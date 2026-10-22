import { describe, expect, it } from "vitest";
import {
  basisText,
  knowledgeBasis,
  referenceTableBasis,
  researchedBasis,
} from "./basis";

// 22 Oct 2026, 10:30 in India.
const SEARCHED_AT = Date.UTC(2026, 9, 22, 5, 0);

describe("basisText reads like the Estimate badge's source line", () => {
  it("researched: the date searched and the number of sources", () => {
    expect(
      basisText({
        kind: "researched",
        unit: "per_plate",
        unitLow: 1100,
        unitHigh: 1900,
        sourceUrls: ["https://a.in", "https://b.in", "https://c.in"],
        searchedAt: SEARCHED_AT,
        reasoning: "Three Jaipur caterers list ₹1,100-₹1,900 per plate.",
        tableVersion: null,
      }),
    ).toBe("Researched 22 Oct 2026 · 3 sources");
  });

  it("researched with one source says 'source'", () => {
    const basis = researchedBasis({
      unit: "per_plate",
      unitLow: 1100,
      unitHigh: 1900,
      sourceUrls: ["https://a.in"],
      searchedAt: SEARCHED_AT,
      reasoning: "One caterer's own price list.",
    });
    expect(basis.text).toBe("Researched 22 Oct 2026 · 1 source");
  });

  it("uses India's date, not UTC's, for the day searched", () => {
    // 21 Oct 2026 at 20:00 UTC is already 22 Oct in India.
    const basis = researchedBasis({
      unit: "per_plate",
      unitLow: 1,
      unitHigh: 2,
      sourceUrls: ["https://a.in"],
      searchedAt: Date.UTC(2026, 9, 21, 20, 0),
      reasoning: "x",
    });
    expect(basis.text).toBe("Researched 22 Oct 2026 · 1 source");
  });

  it("reference table: the tier and the table's month", () => {
    const basis = referenceTableBasis({
      unit: "per_plate",
      unitLow: 1000,
      unitHigh: 2000,
      tier: "Y",
    });
    expect(basis).toEqual({
      kind: "referenceTable",
      unit: "per_plate",
      unitLow: 1000,
      unitHigh: 2000,
      text: "Utsavvy reference table, Y tier, Oct 2026",
      sourceUrls: [],
      searchedAt: null,
      reasoning: null,
      tableVersion: "2026-10-22",
    });
    expect(basisText(basis)).toBe("Utsavvy reference table, Y tier, Oct 2026");
  });

  it("the Assistant's own estimate", () => {
    const basis = knowledgeBasis({
      unit: "per_function",
      unitLow: 20000,
      unitHigh: 60000,
      reasoning: "Tent houses in small towns charge by the day.",
    });
    expect(basis.text).toBe("Assistant's own estimate, no sources");
    expect(basis.sourceUrls).toEqual([]);
    expect(basis.searchedAt).toBeNull();
    expect(basis.tableVersion).toBeNull();
    expect(basis.reasoning).toBe(
      "Tent houses in small towns charge by the day.",
    );
  });
});
