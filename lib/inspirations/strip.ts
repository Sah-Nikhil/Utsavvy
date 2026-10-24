/*
 * S13: the stock photo strip a reply shows (inspirations.md rule 3). The Chat
 * card's `id` carries which library photos matched, and the Function the
 * request named, so a tapped photo lands tagged with it.
 */

export type StripCard = {
  pexelsIds: number[];
  /** The Function the request named, such as "haldi", or null. */
  functionKey: string | null;
  query: string;
};

export function stripCardId(card: StripCard): string {
  return JSON.stringify(card);
}

/** Reads a strip card's `id`, or null when it isn't one. */
export function parseStripCard(id: string | null): StripCard | null {
  if (id === null) return null;
  try {
    const value = JSON.parse(id) as Partial<StripCard>;
    if (
      !Array.isArray(value.pexelsIds) ||
      !value.pexelsIds.every((n) => Number.isInteger(n))
    )
      return null;
    return {
      pexelsIds: value.pexelsIds,
      functionKey:
        typeof value.functionKey === "string" ? value.functionKey : null,
      query: typeof value.query === "string" ? value.query : "",
    };
  } catch {
    return null;
  }
}
