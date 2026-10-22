"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { GripHorizontal } from "lucide-react";
import { memo, useRef, type ComponentType } from "react";
import { itemComponentFor } from "@/components/items/registry";
import { PointingRing } from "@/components/shell/PointingRing";
import { useSetSelection } from "@/components/shell/selection";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { entryTargetFrom, passageTargetFrom } from "./domSelection";

/*
 * An Item on the Canvas: a React Flow node holding the Item kind's own
 * component (components/items/registry.tsx). The content is `nodrag`, `nopan`
 * and `nowheel`, so text selection, inputs and scrolling work as anywhere on
 * the page; the Item moves only by its handle (ADR 0010).
 */

export type CanvasViewer = {
  membershipId: string;
  name: string;
  imageUrl: string | null;
};

export type ItemNodeData = {
  item: Doc<"items">;
  /** This person has the Item, or something on it, selected. */
  isSelected: boolean;
  /** The Assistant is pointing at it. */
  pointed: boolean;
  /** The Function filter dims it. */
  dimmed: boolean;
  /** It arrived since this person opened the Canvas. */
  arrived: boolean;
  /** Other people who have it, or something on it, selected. */
  viewers: CanvasViewer[];
  canMove: boolean;
};
export type ItemNodeType = Node<ItemNodeData, "item">;

export const ITEM_DRAG_HANDLE = "canvas-item-handle";

const KIND_NAMES: Record<Doc<"items">["kind"], string> = {
  budget: "Budget",
  timeline: "Timeline",
  checklist: "Vendor checklist",
  shortlistedVendor: "Shortlisted Vendor",
  googlePlace: "Google place",
  inspiration: "Inspiration",
  suggestion: "Suggestion",
  note: "Note",
};

function ItemNodeView({ data }: NodeProps<ItemNodeType>) {
  const { item, isSelected, pointed, dimmed, arrived, viewers, canMove } = data;
  const setSelection = useSetSelection();
  const contentRef = useRef<HTMLDivElement>(null);
  const Body = itemComponentFor(item.kind) as ComponentType<{
    item: Doc<"items">;
  }>;

  function selectFrom(target: EventTarget | null) {
    const root = contentRef.current;
    if (!root) return;
    const passage = passageTargetFrom(window.getSelection(), root, item._id);
    if (passage) return setSelection(passage);
    const entry = entryTargetFrom(
      target instanceof Element ? target : null,
      item._id,
    );
    setSelection(entry ?? { kind: "item", itemId: item._id });
  }

  const body = (
    <div
      ref={contentRef}
      data-item-id={item._id}
      data-selected={isSelected ? "" : undefined}
      onMouseUp={(event) => selectFrom(event.target)}
      onKeyUp={(event) => {
        if (event.key === "Shift" || event.key.startsWith("Arrow"))
          selectFrom(event.target);
      }}
      className={cn(
        "nodrag nopan nowheel size-full overflow-auto rounded-md",
        "transition-[outline-color] duration-(--dur-feedback) ease-standard",
        "[&>article]:min-h-full",
        isSelected && "outline-2 outline-offset-2 outline-action",
        arrived &&
          !isSelected &&
          "outline-2 outline-offset-2 outline-action/60 motion-safe:duration-(--dur-arrival)",
      )}
    >
      <Body item={item} />
    </div>
  );

  return (
    <div
      data-canvas-item={item.kind}
      data-function-key={item.functionKey ?? undefined}
      data-arrived={arrived ? "" : undefined}
      data-dimmed={dimmed ? "" : undefined}
      className={cn(
        "group/node relative size-full",
        "transition-opacity duration-(--dur-feedback) ease-standard",
        dimmed && "opacity-35",
      )}
    >
      {canMove ? (
        <div
          className={cn(
            ITEM_DRAG_HANDLE,
            "absolute -top-3 left-1/2 z-10 flex h-5 w-12 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-item-line bg-surface-raised text-ink-3 shadow-item active:cursor-grabbing",
            "transition-opacity duration-(--dur-feedback) ease-standard",
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/node:opacity-100",
            "group-focus-within/node:opacity-100",
            isSelected && "[@media(hover:hover)]:opacity-100",
          )}
          title={`Drag to move this ${KIND_NAMES[item.kind]}`}
        >
          <GripHorizontal aria-hidden className="size-3.5" />
        </div>
      ) : null}
      {viewers.length > 0 ? (
        <AvatarStack className="absolute -top-3 right-3 z-10">
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
      ) : null}
      {pointed ? (
        <PointingRing
          radiusClassName="rounded-md"
          labelAlign="start"
          className="size-full"
        >
          {body}
        </PointingRing>
      ) : (
        body
      )}
    </div>
  );
}

export const ItemNode = memo(ItemNodeView);

/** How an Item node is announced when focused, e.g. "Note, Mehendi". */
export function itemAriaLabel(
  item: Doc<"items">,
  functionName: string | undefined,
): string {
  const kind = KIND_NAMES[item.kind];
  return functionName ? `${kind}, ${functionName}` : kind;
}
