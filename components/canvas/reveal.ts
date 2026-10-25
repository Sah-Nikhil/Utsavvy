import type { Viewport } from "@xyflow/react";
import type { Frame } from "@/lib/canvas/placement";

/*
 * "Show me that Item" (a history row, a Chat reference) selects the Item; on
 * the desktop Canvas it also pans there when the Item is out of sight (review
 * of #90). An Item with any part in view is left where it is, so clicking an
 * Item on the Canvas never moves the view.
 */

/** Whether an Item at `box` (Canvas coordinates) is wholly outside the visible Canvas. */
export function isOffScreen(
  box: Frame,
  viewport: Viewport,
  canvas: { width: number; height: number },
): boolean {
  const left = box.x * viewport.zoom + viewport.x;
  const top = box.y * viewport.zoom + viewport.y;
  const right = left + box.w * viewport.zoom;
  const bottom = top + box.h * viewport.zoom;
  return (
    right <= 0 || bottom <= 0 || left >= canvas.width || top >= canvas.height
  );
}
