import { describe, expect, it } from "vitest";
import { functionChoice, pricingNote } from "./cards";

// Review of #122 round 2, Low 1: "Find Vendors" on an Entry that serves
// several Functions doesn't silently price for the first one. It compares
// Event-wide, says so, and lets the Member pick a Function.

const FUNCTIONS = [
  { key: "mehendi", name: "Mehendi" },
  { key: "sangeet", name: "Sangeet" },
  { key: "reception", name: "Reception" },
];

describe("functionChoice", () => {
  it("prices for the one Function an Entry serves", () => {
    expect(functionChoice(["sangeet"], FUNCTIONS)).toEqual({
      initial: "sangeet",
      options: [{ key: "sangeet", name: "Sangeet" }],
    });
  });

  it("starts Event-wide when the Entry serves several, offering each in the Entry's order", () => {
    expect(functionChoice(["reception", "sangeet"], FUNCTIONS)).toEqual({
      initial: null,
      options: [
        { key: "reception", name: "Reception" },
        { key: "sangeet", name: "Sangeet" },
      ],
    });
  });

  it("is Event-wide for an Event-wide Entry, and skips Functions since removed", () => {
    expect(functionChoice([], FUNCTIONS)).toEqual({
      initial: null,
      options: [],
    });
    expect(functionChoice(["haldi", "sangeet"], FUNCTIONS)).toEqual({
      initial: "sangeet",
      options: [{ key: "sangeet", name: "Sangeet" }],
    });
  });
});

describe("pricingNote", () => {
  it("labels an Event-wide comparison and asks for a Function", () => {
    expect(pricingNote(null, null, 2)).toBe(
      "Prices compared Event-wide. Pick a Function to work them out for its Guests.",
    );
  });

  it("names the Function and its Guests once one is picked", () => {
    expect(pricingNote("Sangeet", 300, 2)).toBe(
      "Prices worked out for the Sangeet, 300 Guests.",
    );
    expect(pricingNote("Sangeet", null, 1)).toBe(
      "Prices worked out for the Sangeet.",
    );
  });

  it("says nothing for an Event-wide Entry", () => {
    expect(pricingNote(null, null, 0)).toBeNull();
  });
});
