import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineComparison } from "@/convex/quotes";
import type { Id } from "@/convex/_generated/dataModel";
import { BudgetQuotes } from "./BudgetQuotes";

// The Budget comparison links a Listed price's page only when its stored URL
// is http or https (review of #124, round 2); any other value stays text.

function comparison(sourceUrl: string): LineComparison {
  return {
    entryId: "entry1" as Id<"entries">,
    estimate: { low: 300_000, high: 600_000 },
    vendors: [
      {
        linkId: "link1" as Id<"vendorLinks">,
        vendorName: "Vinayak Foods & Catering",
        status: "quoted",
        listed: [
          {
            label: "from ₹250/plate × 300 = from ₹75,000 (starting price)",
            low: 75_000,
            high: null,
            sourceUrl,
            sentence: "Starting from ₹250 per plate.",
            seenAt: "2026-10-21",
          },
        ],
        quote: null,
      },
    ],
  };
}

function render(sourceUrl: string): string {
  return renderToStaticMarkup(
    <BudgetQuotes
      label="Catering"
      comparison={comparison(sourceUrl)}
      functionName="Sangeet"
      functionTotal={245_000}
    />,
  );
}

describe("BudgetQuotes source links", () => {
  it("links an https Listed price page", () => {
    const html = render("https://www.vinayakfoodsncatering.in/");
    expect(html).toContain('href="https://www.vinayakfoodsncatering.in/"');
    expect(html).toContain("vinayakfoodsncatering.in");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["malformed", "not a url at all"],
  ])("shows a %s source as text, never as a link", (_kind, url) => {
    const html = render(url);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).toContain("from ₹250/plate × 300 = from ₹75,000");
  });
});
