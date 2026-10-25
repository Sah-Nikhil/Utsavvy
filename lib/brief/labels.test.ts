import { describe, expect, it } from "vitest";
import { assumptionLabel } from "./labels";

describe("assumptionLabel", () => {
  it("names the first plan's run sheet times in plain English", () => {
    expect(assumptionLabel("runSheets")).toBe("Run sheets");
  });

  it("never shows a raw field name for a field it doesn't know", () => {
    expect(assumptionLabel("decor.style")).toBe("Decor style");
    expect(assumptionLabel("welcomeDrinks")).toBe("Welcome drinks");
    expect(assumptionLabel("return_gift_type")).toBe("Return gift type");
  });

  it("keeps the labels it already had", () => {
    expect(assumptionLabel("city.tier")).toBe("City tier");
    expect(assumptionLabel("function.haldi.guests")).toBe("Haldi Guests");
  });
});
