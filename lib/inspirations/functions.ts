/*
 * S13: whether a Member's message names one of the Event's Functions
 * (inspirations.md rule 8). The Assistant tags an Inspiration only when it does:
 * "find mehendi decor" names the mehendi, "find some decor" names none.
 */

/** Other spellings Members type for a Function key. */
const SPELLINGS: Record<string, readonly string[]> = {
  mehendi: ["mehndi", "mehandi"],
  sangeet: ["sangeet", "sangit"],
  haldi: ["haldi", "pithi"],
  anand_karaj: ["anand karaj"],
  church_wedding: ["church wedding"],
};

function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** The keys of the Event's Functions that the text names, by key, name or a known spelling. */
export function functionsNamedIn(
  text: string,
  functions: readonly { key: string; name: string }[],
): string[] {
  const haystack = normalise(text);
  return functions
    .filter((fn) => {
      const names = [
        fn.key.replaceAll("_", " "),
        fn.name,
        ...(SPELLINGS[fn.key] ?? []),
      ];
      return names.some((name) => {
        const needle = normalise(name);
        return needle.trim() !== "" && haystack.includes(needle);
      });
    })
    .map((fn) => fn.key);
}
