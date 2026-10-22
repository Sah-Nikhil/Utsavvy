/** Devanagari and Devanagari Extended. */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;

/**
 * `lang="hi"` for text that contains Devanagari, so text Members type gets
 * Hindi line height and fonts (app/globals.css) without knowing its language
 * in advance. Spread it as `lang={hindiLang(title)}`; undefined leaves the
 * page language in charge.
 */
export function hindiLang(text: unknown): "hi" | undefined {
  return typeof text === "string" && DEVANAGARI.test(text) ? "hi" : undefined;
}
