import type { MapColours } from "./style";

/*
 * The printed map's patterns (IMPLEMENTATION_PLAN.md section 7.5, 27 Oct):
 * a butta on the land, a leaf print on parks and lahariya waves on water, as
 * on a Sanganeri or Bagru block print. Each is a small tile drawn on a canvas
 * in the browser, in colours from the --map-print-* tokens, and added to the
 * map with map.addImage when its style asks for it. Like style.ts, this file
 * must never hold a colour of its own.
 */

type Pattern = {
  /** The tile's size in CSS pixels. */
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, colours: MapColours) => void;
};

/** A four-petalled butta with a dot between, on a 40 px half-drop repeat. */
function butta(ctx: CanvasRenderingContext2D, colours: MapColours) {
  ctx.fillStyle = colours.butta;
  const flower = (cx: number, cy: number) => {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      // Petals stand off the centre, so the butta reads as a flower, not a cross.
      ctx.ellipse(0, -4.2, 1.8, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 1.1, 0, Math.PI * 2);
    ctx.fill();
  };
  flower(10, 10);
  flower(30, 30);
  for (const [x, y] of [
    [30, 10],
    [10, 30],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Two leaves leaning opposite ways on the park colour. */
function leaf(ctx: CanvasRenderingContext2D, colours: MapColours) {
  ctx.fillStyle = colours.park;
  ctx.fillRect(0, 0, 22, 22);
  ctx.fillStyle = colours.leaf;
  const one = (cx: number, cy: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(3, 0, 0, 4);
    ctx.quadraticCurveTo(-3, 0, 0, -4);
    ctx.fill();
    ctx.restore();
  };
  one(6, 6, 0.6);
  one(17, 17, -0.6);
}

/** Lahariya: two waves across the water colour, one wavelength per tile. */
function lahar(ctx: CanvasRenderingContext2D, colours: MapColours) {
  ctx.fillStyle = colours.water;
  ctx.fillRect(0, 0, 28, 12);
  ctx.strokeStyle = colours.wave;
  ctx.lineWidth = 1;
  for (const y0 of [3, 9]) {
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const y = y0 + Math.sin((i / 28) * Math.PI * 2) * 1.6;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }
}

export const MAP_PATTERNS = {
  "map-butta": { width: 40, height: 40, draw: butta },
  "map-leaf": { width: 22, height: 22, draw: leaf },
  "map-lahar": { width: 28, height: 12, draw: lahar },
} satisfies Record<string, Pattern>;

export type MapPatternId = keyof typeof MAP_PATTERNS;

export function isMapPattern(id: string): id is MapPatternId {
  return Object.hasOwn(MAP_PATTERNS, id);
}

/** Draws one tile onto a context already scaled to CSS pixels. */
export function drawPattern(
  id: MapPatternId,
  colours: MapColours,
  ctx: CanvasRenderingContext2D,
) {
  MAP_PATTERNS[id].draw(ctx, colours);
}

/** One tile as image data for map.addImage, at `ratio` device pixels per CSS pixel. */
export function patternImage(
  id: MapPatternId,
  colours: MapColours,
  ratio: number,
): ImageData {
  const { width, height } = MAP_PATTERNS[id];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  drawPattern(id, colours, ctx);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The Markers' footprint: a transparent square the size of a selected
 * Shortlisted Marker with its ring (style.ts, VENDOR_FOOTPRINTS). It paints
 * nothing; MapLibre only uses its size, so place and road labels give way to
 * our DOM Markers instead of drawing through them.
 */
export const MARKER_FOOTPRINT = { id: "map-marker-footprint", size: 48 };

/** The footprint as image data for map.addImage: every pixel transparent. */
export function footprintImage(ratio: number): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const side = Math.round(MARKER_FOOTPRINT.size * ratio);
  return { width: side, height: side, data: new Uint8Array(side * side * 4) };
}
