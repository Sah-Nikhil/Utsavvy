"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { LayoutList } from "lucide-react";
import type { CanvasItemState } from "@/components/canvas/CanvasItemContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompactItem, KIND_NAMES } from "./CompactItem";

/*
 * The preview sheet over the Chat on a phone (mobile pointing "sheet"): the
 * referenced Item, as the same Item component, with a way on to the Canvas tab.
 */

export function ItemPreviewSheet({
  eventId,
  itemId,
  onClose,
  onOpenOnCanvas,
}: {
  eventId: string;
  itemId: string | null;
  onClose: () => void;
  onOpenOnCanvas: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(
    api.canvas.get,
    isAuthenticated && itemId !== null
      ? { eventId: eventId as Id<"events"> }
      : "skip",
  );
  const item = data?.items.find((i) => i._id === itemId) ?? null;
  const functionName = item?.functionKey
    ? data?.functions.find((fn) => fn.key === item.functionKey)?.name
    : undefined;
  const state: CanvasItemState | null = item
    ? {
        itemId: item._id,
        selection: null,
        selected: false,
        pointed: false,
        pointedEntryIds: new Set(),
        viewers: [],
        viewersByEntry: new Map(),
        functionName,
        dimmed: false,
      }
    : null;

  return (
    <Sheet
      open={itemId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        title={item ? KIND_NAMES[item.kind] : "Item"}
        description={functionName ?? (item ? "For the whole Event" : undefined)}
        bodyClassName="pt-3"
      >
        <div data-mount="item-preview" className="grid gap-4">
          {item && state ? (
            <ul className="grid">
              <CompactItem
                item={item}
                state={state}
                position={{ index: 0, count: 1 }}
              />
            </ul>
          ) : data === undefined ? (
            <p role="status" className="text-label text-ink-3">
              Opening the Item…
            </p>
          ) : (
            <p className="text-label text-ink-2">
              This Item isn&apos;t on the Canvas any more.
            </p>
          )}
          {item ? (
            <Button variant="tonal" onClick={onOpenOnCanvas}>
              <LayoutList aria-hidden />
              Show on the Canvas tab
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
