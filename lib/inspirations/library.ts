import records from "../../seed/vibe-sets.json";
import type { EventType, Honoree } from "../types/brief";

/*
 * S13: the stock library (ADR 0012). 288 photos hand-curated from Pexels,
 * served from our own origin (`public/inspirations/`), described by the seed
 * file's alt text and curator tags. There is no stock API and no live search:
 * a search only reads the tags below.
 */

/** One stock library photo, exactly as `seed/vibe-sets.json` holds it. */
export type LibraryPhoto = {
  setKey: string;
  category: string;
  pexelsId: number;
  pageUrl: string;
  photographer: string;
  photographerUrl: string;
  localPath: string;
  alt: string;
  tags: string[];
  palette: string[];
  curatedAt: string;
  vibePick: boolean;
};

export const LIBRARY: readonly LibraryPhoto[] = records as LibraryPhoto[];

/** A search returns at most this many photos (inspirations.md rule 3). */
export const MAX_SEARCH_RESULTS = 6;

/**
 * Words that say what someone wants rather than what is in the photo, so they
 * never match a tag: "find some haldi decor ideas" searches "haldi decor".
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "can",
  "do",
  "find",
  "for",
  "from",
  "get",
  "give",
  "have",
  "i",
  "idea",
  "ideas",
  "image",
  "images",
  "in",
  "inspiration",
  "inspirations",
  "is",
  "like",
  "look",
  "looks",
  "me",
  "more",
  "my",
  "of",
  "on",
  "or",
  "our",
  "photo",
  "photos",
  "picture",
  "pictures",
  "please",
  "show",
  "some",
  "stock",
  "the",
  "to",
  "us",
  "we",
  "with",
  "you",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/** The words of a query that can match a tag: lowercased, stop words dropped, each once. */
export function queryWords(query: string): string[] {
  const out: string[] = [];
  for (const word of words(query)) {
    if (!STOP_WORDS.has(word) && !out.includes(word)) out.push(word);
  }
  return out;
}

/** Each photo's tag words, worked out once. */
const TAG_WORDS = new Map<number, ReadonlySet<string>>(
  LIBRARY.map((photo) => [photo.pexelsId, new Set(photo.tags.flatMap(words))]),
);

/**
 * Searches the stock library's curator tags (ADR 0012): a query word matches a
 * tag when it equals one of the tag's words. Photos with more matching words
 * come first, then photos from `setKeys` (the Event's own set), then seed
 * order. A photo that matches no word is never returned, so a search the
 * library can't answer returns fewer photos, or none.
 */
export function searchLibrary(
  query: string,
  options: { setKeys?: readonly string[] } = {},
): LibraryPhoto[] {
  const wanted = queryWords(query);
  if (wanted.length === 0) return [];
  const own = new Set(options.setKeys ?? []);
  return LIBRARY.map((photo, order) => {
    const tagWords = TAG_WORDS.get(photo.pexelsId)!;
    const score = wanted.filter((word) => tagWords.has(word)).length;
    return { photo, order, score, own: own.has(photo.setKey) ? 1 : 0 };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.own - a.own || a.order - b.order)
    .slice(0, MAX_SEARCH_RESULTS)
    .map((hit) => hit.photo);
}

const BY_ID = new Map(LIBRARY.map((photo) => [photo.pexelsId, photo]));

/** The seed record for a Pexels id, or null when the library has no such photo. */
export function findLibraryPhoto(pexelsId: number): LibraryPhoto | null {
  return BY_ID.get(pexelsId) ?? null;
}

/** The photos of the given sets, in seed order. */
export function setPhotos(setKeys: readonly string[]): LibraryPhoto[] {
  const keys = new Set(setKeys);
  return LIBRARY.filter((photo) => keys.has(photo.setKey));
}

export type SetChoiceEvent = {
  eventType: EventType;
  tradition: string | null;
  honoree: Honoree | null;
  communityKind: string | null;
};

/**
 * The Event's own set (inspirations.md rule 21): the North Indian Hindu set
 * for that Tradition, the general wedding set for every other wedding, the
 * child birthday set and the Ganesh utsav set. Adult and elder birthdays,
 * Durga puja and other community events have no set yet.
 */
export function ownSetKeys(event: SetChoiceEvent): string[] {
  switch (event.eventType) {
    case "wedding": {
      const tradition = event.tradition?.toLowerCase() ?? "";
      return tradition.includes("north") && tradition.includes("hindu")
        ? ["wedding-north-indian-hindu"]
        : ["wedding-general"];
    }
    case "birthday":
      return event.honoree?.who === "child" ? ["birthday-child"] : [];
    case "community":
      return /ganesh|ganpati|ganapati/i.test(event.communityKind ?? "")
        ? ["community-ganesh-utsav"]
        : [];
  }
}

/** "Photo by Anil Sharma on Pexels": the credit every library photo shows (rule 24). */
export function pexelsCredit(photographer: string): string {
  return `Photo by ${photographer} on Pexels`;
}
