import { describe, expect, it } from "vitest";
import { basisLine, budgetFlag, raiseBudgetTo } from "./budgetCheck";

describe("budgetFlag", () => {
  it("words the ₹15L Jaipur wedding's flag as first-brief.md does", () => {
    expect(
      budgetFlag({
        minimum: 1961960,
        budget: 1500000,
        city: "Jaipur",
        eventType: "wedding",
        communityKind: null,
      }),
    ).toBe(
      "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short.",
    );
  });

  it("names a Ganeshotsav and gives a small gap in rupees", () => {
    expect(
      budgetFlag({
        minimum: 275700,
        budget: 240000,
        city: "Pune",
        eventType: "community",
        communityKind: "Ganesh utsav",
      }),
    ).toBe(
      "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short.",
    );
  });

  it("has nothing to say at or above the minimum", () => {
    expect(
      budgetFlag({
        minimum: 275700,
        budget: 275700,
        city: "Pune",
        eventType: "community",
        communityKind: null,
      }),
    ).toBeNull();
  });
});

describe("raiseBudgetTo", () => {
  it("raises to the minimum, rounded up to the next ₹1,000", () => {
    expect(raiseBudgetTo(1961960)).toBe(1962000);
    expect(raiseBudgetTo(275700)).toBe(276000);
    expect(raiseBudgetTo(276000)).toBe(276000);
  });
});

describe("basisLine", () => {
  it("says what the figures rest on", () => {
    expect(basisLine({ researched: 6, lines: 9 })).toBe(
      "Based on prices researched today for 6 of 9 lines; the rest from Utsavvy's reference table.",
    );
    expect(basisLine({ researched: 0, lines: 9 })).toBe(
      "Based on Utsavvy's reference table for all 9 lines.",
    );
    expect(basisLine({ researched: 9, lines: 9 })).toBe(
      "Based on prices researched today for all 9 lines.",
    );
    expect(basisLine({ researched: 1, lines: 1 })).toBe(
      "Based on prices researched today for the 1 line.",
    );
  });
});
