import { describe, expect, it } from "vitest";
import { hindiLang } from "./lang";

describe("hindiLang", () => {
  it("marks text with Devanagari as Hindi", () => {
    expect(hindiLang("मेहंदी")).toBe("hi");
    expect(hindiLang("Mehendi के लिए ₹2,40,000")).toBe("hi");
  });

  it("leaves Latin text and Hinglish in Latin script alone", () => {
    expect(hindiLang("Money and dates")).toBeUndefined();
    expect(hindiLang("Sangeet ka khana")).toBeUndefined();
    expect(hindiLang("₹2,40,000")).toBeUndefined();
  });

  it("ignores anything that isn't a string", () => {
    expect(hindiLang(undefined)).toBeUndefined();
    expect(hindiLang(42)).toBeUndefined();
  });
});
