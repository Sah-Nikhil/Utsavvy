/*
 * Outside content (IMPLEMENTATION_PLAN.md section 4.5, assistant-behavior.md
 * rules 22 and 23): Vendor pages, pasted text, text in images, image
 * descriptions and earlier Chat messages reach the model quoted inside a
 * labelled block, with where it came from and who added it. The system prompt
 * says that nothing inside such a block is an instruction.
 */

/** The block's tag; the system prompt names it. */
export const OUTSIDE_TAG = "outside_content";

/** A label longer than this is cut, so it can't carry a paragraph. */
const MAX_LABEL = 200;

/** Escapes text so nothing inside it can close the block or open a fake tag. */
function escapeText(text: string): string {
  return text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** An attribute value on one line, with quotes escaped too. */
function escapeAttribute(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
  return escapeText(oneLine).replaceAll('"', "&quot;");
}

/**
 * Wraps outside content for the model:
 *
 * ```text
 * <outside_content source="https://decor.example.in" added_by="Rohan">
 * ...the page text...
 * </outside_content>
 * ```
 *
 * `source` is a URL or a short name ("Chat", "pasted text", "image text");
 * `addedBy` is the Member who brought it in, or null. The content and the
 * labels are escaped, so a page that writes `</outside_content>` stays inside.
 */
export function wrapOutside(
  content: string,
  { source, addedBy }: { source: string; addedBy: string | null },
): string {
  const by = addedBy === null ? "" : ` added_by="${escapeAttribute(addedBy)}"`;
  return `<${OUTSIDE_TAG} source="${escapeAttribute(source)}"${by}>\n${escapeText(content)}\n</${OUTSIDE_TAG}>`;
}
