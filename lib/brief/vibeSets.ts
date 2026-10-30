import {
  findLibraryPhoto,
  ownSetKeys,
  setPhotos,
  type LibraryPhoto,
} from "../inspirations/library";
import {
  colourName,
  mergeTheme,
  THEME_LIMITS,
  themeUpdateFromImage,
} from "../inspirations/theme";
import type { BriefExtraction, Theme } from "../types/brief";

/*
 * S18: the vibe pick (first-brief.md "Vibe pick", inspirations.md rules 21 to
 * 23, IMPLEMENTATION_PLAN.md section 2). After the essentials, a Member taps 3
 * to 5 photos from their Event's curated set, or skips. The photos come from
 * the stock library only; there is no live search (ADR 0012).
 */

export const VIBE_PICK = {
  /** The fewest photos that make a Theme. */
  min: 3,
  /** The most photos one pick takes. */
  max: 5,
  /** Photos shown at first, and added by each "Show me more". */
  page: 12,
} as const;

/** The history label of the vibe pick's writes; its photos set the Theme as they arrive. */
export const VIBE_PICK_LABEL = "The vibe pick";

/**
 * The Brief's vibe pick set, or null when its kind of Event has none yet and
 * the step is skipped: the North Indian Hindu set for that Tradition, the
 * general wedding set for every other wedding, the child birthday set and the
 * Ganesh utsav set. The mapping is S13's `ownSetKeys`, so Search and the vibe
 * pick always agree on the Event's own set.
 */
export function setForBrief(
  extraction: Pick<
    BriefExtraction,
    "eventType" | "tradition" | "honoree" | "communityKind"
  >,
): string | null {
  if (extraction.eventType === null) return null;
  return (
    ownSetKeys({
      eventType: extraction.eventType,
      tradition: extraction.tradition,
      honoree: extraction.honoree,
      communityKind: extraction.communityKind,
    })[0] ?? null
  );
}

const isBranded = (photo: LibraryPhoto) => photo.tags.includes("branded");

/**
 * Every photo the vibe pick may show for a set, in order: its 12 vibe pick
 * photos, then its other photos that aren't tagged `branded` (licensed
 * characters never appear here, though Search shows them).
 */
export function vibePickCandidates(setKey: string): LibraryPhoto[] {
  const all = setPhotos([setKey]).filter((photo) => !isBranded(photo));
  return [
    ...all.filter((photo) => photo.vibePick),
    ...all.filter((photo) => !photo.vibePick),
  ];
}

/** The photos shown after `more` taps on "Show me more": 12, then 12 more each time. */
export function vibePickPhotos(setKey: string, more: number): LibraryPhoto[] {
  const pages = Math.max(0, Math.floor(more)) + 1;
  return vibePickCandidates(setKey).slice(0, pages * VIBE_PICK.page);
}

/** Whether a photo may be picked for this set: one of its own, and not branded. */
export function isVibeCandidate(setKey: string, pexelsId: number): boolean {
  const photo = findLibraryPhoto(pexelsId);
  return photo !== null && photo.setKey === setKey && !isBranded(photo);
}

/** Colour names too plain to describe a look on their own. */
const PLAIN_COLOURS = new Set([
  "white",
  "ivory",
  "cream",
  "beige",
  "brown",
  "grey",
  "charcoal",
  "black",
]);

/** How many style words one vibe pick adds. */
const STYLE_WORDS_FROM_PICK = 3;

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Theme the tapped photos make, added to the current one with S13's rules
 * (`themeUpdateFromImage`, `mergeTheme`): each photo brings its leading
 * colours and decor keywords, taken in turn so every photo counts. When the
 * photos' leading colours are too alike to give 3 colours, their next colours
 * fill in. A pick only fills the Theme's free places: everything the Member
 * already has stays, ahead of the new values, and a full list gets nothing.
 */
export function vibeTheme(
  theme: Theme,
  photos: readonly LibraryPhoto[],
): Theme {
  if (photos.length === 0) return theme;
  const palette = [...theme.palette];
  const decorKeywords = [...theme.decorKeywords];
  const current = (): Theme => ({
    palette,
    styleWords: theme.styleWords,
    decorKeywords,
  });

  // Each photo's next new colour and decor keyword, a photo at a time, as
  // long as the Theme has room.
  for (let round = 0; round < 2; round++) {
    for (const photo of photos) {
      const update = themeUpdateFromImage(
        { palette: photo.palette, decorKeywords: photo.tags },
        current(),
        null,
      );
      const colour = update.addPalette[0];
      if (colour !== undefined && palette.length < THEME_LIMITS.palette)
        palette.push(colour);
      const keyword = update.addDecorKeywords[0];
      if (
        keyword !== undefined &&
        decorKeywords.length < THEME_LIMITS.decorKeywords
      )
        decorKeywords.push(keyword);
    }
  }
  // Top up to 3 colours from the photos' later colours, one at a time.
  for (const photo of photos) {
    for (const colour of photo.palette.slice(1)) {
      if (palette.length >= VIBE_PICK.min) break;
      const update = themeUpdateFromImage(
        { palette: [colour], decorKeywords: [] },
        current(),
        null,
      );
      palette.push(...update.addPalette);
    }
  }

  const added = palette.slice(theme.palette.length);
  const words = styleWordsFor(photos, { palette, decorKeywords }).slice(
    0,
    Math.max(0, THEME_LIMITS.styleWords - theme.styleWords.length),
  );
  return mergeTheme(theme, {
    addPalette: added,
    removePalette: [],
    addStyleWords: words.filter(
      (w) => !theme.styleWords.some((t) => same(t, w)),
    ),
    addDecorKeywords: decorKeywords.slice(theme.decorKeywords.length),
    fromInspiration: null,
  });
}

/**
 * The curators' look tags, each with the style words it stands for, most
 * telling first: a party theme or a setting says more about a look than
 * "flowers" or "balloons". Stock photos need no model call (inspirations.md
 * rule 19), so a pick's style words come from these tags.
 */
const LOOK_WORDS: readonly (readonly [tag: string, words: string])[] = [
  // Party themes
  ["jungle", "jungle safari"],
  ["safari", "jungle safari"],
  ["pirate", "pirate adventure"],
  ["space", "outer space"],
  ["rocket", "outer space"],
  ["astronaut", "outer space"],
  ["galaxy", "outer space"],
  ["clouds", "clouds and stars"],
  ["stars", "clouds and stars"],
  ["unicorn", "unicorn magic"],
  ["mermaid", "under the sea"],
  ["dinosaur", "dinosaur dig"],
  ["farm", "farmyard"],
  ["rainbow", "rainbow bright"],
  ["candy", "candy land"],
  ["teepee", "boho teepee"],
  ["boho", "boho"],
  ["sadya", "Kerala sadya"],
  // Settings and styles
  ["palace", "royal heritage"],
  ["heritage", "royal heritage"],
  ["chhatri", "royal heritage"],
  ["jaali", "Mughal jaali"],
  ["forest", "enchanted forest"],
  ["lakeside", "lakeside"],
  ["beach", "beachside"],
  ["seaside", "beachside"],
  ["mumbai", "Mumbai pandal"],
  ["procession", "street festival"],
  ["street", "street festival"],
  ["ornate", "ornate gold"],
  ["throne", "regal throne"],
  ["chandeliers", "grand chandeliers"],
  ["chandelier", "grand chandeliers"],
  ["rustic", "rustic"],
  ["pastel", "pastel"],
  ["lotus", "lotus"],
  ["rangoli", "rangoli"],
  ["jasmine", "jasmine"],
  ["marigold", "marigold garlands"],
  ["turmeric", "turmeric glow"],
  ["roses", "romantic roses"],
  ["henna", "henna"],
  ["swing", "jhoola swing"],
  ["sparklers", "sparkler night"],
  ["lanterns", "lantern-lit"],
  ["candles", "candlelit"],
  ["aarti", "diya glow"],
  ["lamp", "diya glow"],
  ["lamps", "diya glow"],
  ["diya", "diya glow"],
  ["diyas", "diya glow"],
  ["brass", "brass and diyas"],
  ["havan", "traditional rituals"],
  ["pheras", "traditional rituals"],
  ["ritual", "traditional rituals"],
  ["buntings", "festive buntings"],
  ["tent", "shamiana tent"],
  ["home", "home shrine"],
  ["mandap", "floral mandap"],
  ["canopy", "floral canopy"],
  ["chaise", "regal lounge"],
  ["lights", "fairy lights"],
  ["night", "evening glow"],
  ["petals", "petal shower"],
  ["garden", "garden party"],
  ["playroom", "playful"],
  ["blocks", "playful"],
  ["toys", "playful"],
  ["drapes", "flowing drapes"],
  ["garlands", "garlands"],
  ["garland", "garlands"],
  ["colourful", "colourful"],
  // The most common tags last
  ["flowers", "floral"],
  ["balloons", "balloon garlands"],
];

const LOOK_RANK = new Map(LOOK_WORDS.map(([tag], i) => [tag, i]));
const LOOK_OF = new Map(LOOK_WORDS.map(([tag, words]) => [tag, words]));

/** A photo's look words, most telling first. */
function lookWords(photo: LibraryPhoto): string[] {
  return photo.tags
    .filter((tag) => LOOK_RANK.has(tag))
    .sort((a, b) => LOOK_RANK.get(a)! - LOOK_RANK.get(b)!)
    .map((tag) => LOOK_OF.get(tag)!);
}

/**
 * The style words a pick suggests: each photo's most telling look word in
 * turn, then their next ones. When the tags give fewer than 2 words, one
 * colour name fills in. A word the Theme already shows as a colour or a decor
 * keyword is skipped, so the Chat line never says it twice.
 */
function styleWordsFor(
  photos: readonly LibraryPhoto[],
  shown: { palette: readonly string[]; decorKeywords: readonly string[] },
): string[] {
  const taken = new Set([
    ...shown.palette.map((c) => colourName(c)),
    ...shown.decorKeywords.map((w) => w.trim().toLowerCase()),
  ]);
  const words: string[] = [];
  const add = (word: string | undefined) => {
    if (word === undefined || words.length >= STYLE_WORDS_FROM_PICK) return;
    if (taken.has(word.toLowerCase()) || words.some((w) => same(w, word)))
      return;
    words.push(word);
  };
  const each = photos.map(lookWords);
  const longest = Math.max(...each.map((list) => list.length));
  for (let i = 0; i < longest; i++) for (const list of each) add(list[i]);
  if (words.length < 2) {
    const colour = photos
      .flatMap((photo) => photo.palette)
      .map((c) => colourName(c))
      .find((name) => !PLAIN_COLOURS.has(name) && !taken.has(name));
    add(colour);
  }
  return words;
}
