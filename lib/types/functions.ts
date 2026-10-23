/**
 * The Function keys an Event's Functions use (`eventFunctions.key`), by kind of
 * Event. S11's Brief extraction normalises every Function key to this list, and
 * seed data keyed by Function (such as S21's Pinterest boards) is checked
 * against it, so a board can't miss a Function the Brief creates.
 *
 * Built from docs/design/first-brief.md (the Tradition table and the birthday
 * and community defaults), its worked examples in lib/pricing/workedExamples.ts,
 * the Functions in seed/vibe-sets.json's wedding categories and the local check
 * Event in convex/canvas.ts. Keys are lowercase, with underscores for spaces.
 * A Function the Member adds by name keeps its own key and isn't listed here.
 */
export const FUNCTION_KEYS = {
  wedding: [
    // North Indian Hindu
    "haldi",
    "mehendi",
    "sangeet",
    "wedding",
    "reception",
    // Marwari / Rajasthani, plus the above
    "tilak",
    "mayra",
    // Punjabi or Sikh
    "roka",
    "chunni",
    "jaggo",
    "anand_karaj",
    // Muslim
    "manjha",
    "nikah",
    "walima",
    // South Indian Hindu
    "nichayathartham",
    "muhurtham",
    // Bengali
    "aashirbaad",
    "gaye_holud",
    "biye",
    "bou_bhaat",
    // Christian (and a vibe-sets.json category)
    "engagement",
    "church_wedding",
  ],
  birthday: [
    // A child's themed party (the Aarav worked example)
    "party",
    // guessed from first-brief.md prose; confirm
    "puja",
    // guessed from first-brief.md prose; confirm
    "dinner",
    // guessed from first-brief.md prose; confirm
    "shashtipoorthi",
  ],
  ganesh: ["sthapana", "daily_aarti", "cultural_night", "visarjan"],
} as const;

export type FunctionKeyKind = keyof typeof FUNCTION_KEYS;
export type FunctionKey = (typeof FUNCTION_KEYS)[FunctionKeyKind][number];

export const ALL_FUNCTION_KEYS: readonly FunctionKey[] =
  Object.values(FUNCTION_KEYS).flat();

const KEYS: ReadonlySet<string> = new Set(ALL_FUNCTION_KEYS);

export function isFunctionKey(key: string): key is FunctionKey {
  return KEYS.has(key);
}
