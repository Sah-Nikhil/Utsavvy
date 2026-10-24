import { ALL_FUNCTION_KEYS } from "../types/functions";
import colourNames from "./colour-names.json";
import type { Theme, ThemeUpdate } from "../types/brief";

/*
 * S13: the Theme (inspirations.md rules 15 to 17). A change merges into the
 * shape the first Brief set: 3 to 5 palette colours, 2 to 4 style words and 3
 * to 6 decor keywords. A full list drops its oldest entries to make room, so
 * the newest Inspiration always shows.
 */

export const THEME_LIMITS = {
  palette: 5,
  styleWords: 4,
  decorKeywords: 6,
} as const;

/** "#1f6f78" or "#1F6F78"; three-digit and named colours are refused. */
export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** A Theme word: short, one line. */
export const THEME_WORD_MAX = 40;

const key = (value: string) => value.trim().toLowerCase();

/** `current` then `added`, each once (any case), keeping only the newest `max`. */
function appendNewest(
  current: readonly string[],
  added: readonly string[],
  max: number,
): string[] {
  const out = [...current];
  for (const value of added) {
    const clean = value.trim();
    if (clean === "" || out.some((v) => key(v) === key(clean))) continue;
    out.push(clean);
  }
  return out.slice(Math.max(0, out.length - max));
}

/** Merges a Theme change into the Theme. Pure: the caller writes the result. */
export function mergeTheme(theme: Theme, update: ThemeUpdate): Theme {
  const removed = new Set(update.removePalette.map(key));
  return {
    palette: appendNewest(
      theme.palette.filter((c) => !removed.has(key(c))),
      update.addPalette.map((c) => c.trim().toUpperCase()),
      THEME_LIMITS.palette,
    ),
    styleWords: appendNewest(
      theme.styleWords,
      update.addStyleWords,
      THEME_LIMITS.styleWords,
    ),
    decorKeywords: appendNewest(
      theme.decorKeywords,
      update.addDecorKeywords,
      THEME_LIMITS.decorKeywords,
    ),
  };
}

export function isThemeUnchanged(before: Theme, after: Theme): boolean {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  return (
    same(before.palette, after.palette) &&
    same(before.styleWords, after.styleWords) &&
    same(before.decorKeywords, after.decorKeywords)
  );
}

/** Why a Theme change can't be stored, or null when it is fine. */
export function themeUpdateProblem(update: ThemeUpdate): string | null {
  for (const colour of [...update.addPalette, ...update.removePalette]) {
    if (!HEX_COLOUR.test(colour.trim()))
      return `"${colour}" isn't a colour: use # and six hex digits.`;
  }
  for (const word of [...update.addStyleWords, ...update.addDecorKeywords]) {
    const clean = word.trim();
    if (clean === "" || clean.length > THEME_WORD_MAX || /[\n\r]/.test(word))
      return "Theme words are short phrases of up to 40 characters.";
  }
  if (
    update.addPalette.length > THEME_LIMITS.palette ||
    update.addStyleWords.length > THEME_LIMITS.styleWords ||
    update.addDecorKeywords.length > THEME_LIMITS.decorKeywords
  )
    return "A Theme holds at most 5 colours, 4 style words and 6 decor keywords.";
  return null;
}

// ---------------------------------------------------------------------------
// Colour names, for the Chat line ("+ teal #1F6F78")

/** Colours people name when they plan decor, with a typical shade of each (data, not UI colours). */
const NAMED_COLOURS: readonly [string, string][] = Object.entries(
  colourNames as Record<string, string>,
);

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A perceptual distance between two colours ("redmean"), cheap and good enough here. */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const mean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + mean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - mean) / 256) * db * db,
  );
}

const COLOUR_WORDS = new Set<string>([
  ...NAMED_COLOURS.flatMap(([name]) => name.split(" ")),
  "golden",
  "green",
  "blue",
  "colourful",
  "colorful",
]);

/** Whether a tag only names a colour ("yellow", "gold"), not a piece of decor. */
export function isColourWord(word: string): boolean {
  return COLOUR_WORDS.has(word.trim().toLowerCase());
}

/** The nearest decor colour's name: "#1F6F78" is "teal". */
export function colourName(hex: string): string {
  let best = NAMED_COLOURS[0]!;
  let bestDistance = Infinity;
  for (const named of NAMED_COLOURS) {
    const d = distance(hex, named[1]);
    if (d < bestDistance) {
      best = named;
      bestDistance = d;
    }
  }
  return best[0];
}

/**
 * The line the Chat shows after a Member's own Theme change (rule 16):
 * "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'".
 */
export function themeChangeLine(
  memberName: string,
  before: Theme,
  after: Theme,
): string {
  const had = (list: readonly string[], value: string) =>
    list.some((v) => key(v) === key(value));
  const parts = [
    ...after.palette
      .filter((c) => !had(before.palette, c))
      .map((c) => `+ ${colourName(c)} ${c}`),
    ...before.palette
      .filter((c) => !had(after.palette, c))
      .map((c) => `− ${colourName(c)} ${c}`),
    ...[...after.styleWords, ...after.decorKeywords]
      .filter((w) => !had([...before.styleWords, ...before.decorKeywords], w))
      .map((w) => `+ '${w}'`),
  ];
  return `Utsavvy updated the Theme for ${memberName}: ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// "Use for Theme" on an image (rule 15)

/** Colours closer than this to one the Theme has count as the same colour. */
const SAME_COLOUR_DISTANCE = 40;
/** One image adds at most this many colours and decor keywords. */
const FROM_ONE_IMAGE = { palette: 2, decorKeywords: 2 } as const;

/** Tag words that name the occasion, a Function or a colour, not a piece of decor. */
const NOT_DECOR = new Set<string>([
  "wedding",
  "birthday",
  "ganesh",
  "community",
  "branded",
  ...ALL_FUNCTION_KEYS,
  ...NAMED_COLOURS.map(([name]) => name),
  "pastel",
  "golden",
  "green",
  "blue",
  "colourful",
  "colorful",
  "multicolour",
  "multicolor",
]);

/**
 * What one image adds to the Theme: its two leading palette colours that the
 * Theme doesn't already have (or nearly have), and up to two of its decor
 * keywords, skipping occasion, Function and colour words. A library photo's
 * palette and keywords are its seed palette and curator tags; an upload's
 * come from its saved description. Images bring no style words.
 */
export function themeUpdateFromImage<Id extends string>(
  seen: { palette: readonly string[]; decorKeywords: readonly string[] },
  theme: Theme,
  fromInspiration: Id | null,
): Omit<ThemeUpdate, "fromInspiration"> & { fromInspiration: Id | null } {
  const palette: string[] = [];
  for (const colour of seen.palette) {
    if (palette.length >= FROM_ONE_IMAGE.palette) break;
    if (!HEX_COLOUR.test(colour)) continue;
    const upper = colour.toUpperCase();
    const near = [...theme.palette, ...palette].some(
      (c) => HEX_COLOUR.test(c) && distance(c, upper) < SAME_COLOUR_DISTANCE,
    );
    if (!near) palette.push(upper);
  }
  const keywords: string[] = [];
  for (const word of seen.decorKeywords) {
    if (keywords.length >= FROM_ONE_IMAGE.decorKeywords) break;
    const clean = word.trim();
    if (clean === "" || NOT_DECOR.has(key(clean))) continue;
    if (
      [...theme.decorKeywords, ...keywords].some((w) => key(w) === key(clean))
    )
      continue;
    keywords.push(clean);
  }
  return {
    addPalette: palette,
    removePalette: [],
    addStyleWords: [],
    addDecorKeywords: keywords,
    fromInspiration,
  };
}

/**
 * Whether a Member's message asks about the Theme, so the Assistant may change
 * it at once (rule 16). Any other change to the Theme is the Assistant's own
 * idea and goes to the Members as a Proposal.
 */
export function asksForTheme(text: string): boolean {
  return /\b(theme|palette|colou?rs?|colou?r scheme)\b|थीम/i.test(text);
}
