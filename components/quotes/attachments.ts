/*
 * Quote attachments (docs/design/vendors.md, "Quotes"): a photo or PDF of the
 * quote, at most 10 MB, recognised by its own first bytes whatever type the
 * browser claimed. Pure, so the form and `api.quotes.add` share the checks.
 * Relative imports only, because Convex bundles this file too.
 */

import { sniffImageType } from "../../lib/inspirations/uploads";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentType =
  "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** What the file input offers. */
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** The attachment's type from its first bytes, or null when it is no JPEG, PNG, WebP or PDF. */
export function sniffAttachmentType(bytes: Uint8Array): AttachmentType | null {
  const image = sniffImageType(bytes);
  if (image !== null) return image;
  if (PDF_MAGIC.every((value, i) => bytes[i] === value))
    return "application/pdf";
  return null;
}

/** "pdf" or "image" from a stored file's content type, for the link's label. */
export function attachmentKind(
  contentType: string | undefined | null,
): "pdf" | "image" | null {
  if (!contentType) return null;
  if (contentType === "application/pdf") return "pdf";
  return contentType.startsWith("image/") ? "image" : null;
}
