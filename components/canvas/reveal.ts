import type { Viewport } from "@xyflow/react";
import type { Frame } from "@/lib/canvas/placement";

/*
 * "Show me that Item" (a history row, a Chat reference, a new Note) selects
 * the Item; on the desktop Canvas it also pans there when the Item is out of
 * sight (review of #90). An Item with a good part in view is left where it
 * is, so clicking an Item on the Canvas doesn't move the view.
 */

/** How much of an Item must show, across and down, to count as in sight, in screen px. */
const IN_SIGHT = 96;

/** Whether an Item at `box` (Canvas coordinates) is out of sight on the visible Canvas. */
export function isOffScreen(
  box: Frame,
  viewport: Viewport,
  canvas: { width: number; height: number },
): boolean {
  const left = box.x * viewport.zoom + viewport.x;
  const top = box.y * viewport.zoom + viewport.y;
  const width = box.w * viewport.zoom;
  const height = box.h * viewport.zoom;
  const shownAcross = Math.min(left + width, canvas.width) - Math.max(left, 0);
  const shownDown = Math.min(top + height, canvas.height) - Math.max(top, 0);
  return (
    shownAcross < Math.min(IN_SIGHT, width) ||
    shownDown < Math.min(IN_SIGHT, height)
  );
}
