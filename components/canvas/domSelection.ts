import type { Id } from "@/convex/_generated/dataModel";
import type { SelectionTarget } from "@/lib/types/canvas";

/*
 * How the Canvas reads an Entry or a passage selection out of an Item's own
 * markup, so Item components don't each wire up `useSetSelection()`:
 *
 * - An Entry row carries `data-entry-id="<entries ID>"`. Clicking inside it
 *   selects that Entry.
 * - Text that can be quoted carries `data-passage-field="<field name>"`, inside
 *   an Entry row when it is one of the Entry's fields. Selecting text within
 *   one such element selects that passage, with offsets into its text.
 */

/** The Entry row an element sits in, if any. */
export function entryTargetFrom(
  element: Element | null,
  itemId: Id<"items">,
): SelectionTarget | null {
  const row = element?.closest<HTMLElement>("[data-entry-id]");
  const entryId = row?.dataset.entryId;
  if (!entryId) return null;
  return { kind: "entry", itemId, entryId: entryId as Id<"entries"> };
}

/** Characters of `root`'s text before (`node`, `offset`). */
function offsetWithin(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The passage the person has selected inside this Item, if any. */
export function passageTargetFrom(
  selection: Selection | null,
  itemRoot: Element,
  itemId: Id<"items">,
): SelectionTarget | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null;
  const range = selection.getRangeAt(0);
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const field = start?.closest<HTMLElement>("[data-passage-field]");
  if (!field || !itemRoot.contains(field)) return null;
  // A passage stays within one field.
  if (!field.contains(range.endContainer)) return null;
  const from = offsetWithin(field, range.startContainer, range.startOffset);
  const to = offsetWithin(field, range.endContainer, range.endOffset);
  const quote = (field.textContent ?? "").slice(from, to);
  if (quote.trim() === "") return null;
  const entryId =
    field.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId ?? null;
  return {
    kind: "passage",
    itemId,
    entryId: entryId as Id<"entries"> | null,
    field: field.dataset.passageField ?? "text",
    start: from,
    end: to,
    quote,
  };
}

/** Whether two selection targets point at the same thing. */
export function sameTarget(
  a: SelectionTarget | null,
  b: SelectionTarget | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
