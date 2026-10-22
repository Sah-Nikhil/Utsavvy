import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemFrame } from "@/components/items/ItemFrame";
import { SectionFrame } from "./SectionOrnament";

// Text Members type is marked by script (class "script-deva") for Devanagari
// typography, never with a `lang` the app can't know.

function heading(markup: string, tag: "h2" | "h3") {
  return markup.match(new RegExp(`<${tag}[^>]*>`))?.[0] ?? "";
}

describe("Section labels and Item titles", () => {
  it.each([
    ["Marathi", "पुण्यातील लग्नाची तयारी"],
    ["mixed English and Hindi", "Mehendi के लिए"],
  ])("a %s label gets the Devanagari class and no lang", (_, label) => {
    const h2 = heading(
      renderToStaticMarkup(<SectionFrame label={label} />),
      "h2",
    );
    expect(h2).toContain("script-deva");
    expect(h2).not.toContain("lang=");
  });

  it("a Latin label gets neither", () => {
    const h2 = heading(
      renderToStaticMarkup(<SectionFrame label="Money and dates" />),
      "h2",
    );
    expect(h2).not.toContain("script-deva");
    expect(h2).not.toContain("lang=");
  });

  it("a Marathi Item title gets the Devanagari class and no lang", () => {
    const h3 = heading(
      renderToStaticMarkup(<ItemFrame kind="Note" title="लग्नाची तयारी" />),
      "h3",
    );
    expect(h3).toContain("script-deva");
    expect(h3).not.toContain("lang=");
  });
});
