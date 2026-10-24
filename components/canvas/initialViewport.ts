import type { Viewport } from "@xyflow/react";
import type { Frame } from "@/lib/canvas/placement";

/*
 * Where the Canvas opens for someone with no saved view of it. Fitting every
 * Section into the window made Item text too small to read, so it opens on
 * the first Section (Money and dates) instead: at full size when it fits, and
 * never smaller than READABLE_ZOOM, where Item text is still legible. When
 * the Section is too big for the window at that zoom (a phone, a short
 * window), its top left corner stays in view, so the first Item is whole.
 * "Show the whole Canvas" still fits everything.
 */

/** The smallest zoom the Canvas opens at; Items' 12 to 13 px text stays legible. */
export const READABLE_ZOOM = 0.9;

/** Room kept around the Section: above it for the Function filter, below for the zoom controls. */
const PAD = { left: 24, right: 24, top: 64, bottom: 72 };

export function readableViewport(
  box: Frame,
  canvas: { width: number; height: number },
): Viewport {
  const fit = Math.min(
    (canvas.width - PAD.left - PAD.right) / box.w,
    (canvas.height - PAD.top - PAD.bottom) / box.h,
  );
  const zoom = Math.min(1, Math.max(READABLE_ZOOM, fit));
  return {
    x: PAD.left - box.x * zoom,
    y: PAD.top - box.y * zoom,
    zoom,
  };
}
