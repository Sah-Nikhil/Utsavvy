import { describe, expect, it } from "vitest";
import { scriptClass } from "./script";

describe("scriptClass", () => {
  it("marks Devanagari text by script, whatever its language", () => {
    expect(scriptClass("मेहंदी")).toBe("script-deva");
    // Marathi: Devanagari, but not Hindi.
    expect(scriptClass("पुण्यातील लग्नाची तयारी")).toBe("script-deva");
    expect(scriptClass("Mehendi के लिए ₹2,40,000")).toBe("script-deva");
  });

  it("leaves Latin text and Hinglish in Latin script alone", () => {
    expect(scriptClass("Money and dates")).toBeUndefined();
    expect(scriptClass("Sangeet ka khana")).toBeUndefined();
    expect(scriptClass("₹2,40,000")).toBeUndefined();
  });

  it("ignores anything that isn't a string", () => {
    expect(scriptClass(undefined)).toBeUndefined();
    expect(scriptClass(42)).toBeUndefined();
  });
});
