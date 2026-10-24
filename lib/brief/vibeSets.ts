import {
  findLibraryPhoto,
  ownSetKeys,
  setPhotos,
  type LibraryPhoto,
} from "../inspirations/library";
import {
  colourName,
  mergeTheme,
  themeUpdateFromImage,
} from "../inspirations/theme";
import type { BriefExtraction, Theme, ThemeUpdate } from "../types/brief";

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
function candidates(setKey: string): LibraryPhoto[] {
  const all = setPhotos([setKey]).filter((photo) => !isBranded(photo));
  return [
    ...all.filter((photo) => photo.vibePick),
    ...all.filter((photo) => !photo.vibePick),
  ];
}

/** The photos shown after `more` taps on "Show me more": 12, then 12 more each time. */
export function vibePickPhotos(setKey: string, more: number): LibraryPhoto[] {
  const pages = Math.max(0, Math.floor(more)) + 1;
  return candidates(setKey).slice(0, pages * VIBE_PICK.page);
}

/** How many photos the set can show in all. */
export function vibePickSize(setKey: string): number {
  return candidates(setKey).length;
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

/** What one stock photo adds to the Theme, by S13's "Use for Theme" rule. */
function fromPhoto(
  seen: { palette: readonly string[]; decorKeywords: readonly string[] },
  theme: Theme,
): ThemeUpdate {
  return { ...themeUpdateFromImage(seen, theme, null), fromInspiration: null };
}

/** How many style words one vibe pick adds. */
const STYLE_WORDS_FROM_PICK = 3;

/**
 * The Theme the tapped photos make, merged into the current one with S13's
 * rules (`themeUpdateFromImage`, `mergeTheme`): each photo brings its leading
 * colours and decor keywords. When the photos' leading colours are too alike
 * to give 3 colours, their next colours fill in. The style words are the
 * names of the new colours ("marigold", "rani pink"): stock photos need no
 * model call (inspirations.md rule 19), so the words come from the curated
 * palettes. Anything the Member already wrote stays, ahead of the new values.
 */
export function vibeTheme(
  theme: Theme,
  photos: readonly LibraryPhoto[],
): Theme {
  if (photos.length === 0) return theme;
  let next = theme;
  for (const photo of photos) {
    next = mergeTheme(
      next,
      fromPhoto({ palette: photo.palette, decorKeywords: photo.tags }, next),
    );
  }
  // Top up to 3 colours from the photos' later colours, one at a time.
  for (const photo of photos) {
    for (const colour of photo.palette.slice(1)) {
      if (next.palette.length >= VIBE_PICK.min) break;
      next = mergeTheme(
        next,
        fromPhoto({ palette: [colour], decorKeywords: [] }, next),
      );
    }
  }
  // Name the new colours first, then the photos' other colours, so even a
  // pick of mostly plain colours gets words.
  const before = new Set(theme.palette.map((c) => c.toUpperCase()));
  const names: string[] = [];
  for (const colour of [
    ...next.palette.filter((c) => !before.has(c)),
    ...photos.flatMap((photo) => photo.palette),
  ]) {
    if (names.length >= STYLE_WORDS_FROM_PICK) break;
    const name = colourName(colour);
    if (!PLAIN_COLOURS.has(name) && !names.includes(name)) names.push(name);
  }
  return mergeTheme(next, {
    addPalette: [],
    removePalette: [],
    addStyleWords: names,
    addDecorKeywords: [],
    fromInspiration: null,
  });
}
