import type { ParsedReference } from "./parse";

/**
 * "What do you like in this?" (inspirations.md rule 7). The note is all the
 * Assistant knows about a Reference, so the chips and the free-text line become
 * one plain sentence of the Member's words.
 */

export const REFERENCE_NOTE_MAX = 500;

/** Tap chips for the kind of post, before the Theme's own words. */
export function postTypeChips(urlKind: ParsedReference["urlKind"]): string[] {
  switch (urlKind) {
    case "board":
      return ["colours", "the overall look", "flowers", "lighting"];
    case "reel":
      return ["colours", "the stage", "lighting", "the outfit", "the entry"];
    case "pin":
    case "pinShort":
    case "post":
      return ["colours", "the stage", "flowers", "lighting", "the outfit"];
  }
}

/** The post type's chips, then the Theme's words, each once. */
export function noteChips(
  urlKind: ParsedReference["urlKind"],
  themeWords: readonly string[],
): string[] {
  const chips = [...postTypeChips(urlKind), ...themeWords];
  const seen = new Set<string>();
  return chips.filter((chip) => {
    const key = chip.trim().toLowerCase();
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The tapped chips and the free text as one note, or null when both are empty. */
export function composeNote(
  chips: readonly string[],
  text: string,
): string | null {
  const free = text.trim();
  const picked = chips.join(", ");
  if (picked === "" && free === "") return null;
  if (picked === "") return free;
  if (free === "") return picked;
  return `${picked}; ${free}`;
}
