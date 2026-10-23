import {
  FALLBACK_ITEM_SIZE,
  fitFrame,
  type Frame,
  type Placed,
  type Position,
  type Size,
} from "./placement";

/*
 * How a Section's stored frame becomes the box drawn on the Canvas. The frame
 * is the area that holds Items (lib/canvas/placement.ts); the drawn Section
 * adds padding around it and a label row above it. Items are drawn inside
 * their Section, offset by that padding.
 */

/** Padding left and right of a Section's frame. */
export const SECTION_PAD_X = 24;
/** The label row above a Section's frame. */
export const SECTION_HEADER = 56;
/** Padding below a Section's frame. */
export const SECTION_PAD_BOTTOM = 28;

/** The box a Section is drawn in, grown to hold every Item in it. */
export function sectionBox(frame: Frame, items: readonly Placed[]): Frame {
  const fitted = fitFrame(frame, items);
  return {
    x: fitted.x - SECTION_PAD_X,
    y: fitted.y - SECTION_HEADER,
    w: fitted.w + SECTION_PAD_X * 2,
    h: fitted.h + SECTION_HEADER + SECTION_PAD_BOTTOM,
  };
}

/** Where an Item is drawn inside its Section's box. */
export function itemOffsetInBox(position: Position): Position {
  return { x: position.x + SECTION_PAD_X, y: position.y + SECTION_HEADER };
}

/** The Item position stored for a point drawn inside a Section's box. */
export function itemPositionFromBox(offset: Position): Position {
  return {
    x: Math.max(0, Math.round(offset.x - SECTION_PAD_X)),
    y: Math.max(0, Math.round(offset.y - SECTION_HEADER)),
  };
}

/**
 * The Section an Item dropped at `topLeft` (Canvas coordinates) belongs to:
 * the one whose drawn box holds the Item's centre, or null when it is dropped
 * outside every Section. The last match wins, as later Sections draw on top.
 */
export function sectionUnder<S extends { box: Frame }>(
  sections: readonly S[],
  topLeft: Position,
  size: Size | null,
): S | null {
  const { w, h } = size ?? FALLBACK_ITEM_SIZE;
  const cx = topLeft.x + w / 2;
  const cy = topLeft.y + h / 2;
  let found: S | null = null;
  for (const section of sections) {
    const { x, y, w: bw, h: bh } = section.box;
    if (cx >= x && cx <= x + bw && cy >= y && cy <= y + bh) found = section;
  }
  return found;
}

/** The least space between two drawn Sections. */
export const SECTION_SPACING = 32;

function crowds(a: Frame, b: Frame, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

/**
 * Where every Section is drawn, so no two Sections, and so no two Items in
 * different Sections, ever overlap on screen. Each Section's box is its frame
 * grown to hold its Items, with padding and the label row. In `order`, each
 * box keeps its stored place unless it crowds a Section already placed; then
 * it moves right or down, whichever is the shorter way out, until it is clear.
 * The Canvas draws with it, and the server places new Sections with it, so
 * everyone sees the same layout.
 */
export function layoutSections<
  S extends { _id: string; frame: Frame; order: number },
>(
  sections: readonly S[],
  itemsOf: (section: S) => readonly Placed[],
): Map<string, Frame> {
  const sorted = [...sections].sort(
    (a, b) => a.order - b.order || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0),
  );
  const placed: Frame[] = [];
  const boxes = new Map<string, Frame>();
  for (const section of sorted) {
    const box = sectionBox(section.frame, itemsOf(section));
    // Each move only goes right or down, so this ends; the cap is a safeguard.
    for (let step = 0; step < 4 * sorted.length + 8; step++) {
      const blocker = placed.find((other) =>
        crowds(box, other, SECTION_SPACING),
      );
      if (!blocker) break;
      const right = blocker.x + blocker.w + SECTION_SPACING - box.x;
      const down = blocker.y + blocker.h + SECTION_SPACING - box.y;
      if (right <= down) box.x += right;
      else box.y += down;
    }
    placed.push(box);
    boxes.set(section._id, box);
  }
  return boxes;
}
