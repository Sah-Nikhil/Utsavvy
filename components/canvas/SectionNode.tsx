"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { memo } from "react";
import { VendorMap } from "@/components/map/VendorMap";
import { SectionOrnament } from "@/components/shell/SectionOrnament";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { SECTION_PAD_X } from "@/lib/canvas/layout";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { useSectionDialogs } from "./SectionDialogs";

/*
 * A Section on the Canvas: a React Flow group node drawn as a softly filled
 * region with look D's corner pieces. Its Items are child nodes, drawn on top.
 * It moves by its label row; the corner pieces follow the Ornaments setting
 * and the label lines up with the Items when they are off.
 */

export type SectionNodeData = {
  section: Doc<"sections">;
  eventId: Id<"events">;
  itemCount: number;
  canMove: boolean;
  canRename: boolean;
  canDelete: boolean;
};
export type SectionNodeType = Node<SectionNodeData, "section">;

export const SECTION_DRAG_HANDLE = "canvas-section-handle";

function SectionNodeView({ data }: NodeProps<SectionNodeType>) {
  const { section, eventId, itemCount, canMove, canRename, canDelete } = data;
  const dialogs = useSectionDialogs();
  const count = `${itemCount} ${itemCount === 1 ? "Item" : "Items"}`;
  return (
    <section
      aria-label={`${section.name}, ${count}`}
      data-section-id={section._id}
      data-section-kind={section.kind}
      className="relative size-full rounded-xl bg-surface/40"
    >
      <SectionOrnament />
      <div
        className={cn(
          SECTION_DRAG_HANDLE,
          "group/label flex h-14 items-center gap-2 pr-3",
          canMove && "cursor-grab active:cursor-grabbing",
        )}
        style={{ paddingLeft: SECTION_PAD_X }}
      >
        <div className="flex min-w-0 items-center gap-2.5 pl-10 ornaments-off:pl-0">
          <h2
            className={cn(
              "truncate text-[15px] leading-[1.45] text-ink",
              scriptClass(section.name)
                ? ["font-text font-medium", scriptClass(section.name)]
                : "font-display font-medium!",
            )}
          >
            {section.name}
          </h2>
          <span className="shrink-0 font-display text-label text-ink-3">
            {count}
          </span>
        </div>
        {canMove ? (
          <GripVertical
            aria-hidden
            className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity duration-(--dur-feedback) ease-standard group-hover/label:opacity-100"
          />
        ) : null}
        <div className="flex-1" />
        {section.kind === "vendors" ? (
          // S15 fills <VendorMap>: the map lives in the Vendors Section's label
          // row (a preview that opens the full-screen map), so Items never sit under it.
          <div data-mount="vendor-map" className="nodrag nopan nowheel">
            <VendorMap eventId={eventId} />
          </div>
        ) : null}
        {canRename || canDelete ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="text"
                  size="sm"
                  icon
                  aria-label={`${section.name} Section actions`}
                  className="nodrag nopan"
                />
              }
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent align="end">
              {canRename ? (
                <MenuItem
                  icon={<Pencil />}
                  onClick={() => dialogs.rename(section)}
                >
                  Rename
                </MenuItem>
              ) : null}
              {canDelete ? (
                <MenuItem
                  icon={<Trash2 />}
                  tone="danger"
                  onClick={() => dialogs.remove(section)}
                >
                  Delete Section
                </MenuItem>
              ) : null}
            </MenuContent>
          </Menu>
        ) : null}
      </div>
    </section>
  );
}

export const SectionNode = memo(SectionNodeView);
