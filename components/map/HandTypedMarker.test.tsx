import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { HandTypedMarker } from "./HandTypedMarker";

// Issue #136 and the PR 139 reviews: a hand-typed Vendor's Marker is a button
// a Member who may move Markers can nudge with the keyboard, and a picture
// for anyone else, never a focusable button that does nothing.

const ID = "pv1" as Id<"privateVendors">;
const LABEL =
  "Sharma ji Caterers, Caterer, Considering, Marker placed by a Member";

const render = (movable: boolean) =>
  renderToStaticMarkup(
    <HandTypedMarker id={ID} label={LABEL} movable={movable}>
      <svg aria-hidden />
    </HandTypedMarker>,
  );

describe("HandTypedMarker", () => {
  it("is a button with the move hint for a Member who can move Markers", () => {
    const html = render(true);
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain(`data-hand-typed-marker="${ID}"`);
    expect(html).toContain(`aria-label="${LABEL}"`);
    expect(html).toContain('aria-describedby="map-place-hint"');
  });

  it("is a named picture out of the tab order for a Member who can't", () => {
    const html = render(false);
    expect(html).not.toContain("<button");
    expect(html).toMatch(/^<span /);
    expect(html).toContain('role="img"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(`data-hand-typed-marker="${ID}"`);
    expect(html).toContain(`aria-label="${LABEL}"`);
    expect(html).not.toContain("aria-describedby");
  });
});
