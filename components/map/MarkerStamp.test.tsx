import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkerStamp, StatusGlyph } from "./MarkerStamp";
import { approximateTag, LEGEND, STATUS_SHAPES } from "./markers";

// S15 (issue #48), the look Sah-Nikhil picked on 27 Oct: hand-stamped Markers
// in the status colours (option B), option A's rangoli petals and dotted ring
// around the selected one, and "approximate" written only when it's needed.

describe("status shapes", () => {
  it("gives every status its own shape, so colour is never the only cue", () => {
    const paths = LEGEND.map((tone) => STATUS_SHAPES[tone]);
    expect(new Set(paths).size).toBe(LEGEND.length);
  });
});

describe("approximateTag", () => {
  it("writes nothing on an exact Marker", () => {
    expect(approximateTag({ approximate: false, street: false })).toBe("none");
    expect(approximateTag({ approximate: false, street: true })).toBe("none");
  });

  it("shows the tag at street zoom", () => {
    expect(approximateTag({ approximate: true, street: true })).toBe("shown");
  });

  it("keeps a faint Vendor's tag for hover and focus even at street zoom, so stacked Markers don't stack tags", () => {
    expect(
      approximateTag({ approximate: true, street: true, faint: true }),
    ).toBe("on-hover");
  });

  it("keeps the tag for hover and focus at city zoom", () => {
    expect(approximateTag({ approximate: true, street: false })).toBe(
      "on-hover",
    );
  });
});

/** The opening tags of every element marked as an ornament. */
function ornaments(markup: string): string[] {
  return [...markup.matchAll(/<[a-z]+[^>]*data-ornament[^>]*>/g)].map(
    (m) => m[0],
  );
}

describe("MarkerStamp", () => {
  const stamp = (props: Partial<Parameters<typeof MarkerStamp>[0]> = {}) =>
    renderToStaticMarkup(
      <MarkerStamp
        category="venue"
        tone="quoted"
        approximate={false}
        tag="none"
        {...props}
      />,
    );

  it("stamps the status shape, solid when exact and hollow when approximate", () => {
    const exact = stamp();
    expect(exact).toContain(`d="${STATUS_SHAPES.quoted}"`);
    expect(exact).toContain('data-marker-tone="quoted"');
    expect(exact).not.toContain("data-approximate");
    const hollow = stamp({ approximate: true });
    expect(hollow).toContain("data-approximate");
    expect(hollow).toMatch(/data-stamp-shape[^>]*fill="var\(--surface\)"/);
  });

  it("strikes through a Dropped Vendor", () => {
    expect(stamp({ tone: "dropped" })).toContain("data-stamp-slash");
    expect(stamp({ tone: "booked" })).not.toContain("data-stamp-slash");
  });

  it("writes approximate under the Marker at street zoom", () => {
    const shown = stamp({ approximate: true, tag: "shown" });
    expect(shown).toMatch(/<span[^>]*data-approximate-tag[^>]*>approximate/);
    expect(shown).not.toMatch(/data-approximate-tag[^>]*invisible/);
  });

  it("keeps approximate hidden until hover or focus at city zoom", () => {
    const quiet = stamp({ approximate: true, tag: "on-hover" });
    const tag = quiet.match(/<span[^>]*data-approximate-tag[^>]*>/)?.[0] ?? "";
    expect(tag).toContain("invisible");
    expect(tag).toContain("group-hover/stamp:visible");
    expect(tag).toContain("group-focus-visible/stamp:visible");
    expect(stamp({ approximate: true, tag: "none" })).not.toContain(
      "data-approximate-tag",
    );
  });

  // Sah-Nikhil, 27 Oct: on selection the petals bloom, pool into the Marker
  // and a ring comes around it, dotted for an approximate Marker and solid
  // for an exact one. Deselecting fades the ring back out.
  /** The opening tag of the element carrying `attr`. */
  const tagWith = (markup: string, attr: string) =>
    markup.match(new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`))?.[0] ?? "";

  it("rings a selected approximate Marker with dots and an exact one with a solid line", () => {
    const dotted = tagWith(
      stamp({ selected: true, approximate: true }),
      "data-selection-ring",
    );
    expect(dotted).toContain('data-selection-ring="dotted"');
    expect(dotted).toMatch(/stroke-dasharray="[^"]+"/);
    const solid = tagWith(stamp({ selected: true }), "data-selection-ring");
    expect(solid).toContain('data-selection-ring="solid"');
    expect(solid).not.toContain("stroke-dasharray");
  });

  it("keeps the ring in place, faded out, while not selected, so deselecting can fade it", () => {
    const idle = stamp({ approximate: true });
    expect(tagWith(idle, "data-selection-ring")).toContain(
      'data-selection-ring="dotted"',
    );
    expect(idle).not.toContain("data-selected");
    expect(stamp({ selected: true })).toContain("data-selected");
  });

  it("blooms the petals and pools them into the Marker on selection, with the ring after them", () => {
    const petals = tagWith(stamp({ selected: true }), 'data-ornament="petals"');
    expect(petals).toContain("group-data-selected/mark:animate-stamp-petals");
    const shape = tagWith(stamp({ selected: true }), "data-stamp-body");
    expect(shape).toContain("group-data-selected/mark:animate-stamp-pool");
    const ring = tagWith(stamp({ selected: true }), "data-selection-ring");
    // The ring waits for the petals, then comes in.
    expect(ring).toMatch(/group-data-selected\/mark:delay-\[/);
    expect(ring).toContain("group-data-selected/mark:opacity-100");
  });

  it("skips the petals and brings the ring in at once with reduced motion or Ornaments off", () => {
    const markup = stamp({ selected: true, approximate: true });
    const petals = tagWith(markup, 'data-ornament="petals"');
    expect(petals).toContain("motion-reduce:hidden");
    expect(petals).toContain("ornaments-off:hidden");
    const ring = tagWith(markup, "data-selection-ring");
    expect(ring).toContain("motion-reduce:delay-0!");
    expect(ring).toContain("ornaments-off:delay-0!");
    // The ring carries meaning (approximate or exact), so it isn't an ornament.
    expect(ring).not.toContain("data-ornament");
  });

  it("drops every ornament with Ornaments off and keeps the shape and its colour", () => {
    for (const markup of [
      stamp({ selected: true, approximate: true, tag: "shown" }),
      stamp({ tone: "other", approximate: true }),
    ]) {
      const marked = ornaments(markup);
      for (const tag of marked) expect(tag).toContain("ornaments-off:hidden");
      // The shape itself is never an ornament.
      expect(markup).toMatch(/data-stamp-shape/);
      expect(
        markup.match(/<path[^>]*data-stamp-shape[^>]*>/)?.[0],
      ).not.toContain("data-ornament");
    }
    expect(ornaments(stamp({ selected: true })).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("is hidden from assistive technology: the button around it carries the label", () => {
    expect(stamp()).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
});

describe("StatusGlyph", () => {
  it("draws the same shape as the Marker, hollow when approximate", () => {
    const solid = renderToStaticMarkup(
      <StatusGlyph tone="booked" approximate={false} />,
    );
    expect(solid).toContain(`d="${STATUS_SHAPES.booked}"`);
    expect(solid).toContain('fill="currentColor"');
    const hollow = renderToStaticMarkup(
      <StatusGlyph tone="booked" approximate />,
    );
    expect(hollow).toContain("data-approximate");
    expect(hollow).toContain('fill="var(--surface)"');
  });
});
