"use client";

import type { ComponentType } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import type { ItemKind } from "@/lib/types/canvas";
import { BudgetItem } from "./budget/BudgetItem";
import { ChecklistItem } from "./checklist/ChecklistItem";
import { InspirationItem } from "./inspiration/InspirationItem";
import { ItemFrame } from "./ItemFrame";
import { NoteItem } from "./note/NoteItem";
import { SuggestionItem } from "./suggestion/SuggestionItem";
import { TimelineItem } from "./timeline/TimelineItem";

/** Every Item component gets its own row, narrowed to its kind. */
export type ItemComponentProps<K extends ItemKind = ItemKind> = {
  item: Extract<Doc<"items">, { kind: K }>;
};
export type ItemComponent<K extends ItemKind = ItemKind> = ComponentType<
  ItemComponentProps<K>
>;

const KIND_LABELS: Record<ItemKind, string> = {
  budget: "Budget",
  timeline: "Timeline",
  checklist: "Vendor checklist",
  shortlistedVendor: "Shortlisted Vendor",
  googlePlace: "Google place",
  inspiration: "Inspiration",
  suggestion: "Suggestion",
  note: "Note",
};

/** A placeholder until the kind's slice replaces it in its own folder. */
function placeholder<K extends ItemKind>(
  kind: K,
  slice: string,
): ItemComponent<K> {
  function NotBuiltYetItem() {
    return (
      <ItemFrame title={KIND_LABELS[kind]} kind={KIND_LABELS[kind]}>
        <p className="text-label text-ink-3">Arrives with {slice}.</p>
      </ItemFrame>
    );
  }
  NotBuiltYetItem.displayName = `ItemPlaceholder(${kind})`;
  return NotBuiltYetItem;
}

/**
 * Item kind to component (shared registry). Each slice swaps its placeholder
 * for the component in `components/items/<kind>/`.
 */
export const ITEM_COMPONENTS: { [K in ItemKind]: ItemComponent<K> } = {
  budget: BudgetItem,
  timeline: TimelineItem,
  checklist: ChecklistItem,
  shortlistedVendor: placeholder("shortlistedVendor", "S9"),
  googlePlace: placeholder("googlePlace", "S20"),
  inspiration: InspirationItem,
  suggestion: SuggestionItem,
  note: NoteItem,
};

export function itemComponentFor<K extends ItemKind>(
  kind: K,
): ItemComponent<K> {
  return ITEM_COMPONENTS[kind];
}
