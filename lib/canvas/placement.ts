/*
 * Where a new Item goes on the freeform Canvas (ADR 0007): into free space in
 * its Section, never on top of another Item.
 *
 * Coordinates: a Section's `frame` is the area that holds its Items, in Canvas
 * coordinates. An Item's `position` is relative to the top left of its
 * Section's frame, so (0, 0) is the first slot. The Section's label and padding
 * are drawn around the frame and are not part of it (components/canvas).
 */

export type Position = { x: number; y: number };
export type Size = { w: number; h: number };
export type Frame = Position & Size;

/** Anything placed in a Section: an Item, or a Section on the Canvas. */
export type Placed = { position: Position; size: Size | null };

/** The space kept between two Items, and between a Section's Items and its edge. */
export const ITEM_GAP = 20;

/** The size of an Item that has no size of its own stored. */
export const FALLBACK_ITEM_SIZE: Size = { w: 300, h: 200 };

function sizeOf(placed: Placed, defaultSize: Size): Size {
  return placed.size ?? defaultSize;
}

/** Whether two boxes come closer than `gap` to each other. */
function crowds(a: Position & Size, b: Position & Size, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

/**
 * The first free spot for an Item of `size` in `section`: the top left of the
 * Section if it is empty, otherwise the highest, then leftmost, spot that keeps
 * `ITEM_GAP` from every Item and fits within the Section's width. So a Section
 * fills left to right, then down. When no spot fits within the frame's height,
 * the spot is below the lowest Item, and the frame grows to hold it (`fitFrame`).
 *
 * Example: a Section 640 px wide with 300 x 200 Items at (0, 0) and (320, 0)
 * puts a new 300 x 200 Item at (0, 220).
 *
 * Published interface: X2 (References) calls it too. Keep the signature.
 */
export function placeInFreeSpace(
  section: { frame: Frame },
  items: readonly Placed[],
  size: Size,
): Position {
  const width = section.frame.w;
  const boxes = items.map((placed) => ({
    ...placed.position,
    ...sizeOf(placed, FALLBACK_ITEM_SIZE),
  }));

  // Every free spot touches the Section's edge or sits one gap past an Item.
  const xs = new Set<number>([0]);
  const ys = new Set<number>([0]);
  for (const box of boxes) {
    xs.add(box.x + box.w + ITEM_GAP);
    ys.add(box.y + box.h + ITEM_GAP);
  }
  const sortedXs = [...xs].filter((x) => x >= 0).sort((a, b) => a - b);
  const sortedYs = [...ys].filter((y) => y >= 0).sort((a, b) => a - b);

  for (const y of sortedYs) {
    for (const x of sortedXs) {
      // An Item wider than the Section still gets the left edge of a row.
      if (x > 0 && x + size.w > width) continue;
      const candidate = { x, y, ...size };
      if (!boxes.some((box) => crowds(candidate, box, ITEM_GAP))) {
        return { x, y };
      }
    }
  }
  // Unreachable: the lowest row below every Item is always free.
  const bottom = Math.max(0, ...boxes.map((box) => box.y + box.h + ITEM_GAP));
  return { x: 0, y: bottom };
}

/**
 * The Section frame grown, if needed, to hold every Item. It never shrinks,
 * so Members keep the room they made, and it keeps its top left corner.
 */
export function fitFrame(
  frame: Frame,
  items: readonly Placed[],
  defaultSize: Size = FALLBACK_ITEM_SIZE,
): Frame {
  let w = frame.w;
  let h = frame.h;
  for (const placed of items) {
    const size = sizeOf(placed, defaultSize);
    w = Math.max(w, placed.position.x + size.w);
    h = Math.max(h, placed.position.y + size.h);
  }
  return { x: frame.x, y: frame.y, w, h };
}
