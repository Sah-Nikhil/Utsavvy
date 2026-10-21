# Stock photos come from a local, hand-curated library, not a stock API

Every stock photo in v1 comes from Utsavvy's stock library: 288 photos hand-curated from Pexels under the Pexels License, in four sets (`wedding-north-indian-hindu`, `wedding-general`, `birthday-child`, `community-ganesh-utsav`) split into 18 categories of 16 (North Indian Hindu wedding: haldi, mehendi, sangeet, engagement, wedding; general wedding: mandap, ceremony, reception, stage; child birthday: theme, characters, cake, backdrop, gifts; Ganesh utsav: pandal, home, rangoli, community). Each is served as WebP from `public/inspirations/<set>/<pexelsId>.webp`, with its credit, alt text and curator tags in `seed/vibe-sets.json`. The vibe pick shows the 12 photos per set marked `vibePick`. The Chat's `searchStockImages` and the Add Inspiration panel's Search tab look through the curator tags of the whole library and return up to 6 photos, fewer when fewer match. Every photo shows "Photo by <photographer> on Pexels", both linked. Decided with Sah-Nikhil on 2026-10-21; on 2026-10-22 he asked for a second pass by category, which grew the library from 80 to 288 photos.

We chose this because Pexels has paused new API keys with no date for resuming, and the human rejected the free alternatives on quality. A local library also removes a live dependency from the demo: no key, no rate limit, no 24-hour cache, no outage fallback. The curator's tags and alt text describe each photo, so saving one costs no model call.

## Considered options

- **The Pexels API**, as first planned. New keys are paused.
- **Wikimedia Commons and Pixabay.** Rejected by Sah-Nikhil on image quality.
- **Unsplash.** Its terms restrict use of images for AI purposes, which rules out descriptions, palettes and Remix.
- **Our own Pinterest boards as the catalog.** Pinterest's developer guidelines forbid storing anything read through its API, and the board widget can't make single images selectable. Pinterest stays a Reference that a Member pastes (X2).

## Consequences

- A search the library can't answer returns fewer than 6 photos, or none, and the Assistant offers an upload instead. It never pads results with unrelated photos.
- Adult birthdays, Durga puja and other community events have no set, so their vibe pick is skipped with one line. "Show me more" shows the rest of the set, not a live search.
- The repo carries the 288 image files, each under 300 KB and about 21 MB together. There is no `PEXELS_API_KEY` and no `pexelsCache`.
- The Pexels terms ask us to take a photo down if Pexels might face a claim over it, so removing one is deleting its file and its seed record.
- Growing the library (X9) is the same hand curation, not a code change.
- Some child birthday photos show licensed characters (Spider-Man, Superman, Batman, Frozen, Hello Kitty and similar), which Sah-Nikhil wanted for character-themed parties. The Pexels License covers the photographers' rights, not the character owners', so these carry the tag `branded`: Search shows them like any photo, but the vibe pick, "Show me more" and the demo never use them, and they stay out of the demo video and the LinkedIn post.
- Pexels had few Ganesh pandal photos, so 5 of the 16 pandal photos are Durga Puja pandals, kept for their structure ideas with Sah-Nikhil's approval.

## Sources

Checked 2026-10-21: [Pexels License](https://www.pexels.com/license/), [Pexels terms, sections 5, 8 and 11](https://www.pexels.com/terms-of-service/), [Pexels API key notice](https://help.pexels.com/hc/en-us/articles/900004904026-How-do-I-get-an-API-key), [Pinterest developer guidelines](https://policy.pinterest.com/en/developer-guidelines), [Pinterest widgets](https://developers.pinterest.com/docs/web-features/widgets/), [Unsplash AI restriction](https://help.unsplash.com/en/articles/2612332-what-do-you-mean-by-compiling-images-to-replicate-a-similar-or-competing-service).
