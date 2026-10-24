import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_BATCH,
  checkUploadBatch,
  shrunkSize,
  sniffImageType,
} from "./uploads";

// S13 seam (issue #46): the upload rules (inspirations.md rules 4 and 5).
// JPEG, PNG and WebP only, up to 10 MB each and 10 at a time; with the
// Event's upload rights setting off, each batch needs the tick.

const MB = 1024 * 1024;
const jpeg = (size = 2 * MB) => ({ name: "stage.jpg", type: "image/jpeg", size });

describe("checkUploadBatch", () => {
  it("accepts JPEG, PNG and WebP up to 10 MB", () => {
    expect(
      checkUploadBatch(
        [
          jpeg(),
          { name: "a.png", type: "image/png", size: MB },
          { name: "b.webp", type: "image/webp", size: 10 * MB },
        ],
        { rightsOn: true, ticked: false },
      ),
    ).toEqual({ ok: true });
    expect(MAX_UPLOAD_BYTES).toBe(10 * MB);
    expect(MAX_UPLOADS_PER_BATCH).toBe(10);
  });

  it("refuses other file types, naming the file", () => {
    expect(
      checkUploadBatch(
        [jpeg(), { name: "plan.pdf", type: "application/pdf", size: MB }],
        { rightsOn: true, ticked: false },
      ),
    ).toEqual({
      ok: false,
      problem: "type",
      message: "plan.pdf isn't a photo. Upload JPEG, PNG or WebP images.",
    });
    expect(
      checkUploadBatch([{ name: "a.heic", type: "image/heic", size: MB }], {
        rightsOn: true,
        ticked: false,
      }),
    ).toMatchObject({ ok: false, problem: "type" });
  });

  it("refuses a file over 10 MB", () => {
    expect(
      checkUploadBatch([jpeg(10 * MB + 1)], { rightsOn: true, ticked: false }),
    ).toEqual({
      ok: false,
      problem: "size",
      message: "stage.jpg is over 10 MB.",
    });
  });

  it("refuses more than 10 at a time", () => {
    const eleven = Array.from({ length: 11 }, () => jpeg());
    expect(
      checkUploadBatch(eleven, { rightsOn: true, ticked: false }),
    ).toEqual({
      ok: false,
      problem: "count",
      message: "Upload up to 10 photos at a time.",
    });
    expect(
      checkUploadBatch(eleven.slice(1), { rightsOn: true, ticked: false }),
    ).toEqual({ ok: true });
  });

  it("with the rights setting off, the batch needs the tick", () => {
    const four = Array.from({ length: 4 }, () => jpeg());
    expect(checkUploadBatch(four, { rightsOn: false, ticked: false })).toEqual(
      {
        ok: false,
        problem: "rights",
        message: "Tick the box to confirm you may use these photos.",
      },
    );
    expect(checkUploadBatch(four, { rightsOn: false, ticked: true })).toEqual({
      ok: true,
    });
  });

  it("an empty batch has nothing to upload", () => {
    expect(checkUploadBatch([], { rightsOn: true, ticked: false })).toEqual({
      ok: false,
      problem: "empty",
      message: "Choose at least one photo.",
    });
  });
});

describe("sniffImageType", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it("reads the type from the file's own first bytes, never its name or claimed type", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe(
      "image/jpeg",
    );
    expect(
      sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("returns null for anything else", () => {
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBe(
      null,
    );
    expect(sniffImageType(bytes())).toBeNull();
  });
});

describe("shrunkSize", () => {
  it("shrinks the long side to 2048 px, keeping the shape", () => {
    expect(shrunkSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(shrunkSize(3000, 6000)).toEqual({ width: 1024, height: 2048 });
  });

  it("leaves a smaller image as it is", () => {
    expect(shrunkSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
});
