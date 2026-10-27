import { describe, expect, it } from "vitest";
import {
  budgetLineFor,
  filterForFunction,
  type FilterableVendor,
} from "./filter";

// S15 (issue #48): filtering the map by a Function's needs.

const SANGEET = { key: "sangeet", guests: 300 };

function venue(
  name: string,
  capacity: { min?: number; max: number } | null,
  prices: FilterableVendor["prices"] = [],
): FilterableVendor & { name: string } {
  return { name, category: "venue", capacity, prices };
}

const perPlate = (min: number, max = min) => ({
  comparable: true,
  amount: { min, max },
  unit: "per_plate" as const,
  qualifier: "exact" as const,
  text: `₹${min} per plate`,
});
const perFunction = (amount: number) => ({
  comparable: true,
  amount: { min: amount, max: amount },
  unit: "per_function" as const,
  qualifier: "exact" as const,
  text: `₹${amount} for the evening`,
});
const notComparable = {
  comparable: false,
  text: "Packages from ₹50k, call us",
};

/** The sangeet's Venue budget line: ₹3,00,000 planned. */
const VENUE_LINE = { plannedAmount: 300_000, estimate: null };

describe("filterForFunction", () => {
  it("drops Venues too small for the sangeet's 300 Guests", () => {
    const kept = filterForFunction(
      [venue("Small hall", { max: 250 }), venue("Big lawn", { max: 500 })],
      SANGEET,
      null,
    );
    expect(kept.map((v) => v.name)).toEqual(["Big lawn"]);
  });

  it("keeps a Venue whose capacity the site doesn't state", () => {
    const kept = filterForFunction([venue("Unknown", null)], SANGEET, null);
    expect(kept.map((v) => v.name)).toEqual(["Unknown"]);
  });

  it("drops Vendors whose Listed prices are all above the budget line", () => {
    const kept = filterForFunction(
      [
        // ₹1,200 a plate × 300 = ₹3,60,000, above ₹3,00,000.
        venue("Pricey", { max: 400 }, [perPlate(1200, 3500)]),
        // ₹800 a plate × 300 = ₹2,40,000.
        venue("Fits", { max: 400 }, [perPlate(800)]),
        // One package over, one under: the cheaper one fits.
        venue("Mixed", { max: 400 }, [
          perFunction(450_000),
          perFunction(280_000),
        ]),
        // Exactly on the line fits.
        venue("On the line", { max: 400 }, [perFunction(300_000)]),
      ],
      SANGEET,
      VENUE_LINE,
    );
    expect(kept.map((v) => v.name)).toEqual(["Fits", "Mixed", "On the line"]);
    expect(kept.every((v) => !v.noPrice)).toBe(true);
  });

  it("keeps Vendors without a comparable price, marked no price", () => {
    const kept = filterForFunction(
      [
        venue("Silent", { max: 2000 }),
        venue("Call us", { max: 2000 }, [notComparable]),
        venue("Fits", { max: 400 }, [perPlate(800)]),
      ],
      SANGEET,
      VENUE_LINE,
    );
    expect(kept.map((v) => [v.name, v.noPrice])).toEqual([
      ["Silent", true],
      ["Call us", true],
      ["Fits", false],
    ]);
  });

  it("uses the Estimate when the budget line has no planned amount", () => {
    const kept = filterForFunction(
      [venue("Pricey", { max: 400 }, [perPlate(1200)])],
      SANGEET,
      {
        plannedAmount: null,
        estimate: { amount: 400_000 },
      },
    );
    expect(kept.map((v) => v.name)).toEqual(["Pricey"]);
  });

  it("keeps every priced Vendor when there is no budget line", () => {
    const kept = filterForFunction(
      [venue("Pricey", { max: 400 }, [perPlate(1200)])],
      SANGEET,
      null,
    );
    expect(kept.map((v) => [v.name, v.noPrice])).toEqual([["Pricey", false]]);
  });

  it("only checks capacity for Venues", () => {
    const kept = filterForFunction(
      [
        {
          name: "Caterer",
          category: "caterer",
          capacity: { max: 100 },
          prices: [],
        },
      ],
      SANGEET,
      null,
    );
    expect(kept.map((v) => v.name)).toEqual(["Caterer"]);
  });
});

describe("budgetLineFor", () => {
  const entries = [
    {
      functionKey: "sangeet",
      category: "venue_large",
      plannedAmount: 300_000,
      estimate: null,
    },
    {
      functionKey: "sangeet",
      category: "catering_main",
      plannedAmount: null,
      estimate: { amount: 420_000 },
    },
    {
      functionKey: "wedding",
      category: "venue_large",
      plannedAmount: 900_000,
      estimate: null,
    },
  ];

  it("finds the Function's budget line for a Vendor category", () => {
    expect(budgetLineFor(entries, "sangeet", "venue")?.plannedAmount).toBe(
      300_000,
    );
    expect(budgetLineFor(entries, "sangeet", "caterer")?.estimate?.amount).toBe(
      420_000,
    );
    expect(budgetLineFor(entries, "wedding", "venue")?.plannedAmount).toBe(
      900_000,
    );
  });

  it("is null when the Function has no line for the category", () => {
    expect(budgetLineFor(entries, "sangeet", "photographer")).toBeNull();
    expect(budgetLineFor(entries, "haldi", "venue")).toBeNull();
  });
});
