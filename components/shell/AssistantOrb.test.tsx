import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantOrb, orbColours } from "./AssistantOrb";

// The orb's colours come from the Event's Theme (IMPLEMENTATION_PLAN.md section
// 7.4), minus anything near marigold, which only the pointing ring wears.

// Theme colours arrive as data; built here so the hex lint rule (semantic
// tokens only in components) doesn't read the fixtures as styling.
const hex = (digits: string) => `#${digits}`;

describe("orbColours", () => {
  it("drops marigold from the Jaipur demo's Theme and keeps the rest in order", () => {
    // "royal Rajputana, marigold, pastel pink": maroon, marigold, pink, teal.
    expect(
      orbColours([hex("7a1f3d"), hex("e8a317"), hex("f4a7b9"), hex("1d6f6a")]),
    ).toEqual([hex("7a1f3d"), hex("f4a7b9"), hex("1d6f6a")]);
  });

  it("uses the brand palette when the Event has no Theme colours", () => {
    expect(orbColours([])).toEqual([
      "var(--orb-1)",
      "var(--orb-2)",
      "var(--orb-3)",
    ]);
  });

  it("skips greys, near-black, near-white and unreadable values, then pads", () => {
    expect(
      orbColours([
        hex("808080"),
        hex("050505"),
        hex("fbfbfb"),
        "teal",
        hex("5a2d82"),
      ]),
    ).toEqual([hex("5a2d82"), "var(--orb-1)", "var(--orb-2)"]);
  });

  it("keeps at most four colours", () => {
    expect(
      orbColours([
        hex("7a1f3d"),
        hex("f4a7b9"),
        hex("1d6f6a"),
        hex("3b4cc0"),
        hex("5a2d82"),
      ]),
    ).toHaveLength(4);
  });
});

describe("AssistantOrb", () => {
  it("is decorative without a label and an image with one", () => {
    expect(renderToStaticMarkup(<AssistantOrb palette={[]} />)).toContain(
      'aria-hidden="true"',
    );
    const named = renderToStaticMarkup(
      <AssistantOrb palette={[]} label="Utsavvy" />,
    );
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Utsavvy"');
  });

  it("exposes its run state for the inner activity styles", () => {
    expect(
      renderToStaticMarkup(<AssistantOrb palette={[]} state="streaming" />),
    ).toContain('data-state="streaming"');
  });
});
