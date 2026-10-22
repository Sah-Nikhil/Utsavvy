/** Devanagari and Devanagari Extended. */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;

/** The class that gives Devanagari text room for its matras (app/globals.css). */
export const SCRIPT_DEVA = "script-deva";

/**
 * The typography class for text Members type, by script. Devanagari can be
 * Hindi, Marathi, Nepali or a mix with English, so this never claims a
 * language: set `lang="hi"` only on text the app knows is Hindi, such as its
 * own copy. Returns undefined for text with no Devanagari.
 */
export function scriptClass(text: unknown): typeof SCRIPT_DEVA | undefined {
  return typeof text === "string" && DEVANAGARI.test(text)
    ? SCRIPT_DEVA
    : undefined;
}
