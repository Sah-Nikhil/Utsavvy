// Writes the stock library seed (issue #32, ADR 0012) from a hand-curated shortlist.
//
// The photos were picked by hand on pexels.com and downloaded once through the
// site's own download button; their originals live outside the repo and their
// 1200 px WebP copies in public/inspirations/<setKey>/<pexelsId>.webp. Nothing here
// calls the Pexels API.
//
//   bun scripts/curate-vibe-sets.ts <candidates.json> <review.json> <jpeg dir>
//
// candidates.json: the shortlist, one entry per photo with its set and category
//   (a Function such as haldi, or a party idea such as cake), its credit, the
//   curator's alt text and tags, and the suggested vibe pick.
// review.json: Sah-Nikhil's verdict from the review sheet:
//   { reject: number[], vibe: { [setKey]: number[] }, tags: { [id]: string }, alt: { [id]: string } }
// jpeg dir: <dir>/<setKey>/<pexelsId>.jpg, a JPEG copy of each WebP file. The
//   palette is read from it because node-vibrant's decoder can't read WebP.
//
// Rejected photos are removed from public/inspirations/; the rest are written,
// with their palettes, to seed/vibe-sets.json. Run it from the repo root.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Vibrant } from "node-vibrant/node";

type Candidate = {
  setKey: string;
  category: string;
  pexelsId: number;
  slug: string;
  photographer: string;
  photographerSlug: string;
  alt: string;
  tags: string[];
  curatedAt: string;
  vibePick: boolean;
};
type Review = {
  reject: number[];
  vibe: Record<string, number[]>;
  tags: Record<string, string>;
  alt: Record<string, string>;
};

// Each set's own occasion word, so a search for "birthday" or "ganesh" finds the whole set.
const OCCASION: Record<string, string> = {
  "wedding-north-indian-hindu": "wedding",
  "wedding-general": "wedding",
  "birthday-child": "birthday",
  "community-ganesh-utsav": "ganesh",
};
const VIBE_PICKS = 12;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

// Up to 5 of node-vibrant's swatches, most common first.
async function palette(file: string) {
  const swatches = Object.values(await Vibrant.from(file).getPalette())
    .filter((swatch) => swatch !== null)
    .sort((a, b) => b.population - a.population);
  const hexes = [
    ...new Set(swatches.map((swatch) => swatch.hex.toLowerCase())),
  ].slice(0, 5);
  if (hexes.length < 3)
    throw new Error(`${file}: only ${hexes.length} palette colours`);
  return hexes;
}

const [candidatesFile, reviewFile, jpegs] = process.argv.slice(2);
if (!candidatesFile || !reviewFile || !jpegs) {
  console.error(
    "Usage: curate-vibe-sets.ts <candidates.json> <review.json> <jpeg dir>",
  );
  process.exit(1);
}
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));
const candidates = readJson(candidatesFile) as Candidate[];
const review = readJson(reviewFile) as Review;
const rejected = new Set(review.reject);

const records = [];
for (const photo of candidates) {
  const localPath = `/inspirations/${photo.setKey}/${photo.pexelsId}.webp`;
  if (rejected.has(photo.pexelsId)) {
    rmSync(join("public", localPath), { force: true });
    continue;
  }
  const tags = words(review.tags[photo.pexelsId] ?? photo.tags.join(","));
  // The occasion and the category always stay searchable, even if a tag edit dropped them.
  for (const word of [photo.category, OCCASION[photo.setKey]!]) {
    if (!tags.includes(word)) tags.unshift(word);
  }
  const vibe = review.vibe[photo.setKey];
  records.push({
    setKey: photo.setKey,
    category: photo.category,
    pexelsId: photo.pexelsId,
    pageUrl: `https://www.pexels.com/photo/${photo.slug}-${photo.pexelsId}/`,
    photographer: photo.photographer,
    photographerUrl: `https://www.pexels.com/@${photo.photographerSlug}/`,
    localPath,
    alt: review.alt[photo.pexelsId] ?? photo.alt,
    tags: [...new Set(tags)],
    palette: await palette(join(jpegs, photo.setKey, `${photo.pexelsId}.jpg`)),
    curatedAt: photo.curatedAt,
    vibePick: vibe ? vibe.includes(photo.pexelsId) : photo.vibePick,
  });
}

for (const setKey of Object.keys(OCCASION)) {
  const picks = records.filter((r) => r.setKey === setKey && r.vibePick).length;
  if (picks !== VIBE_PICKS)
    throw new Error(`${setKey}: ${picks} vibe picks, need ${VIBE_PICKS}`);
}
for (const record of records) {
  if (!existsSync(join("public", record.localPath)))
    throw new Error(`Missing ${record.localPath}`);
}

writeFileSync("seed/vibe-sets.json", JSON.stringify(records, null, 2) + "\n");
console.log(
  `Wrote ${records.length} records to seed/vibe-sets.json (${rejected.size} rejected)`,
);
