import { describe, expect, it } from "vitest";
import { istDay } from "./time";

describe("istDay", () => {
  it("puts 2026-10-21T19:00:00Z on IST day 2026-10-22", () => {
    expect(istDay(Date.parse("2026-10-21T19:00:00Z"))).toBe("2026-10-22");
  });
});
