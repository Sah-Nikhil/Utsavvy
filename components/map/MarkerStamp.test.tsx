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

  it("frames the selected Marker with rangoli petals and a dotted ring", () => {
    const selected = stamp({ selected: true });
    expect(selected).toContain('data-ornament="petals"');
    expect(selected).toContain('data-ornament="dot-ring"');
    expect(stamp()).not.toContain('data-ornament="petals"');
  });

  it("drops every ornament with Ornaments off and keeps the shape, its colour and a plain selection ring", () => {
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
    const selected = stamp({ selected: true });
    expect(ornaments(selected).length).toBeGreaterThanOrEqual(3);
    // With the petals gone, selection is still shown by a plain ring.
    expect(selected).toMatch(
      /<circle[^>]*data-plain-ring[^>]*class="[^"]*hidden[^"]*ornaments-off:inline/,
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
