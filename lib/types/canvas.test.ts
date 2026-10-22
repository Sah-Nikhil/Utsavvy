import { describe, expect, it } from "vitest";
import {
  GOOGLE_PLACE_NOTE_MAX,
  countCharacters,
  googlePlaceNoteProblem,
} from "./canvas";

describe("countCharacters", () => {
  it("counts what a person sees as one character", () => {
    // म + े, ह + ं, द + ी: six code points, three characters on screen.
    expect(countCharacters("मेहंदी")).toBe(3);
    expect(countCharacters("👨‍👩‍👧")).toBe(1);
    expect(countCharacters("Haldi")).toBe(5);
  });
});

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

  it("counts Hindi and emoji by what a person sees", () => {
    // Each "की" is two code points but one character on screen.
    expect(googlePlaceNoteProblem("की".repeat(280))).toBeNull();
    expect(googlePlaceNoteProblem("की".repeat(281))).toBe("tooLong");
    expect(googlePlaceNoteProblem("👨‍👩‍👧".repeat(280))).toBeNull();
  });
});
