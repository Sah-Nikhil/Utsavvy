import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./url";

// Stored URLs (a Listed price's page, a Vendor's site) become links only when
// they are http or https; anything else is shown as text.

describe("safeHttpUrl", () => {
  it("keeps an http or https URL", () => {
    expect(safeHttpUrl("https://www.vinayakfoodsncatering.in/")).toBe(
      "https://www.vinayakfoodsncatering.in/",
    );
    expect(safeHttpUrl("http://example.in/menu")).toBe(
      "http://example.in/menu",
    );
  });

  it("refuses other schemes, malformed text and nothing", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<p>hi</p>")).toBeNull();
    expect(safeHttpUrl("ftp://example.in/menu.pdf")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
