import { describe, expect, it } from "vitest";
import { comparableForFunction } from "./comparable";

// The worked examples in docs/design/vendors.md ("A Venue with a price range",
// "A caterer with a starting price", "A price that isn't comparable").

const parampara = {
  comparable: true,
  amount: { min: 1200, max: 3500 },
  unit: "per_plate" as const,
  qualifier: "approx" as const,
  text: "₹1,200–₹3,500 per plate (approx.)",
};

const vinayak = {
  comparable: true,
  amount: { min: 250, max: 250 },
  unit: "per_plate" as const,
  qualifier: "starting" as const,
  text: "from ₹250 per plate (starting price)",
};

const perHand = {
  comparable: false,
  text: "₹500 per hand",
};

describe("comparableForFunction", () => {
  it("prices Parampara's ₹1,200 to ₹3,500 per plate for 300 Guests as ₹3.6L to ₹10.5L", () => {
    expect(comparableForFunction(parampara, 300)).toEqual({
      low: 360_000,
      high: 1_050_000,
      label: "₹3.6L to ₹10.5L, from Listed price",
    });
  });

  it("labels Vinayak's starting ₹250 as a starting price, open at the top", () => {
    expect(comparableForFunction(vinayak, 300)).toEqual({
      low: 75_000,
      high: null,
      label: "from ₹250/plate (starting price)",
    });
  });

  it("leaves ₹500 per hand out: it isn't comparable", () => {
    expect(comparableForFunction(perHand, 300)).toBeNull();
  });

  it("leaves out a comparable flag with no amount or unit", () => {
    expect(
      comparableForFunction({ comparable: true, text: "call us" }, 300),
    ).toBeNull();
  });

  it("multiplies one exact plate price by the Guests", () => {
    expect(
      comparableForFunction(
        {
          comparable: true,
          amount: { min: 850, max: 850 },
          unit: "per_plate",
          qualifier: "exact",
          text: "₹850 per plate",
        },
        300,
      ),
    ).toEqual({
      low: 255_000,
      high: 255_000,
      label: "₹850/plate × 300 = ₹2.55L, from Listed price",
    });
  });

  it("doesn't multiply a day rate by the Guests", () => {
    expect(
      comparableForFunction(
        {
          comparable: true,
          amount: { min: 15_000, max: 15_000 },
          unit: "per_day",
          qualifier: "exact",
          text: "₹15,000 per day",
        },
        300,
      ),
    ).toEqual({
      low: 15_000,
      high: 15_000,
      label: "₹15,000/day, from Listed price",
    });
  });

  it("shows the plate price itself when the Function's Guests aren't known", () => {
    expect(comparableForFunction(parampara, null)).toEqual({
      low: 1200,
      high: 3500,
      label: "₹1,200 to ₹3,500/plate, from Listed price",
    });
  });
});
