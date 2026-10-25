import type { CommentView, CommentViewTarget } from "./threads";

/**
 * The Entry the Comments sheet is on, as its header names it: the name the
 * row gave when it opened the sheet, or the one its Comments carry.
 */
export function sheetEntryLabel(
  openOn: CommentViewTarget | null,
  rowLabel: string | null,
  comments: readonly CommentView[] | undefined,
): string | null {
  if (openOn?.kind !== "entry") return null;
  return (
    rowLabel ??
    comments?.find(
      (c) => c.target.kind === "entry" && c.target.entryId === openOn.entryId,
    )?.entryLabel ??
    null
  );
}
