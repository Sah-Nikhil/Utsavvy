import { describe, expect, it } from "vitest";
import { formatINR, formatLakh } from "./format";

// Worked examples from the C0 issue and docs/design/first-brief.md.
describe("formatINR writes rupees with lakh grouping", () => {
  it("₹2,40,000", () => expect(formatINR(240000)).toBe("₹2,40,000"));
  it("₹25,00,000", () => expect(formatINR(2500000)).toBe("₹25,00,000"));
  it("₹1,210", () => expect(formatINR(1210)).toBe("₹1,210"));
});

describe("formatLakh writes round lakh amounts short", () => {
  it("₹25L", () => expect(formatLakh(2500000)).toBe("₹25L"));
});
