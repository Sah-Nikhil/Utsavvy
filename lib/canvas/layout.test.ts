import { describe, expect, it } from "vitest";
import {
  itemOffsetInBox,
  itemPositionFromBox,
  layoutSections,
  sectionBox,
  sectionUnder,
} from "./layout";
import {
  FALLBACK_ITEM_SIZE,
  placeInFreeSpace,
  type Frame,
  type Placed,
} from "./placement";

describe("sectionBox", () => {
  it("adds 24 px each side, a 56 px label row and 28 px below the frame", () => {
    expect(sectionBox({ x: 100, y: 200, w: 640, h: 440 }, [])).toEqual({
      x: 76,
      y: 144,
      w: 688,
      h: 524,
    });
  });

  it("grows with an Item past the frame's edge", () => {
    const box = sectionBox({ x: 0, y: 0, w: 640, h: 440 }, [
      { position: { x: 500, y: 300 }, size: { w: 300, h: 200 } },
    ]);
    expect(box.w).toBe(800 + 48);
    expect(box.h).toBe(500 + 56 + 28);
  });
});

describe("item positions inside a Section's box", () => {
  it("round-trips, and never goes above or left of the frame", () => {
    expect(itemPositionFromBox(itemOffsetInBox({ x: 320, y: 220 }))).toEqual({
      x: 320,
      y: 220,
    });
    expect(itemPositionFromBox({ x: 3, y: 10 })).toEqual({ x: 0, y: 0 });
  });
});

describe("sectionUnder", () => {
  const sections = [
    { id: "money", box: { x: 0, y: 0, w: 1000, h: 700 } },
    { id: "vendors", box: { x: 1100, y: 0, w: 1000, h: 700 } },
  ];

  it("finds the Section holding the Item's centre", () => {
    expect(
      sectionUnder(sections, { x: 1200, y: 100 }, { w: 300, h: 200 })?.id,
    ).toBe("vendors");
  });

  it("returns null outside every Section", () => {
    expect(sectionUnder(sections, { x: 0, y: 900 }, null)).toBeNull();
  });
});

// S1's starting layout (convex/events.ts): 720 x 560 frames, 40 px apart,
// with the Budget and Timeline in Money and dates and the checklist in Vendors.
const S1 = [
  { _id: "money", order: 0, frame: { x: 0, y: 0, w: 720, h: 560 } },
  { _id: "vendors", order: 1, frame: { x: 760, y: 0, w: 720, h: 560 } },
  { _id: "inspirations", order: 2, frame: { x: 0, y: 600, w: 720, h: 560 } },
  { _id: "notes", order: 3, frame: { x: 760, y: 600, w: 720, h: 560 } },
];
const S1_SIZE = { w: 332, h: 400 };
const S1_ITEMS: Record<string, Placed[]> = {
  money: [
    { position: { x: 24, y: 64 }, size: S1_SIZE },
    { position: { x: 376, y: 64 }, size: S1_SIZE },
  ],
  vendors: [{ position: { x: 24, y: 64 }, size: S1_SIZE }],
  inspirations: [],
  notes: [],
};

function overlaps(a: Frame, b: Frame): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** Every Item's drawn box on the Canvas, by Section. */
function drawnItems(
  boxes: Map<string, Frame>,
  items: Record<string, Placed[]>,
): { section: string; box: Frame }[] {
  return Object.entries(items).flatMap(([section, placed]) =>
    placed.map((p) => {
      const box = boxes.get(section)!;
      const size = p.size ?? FALLBACK_ITEM_SIZE;
      const at = itemOffsetInBox(p.position);
      return {
        section,
        box: { x: box.x + at.x, y: box.y + at.y, w: size.w, h: size.h },
      };
    }),
  );
}

function expectNoOverlaps(
  boxes: Map<string, Frame>,
  items: Record<string, Placed[]>,
) {
  const sections = [...boxes.entries()];
  for (const [i, [a, boxA]] of sections.entries())
    for (const [b, boxB] of sections.slice(i + 1))
      expect(overlaps(boxA, boxB), `${a} and ${b}`).toBe(false);
  const drawn = drawnItems(boxes, items);
  for (const [i, a] of drawn.entries())
    for (const b of drawn.slice(i + 1))
      if (a.section !== b.section)
        expect(overlaps(a.box, b.box), `${a.section} and ${b.section}`).toBe(
          false,
        );
}

describe("layoutSections", () => {
  it("keeps S1's starting Sections apart once their labels and padding are drawn", () => {
    const boxes = layoutSections(S1, (s) => S1_ITEMS[s._id]!);
    expectNoOverlaps(boxes, S1_ITEMS);
    // The grid stays a grid: the two top Sections share a row, and so do the bottom two.
    expect(boxes.get("vendors")!.y).toBe(boxes.get("money")!.y);
    expect(boxes.get("notes")!.y).toBe(boxes.get("inspirations")!.y);
    expect(boxes.get("inspirations")!.x).toBe(boxes.get("money")!.x);
  });

  it("moves the Sections below down when Money and dates grows with 3 Suggestions and Inspirations gets one", () => {
    const items = structuredClone(S1_ITEMS);
    const size = { w: 300, h: 200 };
    for (let i = 0; i < 3; i++) {
      const money = S1[0]!;
      items.money!.push({
        position: placeInFreeSpace(money, items.money!, size),
        size,
      });
    }
    items.inspirations!.push({
      position: placeInFreeSpace(S1[2]!, items.inspirations!, size),
      size,
    });
    // The third Suggestion goes below the 560 px frame, so the frame grows.
    expect(items.money![4]!.position.y + 200).toBeGreaterThan(560);
    const boxes = layoutSections(S1, (s) => items[s._id]!);
    expectNoOverlaps(boxes, items);
  });

  it("is the same every time for the same Canvas", () => {
    const a = layoutSections(S1, (s) => S1_ITEMS[s._id]!);
    const b = layoutSections([...S1].reverse(), (s) => S1_ITEMS[s._id]!);
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });
});
