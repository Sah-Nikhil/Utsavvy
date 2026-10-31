import type { KeyboardEvent, ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * A hand-typed Vendor's Marker on the map (issue #136). A Member who may move
 * Markers gets a button they can nudge with the arrow keys; anyone else gets a
 * named picture, out of the tab order, that "Show" can still focus.
 */
export function HandTypedMarker({
  id,
  label,
  movable,
  onKeyDown,
  children,
}: {
  id: Id<"privateVendors">;
  label: string;
  movable: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** The Marker's stamp. */
  children: ReactNode;
}) {
  if (!movable)
    return (
      <span
        role="img"
        tabIndex={-1}
        data-hand-typed-marker={id}
        aria-label={label}
        className="block rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {children}
      </span>
    );
  return (
    <button
      type="button"
      data-hand-typed-marker={id}
      aria-label={label}
      aria-describedby="map-place-hint"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      className="group/stamp block cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}
