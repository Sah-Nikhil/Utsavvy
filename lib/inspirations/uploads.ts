/*
 * S13: the upload rules (inspirations.md rules 4 and 5). The browser checks a
 * batch before it uploads anything; the server checks each stored file again
 * by its own bytes, never by the type the browser claimed.
 */

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOADS_PER_BATCH = 10;
/** The browser shrinks each photo to this on its long side before uploading. */
export const UPLOAD_LONG_SIDE = 2048;

/** The rights wording, shown on the Event setting and on each batch's tick (rule 5). */
export const UPLOAD_RIGHTS_WORDING =
  "Members have the right to use the images they upload, or use them only for our private planning.";

export type UploadFile = { name: string; type: string; size: number };

export type BatchCheck =
  | { ok: true }
  | {
      ok: false;
      problem: "empty" | "count" | "type" | "size" | "rights";
      message: string;
    };

export function isUploadType(type: string): type is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(type);
}

/**
 * Checks one batch: 1 to 10 files, each JPEG, PNG or WebP of at most 10 MB,
 * and the rights tick when the Event's upload rights setting is off.
 */
export function checkUploadBatch(
  files: readonly UploadFile[],
  rights: { rightsOn: boolean; ticked: boolean },
): BatchCheck {
  if (files.length === 0)
    return {
      ok: false,
      problem: "empty",
      message: "Choose at least one photo.",
    };
  if (files.length > MAX_UPLOADS_PER_BATCH)
    return {
      ok: false,
      problem: "count",
      message: `Upload up to ${MAX_UPLOADS_PER_BATCH} photos at a time.`,
    };
  for (const file of files) {
    if (!isUploadType(file.type))
      return {
        ok: false,
        problem: "type",
        message: `${file.name} isn't a photo. Upload JPEG, PNG or WebP images.`,
      };
    if (file.size > MAX_UPLOAD_BYTES)
      return {
        ok: false,
        problem: "size",
        message: `${file.name} is over 10 MB.`,
      };
  }
  if (!rights.rightsOn && !rights.ticked)
    return {
      ok: false,
      problem: "rights",
      message: "Tick the box to confirm you may use these photos.",
    };
  return { ok: true };
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0) {
  return (
    bytes.length >= at + prefix.length &&
    prefix.every((value, i) => bytes[at + i] === value)
  );
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The image type from a file's first bytes, or null when it is no JPEG, PNG or WebP. */
export function sniffImageType(bytes: Uint8Array): UploadType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "image/webp";
  return null;
}

/** The size a photo is shrunk to: its long side at most 2048 px, its shape kept. */
export function shrunkSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= UPLOAD_LONG_SIDE) return { width, height };
  const scale = UPLOAD_LONG_SIDE / long;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
