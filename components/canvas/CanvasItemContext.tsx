"use client";

import { createContext, useContext } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import type { FunctionIndex } from "@/components/ui/function-marker";
import type { Id } from "@/convex/_generated/dataModel";
import type { SelectionTarget } from "@/lib/types/canvas";

/*
 * What the Canvas knows about one Item, for the Item kind's own component
 * (components/items/<kind>/) to use. Every Item component renders inside the
 * Canvas's Item node, which provides it; call `useCanvasItem()` from the
 * component or anything inside it.
 *
 * The Canvas already draws, around the whole Item: the selection outline, the
 * Assistant's pointing ring, and the avatars of people who have the Item itself
 * selected. An Item component adds what only it can place:
 *
 *   const canvas = useCanvasItem();
 *   // On each Entry row (marked data-entry-id so clicking selects it):
 *   <tr data-entry-id={entry._id} data-pointed={canvas?.pointedEntryIds.has(entry._id) || undefined}>
 *     ...
 *     <ViewerAvatars viewers={canvas?.viewersByEntry.get(entry._id) ?? []} />
 *   </tr>
 *   // For <ItemFrame>: functionIndex={canvas?.functionIndex} functionName={canvas?.functionName}
 *
 * Outside the Canvas (Compact mode, S16) it returns null, so components must
 * work without it.
 */

export type CanvasViewer = {
  membershipId: string;
  name: string;
  imageUrl: string | null;
};

export type CanvasItemState = {
  itemId: Id<"items">;
  /** This person's selection when it is on this Item (the Item, an Entry or a passage), else null. */
  selection: SelectionTarget | null;
  /** This person has the Item, or something on it, selected. */
  selected: boolean;
  /** The Assistant is pointing at the Item or something on it, right now. */
  pointed: boolean;
  /** The Entries the Assistant is pointing at, right now. */
  pointedEntryIds: ReadonlySet<string>;
  /** Other people who have the Item itself selected. */
  viewers: readonly CanvasViewer[];
  /** Other people who have one of its Entries (or a passage in one) selected, by Entry ID. */
  viewersByEntry: ReadonlyMap<string, readonly CanvasViewer[]>;
  /** The Item's Function and its colour, when it belongs to one. */
  functionIndex?: FunctionIndex;
  functionName?: string;
  /** The Function filter dims this Item. */
  dimmed: boolean;
};

export const CanvasItemContext = createContext<CanvasItemState | null>(null);

/** The Canvas's state for the Item this component renders, or null outside the Canvas. */
export function useCanvasItem(): CanvasItemState | null {
  return useContext(CanvasItemContext);
}

/** Small avatars of the people looking at something, e.g. an Entry row. */
export function ViewerAvatars({
  viewers,
  className,
}: {
  viewers: readonly CanvasViewer[];
  className?: string;
}) {
  if (viewers.length === 0) return null;
  return (
    <AvatarStack className={className}>
      {viewers.slice(0, 3).map((viewer) => (
        <Avatar
          key={viewer.membershipId}
          name={viewer.name}
          src={viewer.imageUrl ?? undefined}
          size="sm"
          presence="online"
        />
      ))}
    </AvatarStack>
  );
}
