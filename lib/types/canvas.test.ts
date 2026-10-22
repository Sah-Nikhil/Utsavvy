import { describe, expect, it } from "vitest";
import { GOOGLE_PLACE_NOTE_MAX, googlePlaceNoteProblem } from "./canvas";

describe("googlePlaceNoteProblem", () => {
  it("accepts a note up to the limit", () => {
    expect(GOOGLE_PLACE_NOTE_MAX).toBe(280);
    expect(
      googlePlaceNoteProblem("Good parking, ask for Mr Sharma"),
    ).toBeNull();
    expect(googlePlaceNoteProblem("a".repeat(280))).toBeNull();
  });

  it("refuses an empty or blank note", () => {
    expect(googlePlaceNoteProblem("")).toBe("empty");
    expect(googlePlaceNoteProblem("   ")).toBe("empty");
  });

  it("refuses a note over 280 characters", () => {
    expect(googlePlaceNoteProblem("a".repeat(281))).toBe("tooLong");
  });

  it("counts characters, not UTF-16 units", () => {
    expect(googlePlaceNoteProblem("🎉".repeat(280))).toBeNull();
    expect(googlePlaceNoteProblem("मेहंदी".repeat(46))).toBeNull();
  });
});
