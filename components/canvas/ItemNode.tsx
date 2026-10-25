"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { GripHorizontal } from "lucide-react";
import {
  Component,
  memo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { ItemComments } from "@/components/comments/ItemComments";
import { itemComponentFor } from "@/components/items/registry";
import { PointingRing } from "@/components/shell/PointingRing";
import { useSetSelection } from "@/components/shell/selection";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  CanvasItemContext,
  ViewerAvatars,
  type CanvasItemState,
} from "./CanvasItemContext";
import { entryTargetFrom, passageTargetFrom, sameTarget } from "./domSelection";
import { useViewerPan } from "./viewerPan";

/*
 * An Item on the Canvas: a React Flow node holding the Item kind's own
 * component (components/items/registry.tsx), which reads the Canvas's state
 * for it with `useCanvasItem()`. The content is `nodrag`, `nopan` and
 * `nowheel`, so text selection, inputs and scrolling work as anywhere on the
 * page; the Item moves only by its handle (ADR 0010).
 */

export type { CanvasViewer } from "./CanvasItemContext";

export type ItemNodeData = {
  item: Doc<"items">;
  state: CanvasItemState;
  /** It arrived since this person opened the Canvas. */
  arrived: boolean;
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
  const { item, state, arrived, canMove } = data;
  const setSelection = useSetSelection();
  const contentRef = useRef<HTMLDivElement>(null);
  const pan = useViewerPan(!canMove);
  const Body = itemComponentFor(item.kind) as ComponentType<{
    item: Doc<"items">;
  }>;

  function selectFrom(target: EventTarget | null) {
    const root = contentRef.current;
    if (!root) return;
    const next =
      passageTargetFrom(window.getSelection(), root, item._id) ??
      entryTargetFrom(target instanceof Element ? target : null, item._id) ??
      ({ kind: "item", itemId: item._id } as const);
    // Clicking again on what is already selected changes nothing.
    if (!sameTarget(next, state.selection)) setSelection(next);
  }

  // `pointer-events-auto`: React Flow turns pointer events off on a node that
  // can't be dragged or selected, which is every Item for a Viewer. Its
  // content still needs clicks (selection, the Comment count).
  const body = (
    <div
      ref={contentRef}
      data-item-id={item._id}
      data-selected={state.selected ? "" : undefined}
      onPointerDown={pan.onPointerDown}
      onMouseUp={(event) => {
        // The release that ends a Viewer's pan isn't a click.
        if (!pan.wasPan()) selectFrom(event.target);
      }}
      onKeyUp={(event) => {
        if (event.key === "Shift" || event.key.startsWith("Arrow"))
          selectFrom(event.target);
      }}
      className={cn(
        "nodrag nopan nowheel pointer-events-auto size-full cursor-auto overflow-auto rounded-md select-text",
        "transition-[outline-color] duration-(--dur-feedback) ease-standard",
        "[&>article]:min-h-full",
        state.selected && "outline-2 outline-offset-2 outline-action",
        arrived &&
          !state.selected &&
          "outline-2 outline-offset-2 outline-action/60 motion-safe:duration-(--dur-arrival)",
      )}
    >
      <ItemErrorBoundary kind={KIND_NAMES[item.kind]}>
        <ItemComments itemId={item._id} itemLabel={KIND_NAMES[item.kind]}>
          <Body item={item} />
        </ItemComments>
      </ItemErrorBoundary>
    </div>
  );

  return (
    <CanvasItemContext.Provider value={state}>
      <div
        data-canvas-item={item.kind}
        data-function-key={item.functionKey ?? undefined}
        data-arrived={arrived ? "" : undefined}
        data-dimmed={state.dimmed ? "" : undefined}
        className={cn(
          "group/node relative size-full",
          "transition-opacity duration-(--dur-feedback) ease-standard",
          state.dimmed && "opacity-35",
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
              state.selected && "[@media(hover:hover)]:opacity-100",
            )}
            title={`Drag to move this ${KIND_NAMES[item.kind]}`}
          >
            <GripHorizontal aria-hidden className="size-3.5" />
          </div>
        ) : null}
        <ViewerAvatars
          viewers={state.viewers}
          className="absolute -top-3 right-3 z-10"
        />
        {state.pointed ? (
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
    </CanvasItemContext.Provider>
  );
}

export const ItemNode = memo(ItemNodeView);

/** One Item that fails to render shows a small notice; the rest of the Canvas keeps working. */
class ItemErrorBoundary extends Component<
  { kind: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex size-full items-center justify-center rounded-md border border-item-line bg-surface p-4 text-center text-label text-ink-2"
      >
        This {this.props.kind} couldn&apos;t be shown. Reload the page to try
        again.
      </div>
    );
  }
}

/** How an Item node is announced when focused, e.g. "Note, Mehendi". */
export function itemAriaLabel(
  item: Doc<"items">,
  functionName: string | undefined,
): string {
  const kind = KIND_NAMES[item.kind];
  return functionName ? `${kind}, ${functionName}` : kind;
}
