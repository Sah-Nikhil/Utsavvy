import { describe, expect, it } from "vitest";
import {
  assumeFunctionDetails,
  briefLines,
  type FunctionDetailsInput,
} from "../brief/functions";
import type { DraftBudgetLine } from "../types";
import { referenceTableBasis } from "./basis";
import {
  budgetCheckFixes,
  type FixDraft,
  fewerGuestsSteps,
  fixLineKeys,
} from "./budgetCheckFixes";
import { type LineEstimate, planLines, pricePlan } from "./pricePlan";
import { tableRange } from "./table";

// The worked examples on the reference-table path, which is what
// `stubEstimateDeps` gives the Budget check: research returns nothing, so
// every line is priced from the table (first-brief.md "Worked examples").

function draftOf(details: FunctionDetailsInput): FixDraft {
  const { functions, assumptions } = assumeFunctionDetails(details);
  return { details, functions, assumptions };
}

const jaipurAt15L = draftOf({
  eventType: "wedding",
  date: { kind: "month", value: "2027-02" },
  guests: 300,
  tradition: "North Indian Hindu",
  honoree: null,
  communityKind: null,
  functionKeys: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
  children: null,
  today: "2026-10-21",
});

const puneGanesh = draftOf({
  eventType: "community",
  date: { kind: "day", value: "2027-09-04" },
  guests: 400,
  tradition: null,
  honoree: null,
  communityKind: "Ganesh utsav",
  functionKeys: null,
  children: null,
  today: "2026-10-21",
});

function tableFor(tier: "X" | "Y") {
  return (line: DraftBudgetLine): LineEstimate | null => {
    const range = tableRange(line.category, line.unit, tier);
    if (!range) return null;
    return {
      unit: line.unit,
      ...range,
      basis: referenceTableBasis({ unit: line.unit, ...range, tier }),
    };
  };
}

function fixesFor(draft: FixDraft, tier: "X" | "Y", budget: number) {
  const rangeFor = tableFor(tier);
  const lines = briefLines({
    eventType: draft.details.eventType!,
    tradition: draft.details.tradition,
    functions: draft.functions,
    assumptions: draft.assumptions,
    guests: draft.details.guests ?? 0,
  });
  const ranges = planLines(lines).map(rangeFor);
  const minimum = pricePlan(lines, ranges, {
    budget,
    contingencyShare: 0.1,
  }).budgetCheck.minimum;
  const fixes = budgetCheckFixes(draft, ranges, {
    budget,
    contingencyShare: 0.1,
    rangeFor,
  });
  return { minimum, fixes };
}

describe("the ₹15L Jaipur wedding (first-brief.md, worked example 1 variant)", () => {
  const { minimum, fixes } = fixesFor(jaipurAt15L, "Y", 1500000);

  it("starts from the Budget check's minimum of about ₹19.6L", () => {
    expect(Math.round(minimum / 10000) * 10000).toBe(1960000);
  });

  it("offers fewer Guests first, then fewer Functions", () => {
    expect(fixes.map((f) => f.kind)).toEqual(["fewerGuests", "fewerFunctions"]);
  });

  it("drops the reception: new minimum about ₹14.2L, which fits", () => {
    const drop = fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(drop.label).toBe("Skip the reception");
    expect(drop.change).toEqual({
      field: "dropFunction",
      functionKey: "reception",
    });
    expect(Math.round(drop.minimum / 10000) * 10000).toBe(1420000);
    expect(drop.fits).toBe(true);
    expect(drop.preview).toBe("New minimum about ₹14.2L, which fits.");
  });

  it("invites 200 to the wedding and reception and 150 to the sangeet, still short", () => {
    const fewer = fixes.find((f) => f.kind === "fewerGuests")!;
    expect(fewer.label).toBe("Plan for 200 Guests instead of 300");
    expect(fewer.change).toEqual({
      field: "guests",
      functionKey: null,
      guests: 200,
    });
    // The assumed Guests follow the Brief's, as an edit to it would: the
    // smaller Functions keep their shares of the wedding's Guests.
    expect(fewer.detail).toBe(
      "Haldi 40, Mehendi 80, Sangeet 150, Wedding 200, Reception 200",
    );
    expect(fewer.fits).toBe(false);
    expect(fewer.minimum).toBeGreaterThan(1500000);
    expect(fewer.minimum).toBeLessThan(minimum);
    expect(fewer.preview).toMatch(
      /^New minimum about ₹15\.\d+L, still about ₹[\d,]+ short\.$/,
    );
  });
});

describe("the Pune Ganesh utsav (first-brief.md, worked example 3)", () => {
  const { minimum, fixes } = fixesFor(puneGanesh, "X", 240000);

  it("starts from the Budget check's minimum of about ₹2.76L", () => {
    expect(Math.round(minimum / 1000) * 1000).toBe(276000);
  });

  it("skips the cultural night: new minimum about ₹1.90L, which fits", () => {
    const drop = fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(drop.label).toBe("Skip the cultural night");
    expect(drop.change).toEqual({
      field: "dropFunction",
      functionKey: "cultural_night",
    });
    expect(Math.round(drop.minimum / 1000) * 1000).toBe(190000);
    expect(drop.fits).toBe(true);
    expect(drop.preview).toBe("New minimum about ₹1.9L, which fits.");
  });

  it("never skips the sthapana, the daily aarti or the visarjan, even when that would fit", () => {
    const drop = fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(drop.change).not.toMatchObject({
      functionKey: expect.stringMatching(/sthapana|daily_aarti|visarjan/),
    });
  });

  it("plans 250 Guests at the cultural night instead of 400, still short", () => {
    const fewer = fixes.find((f) => f.kind === "fewerGuests")!;
    expect(fewer.label).toBe("Plan for 250 Guests instead of 400");
    expect(fewer.change).toEqual({
      field: "guests",
      functionKey: null,
      guests: 250,
    });
    expect(fewer.detail).toContain("Cultural night 250");
    expect(fewer.fits).toBe(false);
    expect(fewer.minimum).toBeGreaterThan(240000);
    expect(fewer.preview).toMatch(
      /^New minimum about ₹2\.\d+L, still about ₹[\d,]+ short\.$/,
    );
  });
});

describe("budgetCheckFixes rules", () => {
  it("offers nothing when the budget reaches the minimum", () => {
    expect(fixesFor(jaipurAt15L, "Y", 2500000).fixes).toEqual([]);
  });

  it("never skips the wedding itself", () => {
    // ₹14L: only skipping the wedding would come near, and it isn't offered.
    const { fixes } = fixesFor(jaipurAt15L, "Y", 1400000);
    const drop = fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(drop.change).toEqual({
      field: "dropFunction",
      functionKey: "reception",
    });
    expect(drop.fits).toBe(false);
  });

  it("skips the smallest Function that fits when several would", () => {
    // ₹19L is about ₹62,000 short; skipping the haldi is enough.
    const { fixes } = fixesFor(jaipurAt15L, "Y", 1900000);
    const drop = fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(drop.label).toBe("Skip the haldi");
    expect(drop.fits).toBe(true);
  });

  it("lowers the Guests only as far as needed, in steps of 50", () => {
    // ₹18L: 250 Guests is enough, so it doesn't go to 200.
    const { fixes } = fixesFor(jaipurAt15L, "Y", 1800000);
    const fewer = fixes.find((f) => f.kind === "fewerGuests")!;
    expect(fewer.change).toMatchObject({ guests: 250 });
    expect(fewer.fits).toBe(true);
  });

  it("offers no Function to skip when there is only one", () => {
    const birthday = draftOf({
      eventType: "birthday",
      date: { kind: "day", value: "2026-12-12" },
      guests: 60,
      tradition: null,
      honoree: { who: "child", age: 6, name: null },
      communityKind: null,
      functionKeys: null,
      children: 35,
      today: "2026-10-21",
    });
    const { fixes } = fixesFor(birthday, "Y", 50000);
    expect(fixes.map((f) => f.kind)).toEqual(["fewerGuests"]);
  });

  it("steps down by a third at most, to round counts", () => {
    expect(fewerGuestsSteps(300)).toEqual([250, 200]);
    expect(fewerGuestsSteps(400)).toEqual([350, 300, 250]);
    expect(fewerGuestsSteps(60)).toEqual([50, 40]);
    expect(fewerGuestsSteps(1)).toEqual([]);
  });

  it("lists every line a preview prices, so a query can read their ranges first", () => {
    const keys = fixLineKeys(jaipurAt15L).map((l) => l.category);
    // At 150 Guests the sangeet moves to a small Venue and small decor.
    expect(keys).toEqual(
      expect.arrayContaining(["venue_small", "decor_small"]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
