import { describe, expect, it } from "vitest";
import { moneyClassName } from "./money";

describe("Money", () => {
  it("sets amounts in the text font with tabular figures, unbroken", () => {
    // Fraunces' Latin subset has no ₹, so an amount in a display heading must
    // not inherit it.
    expect(moneyClassName.split(" ")).toEqual(
      expect.arrayContaining(["font-text", "num", "whitespace-nowrap"]),
    );
  });
});
