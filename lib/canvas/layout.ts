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
