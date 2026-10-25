"use client";

import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal } from "lucide-react";
import {
  Component,
  memo,
  useRef,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  CanvasItemContext,
  ViewerAvatars,
  type CanvasItemState,
} from "@/components/canvas/CanvasItemContext";
import {
  entryTargetFrom,
  passageTargetFrom,
  sameTarget,
} from "@/components/canvas/domSelection";
import { ItemComments } from "@/components/comments/ItemComments";
import { itemComponentFor } from "@/components/items/registry";
import { PointingRing } from "@/components/shell/PointingRing";
import { useSetSelection } from "@/components/shell/selection";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/*
 * One Item in Compact mode: the Item kind's own component from the shared
 * registry, inside the same Comments wrapper and Canvas state the freeform
 * Canvas gives it, so an Item looks and works the same in both views. It sits
 * at its natural height in a list instead of at a size on the Canvas.
 */

export const KIND_NAMES: Record<Doc<"items">["kind"], string> = {
  budget: "Budget",
  timeline: "Timeline",
  checklist: "Vendor checklist",
  shortlistedVendor: "Shortlisted Vendor",
  googlePlace: "Google place",
  inspiration: "Inspiration",
  suggestion: "Suggestion",
  note: "Note",
};

export type CompactItemProps = {
  item: Doc<"items">;
  state: CanvasItemState;
  /** Where it sits in its group, for "Move up" and "Move down". */
  position: { index: number; count: number };
  onMove?: (delta: -1 | 1) => void;
  /** The drag handle's ref, from dnd kit; absent where dragging is off. */
  handleRef?: Ref<HTMLButtonElement>;
  /** The row's ref, for dnd kit's sortable. */
  rowRef?: Ref<HTMLLIElement>;
  /** Just jumped to from a reference in the Chat. */
  focused?: boolean;
  dragging?: boolean;
};

function CompactItemView({
  item,
  state,
  position,
  onMove,
  handleRef,
  rowRef,
  focused = false,
  dragging = false,
}: CompactItemProps) {
  const setSelection = useSetSelection();
  const contentRef = useRef<HTMLDivElement>(null);
  const Body = itemComponentFor(item.kind) as ComponentType<{
    item: Doc<"items">;
  }>;
  const kind = KIND_NAMES[item.kind];
  const name = state.functionName ? `${kind}, ${state.functionName}` : kind;

  function selectFrom(target: EventTarget | null) {
    const root = contentRef.current;
    if (!root) return;
    const next =
      passageTargetFrom(window.getSelection(), root, item._id) ??
      entryTargetFrom(target instanceof Element ? target : null, item._id) ??
      ({ kind: "item", itemId: item._id } as const);
    if (!sameTarget(next, state.selection)) setSelection(next);
  }

  const body = (
    <div
      ref={contentRef}
      data-item-id={item._id}
      data-selected={state.selected ? "" : undefined}
      onMouseUp={(event) => selectFrom(event.target)}
      onTouchEnd={(event) => selectFrom(event.target)}
      onKeyUp={(event) => {
        if (event.key === "Shift" || event.key.startsWith("Arrow"))
          selectFrom(event.target);
      }}
      className={cn(
        "rounded-md select-text",
        "transition-[outline-color] duration-(--dur-feedback) ease-standard",
        state.selected && "outline-2 outline-offset-2 outline-action",
      )}
    >
      <ItemErrorBoundary kind={kind}>
        <ItemComments itemId={item._id} itemLabel={kind}>
          <Body item={item} />
        </ItemComments>
      </ItemErrorBoundary>
    </div>
  );

  const canMove = onMove !== undefined && position.count > 1;

  return (
    <CanvasItemContext.Provider value={state}>
      <li
        ref={rowRef}
        data-compact-item={item.kind}
        data-item-row={item._id}
        data-function-key={item.functionKey ?? undefined}
        data-focused={focused ? "" : undefined}
        className={cn(
          "group/row relative rounded-lg",
          "scroll-mt-28 transition-[opacity,translate] duration-(--dur-feedback) ease-standard",
          dragging && "opacity-60",
          focused &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-(--dur-arrival) motion-safe:ease-emphasized",
        )}
      >
        {handleRef || canMove ? (
          // The same pill as the freeform Canvas's drag handle, straddling the
          // Item's top edge: shown on hover or focus where hover exists, always
          // on touch screens.
          <div
            className={cn(
              "absolute -top-3.5 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center rounded-full border border-item-line bg-surface-raised px-0.5 text-ink-3 shadow-item",
              "transition-opacity duration-(--dur-feedback) ease-standard",
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100",
              "has-data-popup-open:opacity-100",
            )}
          >
            {handleRef ? (
              <button
                type="button"
                ref={handleRef}
                aria-label={`Drag to reorder ${name}`}
                title="Drag to reorder"
                // The Move up / Move down actions are the keyboard route.
                tabIndex={-1}
                className="state-layer hidden h-6 w-7 cursor-grab touch-none items-center justify-center rounded-full active:cursor-grabbing [@media(pointer:fine)]:flex"
              >
                <GripVertical aria-hidden className="size-3.5" />
              </button>
            ) : null}
            {canMove ? (
              <Menu>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Reorder ${name}`}
                      className="state-layer flex h-6 w-7 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    />
                  }
                >
                  <MoreHorizontal aria-hidden className="size-3.5" />
                </MenuTrigger>
                <MenuContent align="center">
                  <MenuItem
                    icon={<ArrowUp />}
                    disabled={position.index === 0}
                    onClick={() => onMove(-1)}
                  >
                    Move up
                  </MenuItem>
                  <MenuItem
                    icon={<ArrowDown />}
                    disabled={position.index === position.count - 1}
                    onClick={() => onMove(1)}
                  >
                    Move down
                  </MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
          </div>
        ) : null}
        <ViewerAvatars
          viewers={state.viewers}
          className="absolute -top-3 right-3 z-10"
        />
        {state.pointed ? (
          <PointingRing radiusClassName="rounded-md" labelAlign="start">
            {body}
          </PointingRing>
        ) : (
          body
        )}
      </li>
    </CanvasItemContext.Provider>
  );
}

export const CompactItem = memo(CompactItemView);

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
        className="rounded-md border border-item-line bg-surface p-4 text-center text-label text-ink-2"
      >
        This {this.props.kind} couldn&apos;t be shown. Reload the page to try
        again.
      </div>
    );
  }
}
