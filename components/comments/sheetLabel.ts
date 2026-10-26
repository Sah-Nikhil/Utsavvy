import type { CommentView, CommentViewTarget } from "./threads";

/**
 * The Entry the Comments sheet is on, as its header names it: the live name
 * its Comments carry, so a rename while the sheet is open shows, else the
 * name the row gave when it opened the sheet (before any Comment exists).
 */
export function sheetEntryLabel(
  openOn: CommentViewTarget | null,
  rowLabel: string | null,
  comments: readonly CommentView[] | undefined,
): string | null {
  if (openOn?.kind !== "entry") return null;
  return (
    comments?.find(
      (c) => c.target.kind === "entry" && c.target.entryId === openOn.entryId,
    )?.entryLabel ??
    rowLabel ??
    null
  );
}
