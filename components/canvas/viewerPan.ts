"use client";

import { useReactFlow } from "@xyflow/react";
import { useCallback, useRef, type PointerEvent } from "react";

/*
 * Dragging over an Item pans the Canvas for someone who can't move Items, a
 * Viewer (review of #91). An Item's content is `nopan`, so text selection and
 * inputs work; for a Member that's right, since an Item moves by its handle.
 * A Viewer has no handle, and on a full Canvas every place they could grab is
 * an Item. So a drag that starts on an Item's text (not on a button, link or
 * field) moves the view instead. A click without movement still selects, and
 * a double-click still selects a word.
 */

/** Controls inside an Item that keep their own pointer behaviour. */
const OWN_POINTER =
  "a, button, input, textarea, select, label, summary, [role='button'], [role='menuitem'], [role='checkbox'], [role='switch'], [contenteditable='true']";

/** How far the pointer moves before a press becomes a pan, in px. */
const PAN_AFTER = 4;

export function useViewerPan(enabled: boolean) {
  const flow = useReactFlow();
  // Set while a pan is under way and until the release that ends it, so the
  // release doesn't also change the selection.
  const panned = useRef(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      panned.current = false;
      if (!enabled || event.button !== 0 || event.pointerType === "touch")
        return;
      if ((event.target as Element).closest(OWN_POINTER)) return;
      const start = { x: event.clientX, y: event.clientY };
      const from = flow.getViewport();
      const root = document.documentElement;
      const userSelect = root.style.userSelect;

      const move = (e: globalThis.PointerEvent) => {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!panned.current) {
          if (Math.hypot(dx, dy) < PAN_AFTER) return;
          panned.current = true;
          root.style.userSelect = "none";
        }
        window.getSelection()?.removeAllRanges();
        void flow.setViewport({
          x: from.x + dx,
          y: from.y + dy,
          zoom: from.zoom,
        });
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        root.style.userSelect = userSelect;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [enabled, flow],
  );

  /** Whether the press that just ended was a pan, not a click. */
  const wasPan = useCallback(() => panned.current, []);

  return { onPointerDown, wasPan };
}
