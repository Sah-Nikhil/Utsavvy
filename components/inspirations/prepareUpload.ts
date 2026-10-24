"use client";

import { Vibrant } from "node-vibrant/browser";
import { isUploadType, shrunkSize } from "@/lib/inspirations/uploads";

/*
 * Before a photo uploads, the browser shrinks it to 2048 px on its long side
 * (inspirations.md rule 4) and reads its palette with node-vibrant (rule 18;
 * the server's runtime can't decode WebP). Redrawing it on a canvas also drops
 * its EXIF data, location included.
 */

export type PreparedUpload = { blob: Blob; palette: string[] };

/** Up to 5 of node-vibrant's swatches, most common first, as the seed's were read. */
async function paletteOf(blob: Blob): Promise<string[]> {
  const url = URL.createObjectURL(blob);
  try {
    const swatches = Object.values(await Vibrant.from(url).getPalette())
      .filter((swatch) => swatch !== null)
      .sort((a, b) => b.population - a.population);
    return [...new Set(swatches.map((s) => s.hex.toLowerCase()))].slice(0, 5);
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = shrunkSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("This browser can't resize photos.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // JPEG stays JPEG; PNG and WebP become WebP, which keeps transparency.
  const wanted = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  let blob = await toBlob(canvas, wanted, 0.88);
  // A browser that can't write WebP hands back PNG; JPEG is the safe fallback.
  if (blob === null || !isUploadType(blob.type))
    blob = await toBlob(canvas, "image/jpeg", 0.88);
  if (blob === null) throw new Error("Couldn't prepare this photo.");
  return { blob, palette: await paletteOf(blob) };
}
