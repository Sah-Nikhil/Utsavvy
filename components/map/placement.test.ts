import { describe, expect, it } from "vitest";
import { cityBounds, openingFit, placeVendors } from "./placement";

// Review of #123, finding 3: the map stays on the Event's city. A Vendor
// shortlisted from another city is listed as outside it, never drawn by
// widening the map's bounds.

const PUNE = { lat: 18.5204, lng: 73.8567 };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };
const ROOD_MAHAL = { lat: 26.9048, lng: 75.7568, approximate: true };

const inside = (
  bounds: [number, number, number, number],
  p: { lat: number; lng: number },
) =>
  p.lng >= bounds[0] &&
  p.lat >= bounds[1] &&
  p.lng <= bounds[2] &&
  p.lat <= bounds[3];

function vendor(
  name: string,
  marker: typeof ROOD_MAHAL | null,
  inCity: boolean,
) {
  return { name, marker, inCity };
}

describe("cityBounds", () => {
  it("keeps the map around the city, never reaching another one", () => {
    const pune = cityBounds(PUNE);
    expect(inside(pune, PUNE)).toBe(true);
    expect(inside(pune, ROOD_MAHAL)).toBe(false);
    expect(inside(cityBounds(JAIPUR), ROOD_MAHAL)).toBe(true);
  });
});

describe("placeVendors", () => {
  it("lists a distant Shortlisted Vendor as outside the city instead of drawing it", () => {
    const placed = placeVendors(
      [
        vendor("Rood Mahal", ROOD_MAHAL, false),
        vendor("Pune caterer", { ...PUNE, approximate: false }, true),
        vendor("Vinayak", null, true),
      ],
      true,
    );
    expect(placed.onMap.map((v) => v.name)).toEqual(["Pune caterer"]);
    expect(placed.outside.map((v) => v.name)).toEqual(["Rood Mahal"]);
    expect(placed.noAddress.map((v) => v.name)).toEqual(["Vinayak"]);
  });

  it("draws every Marker when the Event has no city to stay on", () => {
    const placed = placeVendors(
      [vendor("Rood Mahal", ROOD_MAHAL, false)],
      false,
    );
    expect(placed.onMap.map((v) => v.name)).toEqual(["Rood Mahal"]);
    expect(placed.outside).toEqual([]);
  });
});

describe("openingFit", () => {
  it("is centred on the city and ignores a Marker beyond its reach", () => {
    const fit = openingFit(PUNE, [{ marker: ROOD_MAHAL }]);
    expect((fit[0] + fit[2]) / 2).toBeCloseTo(PUNE.lng);
    expect((fit[1] + fit[3]) / 2).toBeCloseTo(PUNE.lat);
    expect(inside(fit, ROOD_MAHAL)).toBe(false);
  });

  it("widens to take in the city's own Markers", () => {
    const fit = openingFit(JAIPUR, [{ marker: ROOD_MAHAL }]);
    expect(inside(fit, ROOD_MAHAL)).toBe(true);
  });
});
