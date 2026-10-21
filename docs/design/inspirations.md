# How Inspirations get onto the Canvas

Decision asset for [How do Inspirations get onto the Canvas in v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/17), settled with Sah-Nikhil on 2026-10-21. Planning only: this describes behaviour, not code. Terms follow [CONTEXT.md](../../CONTEXT.md).

Inputs: [Which Inspiration sources can we use, and how can Pinterest come in?](https://github.com/Sah-Nikhil/Utsavvy/issues/8) (Pexels first with credit; Pinterest only through its official widget; Instagram through tokenless public oEmbed; uploads after a rights confirmation; local palette plus a model call for style words), [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15) and [ADR 0004](../adr/0004-event-keys.md) (image generation only with a Google or OpenAI Event key; the default model can't make images), [How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11) (Inspirations Section, placement in free space, history with Restore, Function filter), [What does the Assistant produce from a first brief?](https://github.com/Sah-Nikhil/Utsavvy/issues/13) (vibe pick, Theme shape, Estimates only from the reference table) and [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12) ([assistant-behavior.md](assistant-behavior.md): small requested changes apply at once, unrequested ones are Proposals, the "new Inspiration" Nudge, outside content is data). Research: branch `research/inspiration-sources`, file `research/inspiration-sources.md`.

The examples use the Jaipur wedding from the other design docs, planned by Meera, Rohan and Aditi, with the Theme "royal Rajputana, marigold, pastel pink".

> **Amended on 2026-10-21** with Sah-Nikhil, after Pexels paused new API keys: stock photos now come from Utsavvy's own stock library of 80 photos hand-curated from Pexels, served from our app, with no Pexels API ([ADR 0012](../adr/0012-stock-photos-from-a-local-hand-curated-library.md)). Rules 2, 3, 12, 14, 18 to 24, the tables and the worked examples below are rewritten for it. Rule 14 also gets a rights correction: a screenshot of someone else's Pin or post is never a Remix source.

## Kinds of Inspiration

An Inspiration is either an **image** (we hold the picture or a licensed link to it) or a **Reference** (a link to someone else's Pinterest or Instagram post that we only embed).

| Source | Kind | What we store | How it shows | Credit line | Assistant can see the picture | Remix | Use for Theme |
|---|---|---|---|---|---|---|---|
| Stock library (Pexels photos) | image | Pexels id, the local file path, photographer, links, alt text, curator tags, palette | Our own WebP copy from `public/inspirations/` | "Photo by Anil Sharma on Pexels", both linked | Its alt text and tags (rule 20) | Yes | Palette and words |
| Member upload (including a pasted screenshot) | image | The file in Convex storage | The file | "Uploaded by Meera", plus "From a Pinterest Pin" or "From an Instagram post" with a link when it came from a Reference | Yes | Only with the Member's rights tick, never when it came from a Reference (rule 14) | Palette and words |
| Generated | image | The file in Convex storage, the prompt | The file | "AI-generated" | Yes | Yes | Palette and words |
| Remix | image | The file, a link to the original | The file | "AI remix", plus "Remixed from..." with the original's credit | Yes | Yes | Palette and words |
| Pinterest Pin or board | Reference | The Member's URL and note only | Pinterest's official `pinit.js` widget (`embedPin` or `embedBoard`), link card as fallback | The widget's own credit, plus "Open on Pinterest" | No | No (see rule 14) | Words from the Member's note only |
| Instagram post or Reel | Reference | The Member's URL and note only | Instagram's oEmbed HTML, rendered in the browser and never stored; link card when the post is private or deleted | The embed's own credit, plus "Open on Instagram" | No | No (see rule 14) | Words from the Member's note only |

## Decisions

### Adding Inspirations

1. **One "Add Inspiration" panel** with four tabs: Search (the stock library), Upload, Paste a link (Pinterest or Instagram), and Generate. It opens from the "+" on the Inspirations Section and from the "+" button beside the Chat box. The phone share sheet is the third way in (rule 9). New Inspirations land in free space in the Inspirations Section, as decided for the Canvas.
2. **Search** looks through the stock library: 80 photos hand-curated from Pexels under the Pexels License, in four sets of 20 (North Indian Hindu wedding, general wedding, child birthday, Ganesh utsav), each with alt text and curator tags. The query starts from the Theme words and can be edited ("marigold mandap", "haldi"). A photo matches when a word of the query is one of its tags; photos with more matching words come first, and on a tie the Event's own set comes first. An empty query shows the Event's own set. There is no live search, no API key and no cache.
3. **Asking in the Chat.** "Find me some haldi decor ideas" makes the Assistant search the stock library and show up to 6 matching photos as a strip in its reply. When fewer match, it shows fewer; when none match, it says so and offers an upload. It never pads the strip with photos that don't match. Members tap the ones they like, and only those become Inspirations. Any Member in the Chat can tap. Nothing lands on the Canvas that nobody chose.
4. **Upload.** Images only (JPEG, PNG, WebP; iPhones hand photos over as JPEG), up to 10 MB each and 10 at a time. The browser shrinks each to 2048 px on its long side before uploading. Paste from the clipboard (Ctrl+V after "Copy image") and drag-and-drop both work. A short note sits under the upload box: "Photos with people in them are fine to keep, but Remix works best on decor-only shots." Uploads are visible only to the Event's Members.
5. **Upload rights.** When the Event's creator creates the Event, they switch a setting on or off for everyone in it: "Members have the right to use the images they upload, or use them only for our private planning." Every Member inherits it. While it is on, uploads go straight through. While it is off, each upload batch asks for one tick with the same wording before it uploads. Who can change the setting later is for [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14).
6. **Paste a link** accepts Pinterest Pin and board URLs (including `pin.it` short links) and Instagram post and Reel URLs. We check the host and path, store the URL the Member gave, and let the platform's own embed draw it. The server never opens the link to fetch an image, a thumbnail or the page (rule 14).
7. **"What do you like in this?"** Saving a Reference asks this optional question, with tap chips from the Theme and the post type ("colours", "the stage", "flowers", "lighting", "the outfit") plus a free-text line. The note shows on the card. It is all the Assistant knows about a Reference. If a Reference has no note when it becomes relevant, the Assistant asks once in the Chat.
8. **Function tag.** Each Inspiration can be tagged with one Function or left Event-wide, which is the default. Members set it from a chip on the card. The Assistant tags one only when the request names a Function ("find mehendi decor"). The Canvas's Function filter then treats it like any other Item.
9. **Phone share sheet** (installed app on Android; iPhones have no share target, so iPhone users paste the link or upload instead). Sharing into Utsavvy opens a small sheet with the Member's Events (last used first, skipped when they have only one), the optional "What do you like in this?" note, and Save. A shared link becomes a Reference. A shared image file becomes an upload, with the rights tick on the same sheet when the Event's setting is off. A Chat line from the Member follows: "Meera added a Pinterest Pin: 'love the teal drapes'", pointing at the new card. Android puts shared links in the `text` field, so the link is parsed from `text`, `url` or `title`, whichever has it.

### Generating and remixing

10. **Generate** exists only in Events whose Event key is Google (`gemini-nano-banana-2.1`) or OpenAI (`gpt-image-2.5-flare`) ([ADR 0004](../adr/0004-event-keys.md)). Without one, the tab is shown greyed out with one line, "Attach a Google or OpenAI Event key to generate images", linking to the Event key settings. With one, the prompt box is prefilled from the Theme ("marigold mandap, royal Rajputana, pastel pink"), and each request makes one image labelled "AI-generated". Asking in the Chat ("make me an image of a marigold haldi courtyard") does the same. The Member asked for that one image, so it is added at once and the reply points at it.
11. **Daily cap.** Generations and Remixes together are capped at 20 per Event per day (Indian Standard Time). The count shows on the Generate tab ("14 of 20 left today"). The cap stops a stuck retry loop from draining a Member's key. It is a setting, like the other thresholds.
12. **Remix** redraws one image Inspiration in the Event's Theme. The image model receives that picture and the Theme and returns a new picture that keeps the layout and changes the look. For example, a white-and-gold reception stage from Pexels comes back draped in pastel pink with marigold strings and brass lamps. Remix works on stock library photos (the Pexels License allows edits), uploads the Member has the rights to change (rule 14), and generated images or earlier Remixes. It needs a capable Event key and counts toward the cap.
13. **A Remix lands beside its original** as a new Inspiration labelled "AI remix", with a "Remixed from..." line linking to the original and keeping its credit ("Remixed from a photo by Anil Sharma on Pexels", "Remixed from Meera's upload, from a Pinterest Pin"). It has a **"Use instead"** action that puts the Remix in the original's place and sends the original to history, where it can be restored. Several Remixes held as swipeable variants in one Item are a stretch goal if time allows after the v1 core; otherwise they wait in the Ideas discussion [Remix variants in one Inspiration](https://github.com/Sah-Nikhil/Utsavvy/discussions/24).
14. **What Members found on Pinterest or Instagram.** Every Reference card has two buttons:
    - **"Add a screenshot"** opens the upload sheet, already linked to that card, with one line: "Copy the image (or take a screenshot) and paste it here." Once the Member pastes or picks the file, it is an ordinary upload under rule 5: the Assistant can see it, "Use for Theme" works, and its credit says where it came from with a link back. It is **never a Remix source**: the picture belongs to whoever posted it on Pinterest or Instagram, and pasting it doesn't give the Member the right to change it.
    - **"Make one like this"** generates a fresh image from the Member's note plus the Theme ("teal drapes, brass lanterns hanging from a tree" plus "royal Rajputana, marigold, pastel pink"), labelled "AI-generated, inspired by a Pinterest Pin" with a link back. No Pinterest or Instagram pixels and no copied Pin text are used.

    Any other upload can be remixed only after the Member who uploaded it ticks "I took this photo or have the rights to change it", once per upload.

    Our server never fetches images from Pinterest or Instagram. Pinterest's Terms of Service forbid accessing its content "by using automated means (without our express prior permission)", and its developer guidelines say "Not create new content from Pins". Instagram's oEmbed rules prohibit "consuming, manipulating, extracting, or persisting" the content, and oEmbed no longer returns a thumbnail. Neither has an exception for private or non-commercial use. A Member's consent doesn't change this, because the terms bind whoever does the fetching. See "Revisit if results are poor" below.

### The Theme

15. **"Use for Theme"** is an action on every Inspiration. On an image, it reads the saved description (rule 19) and the image's palette. On a Reference, it reads only the Member's note, so it adds words but no colours. It merges the result into the Theme's shape from the first brief: 3 to 5 palette colours, 2 to 4 style words and 3 to 6 decor keywords.
16. **A Member's own request applies at once.** Following [assistant-behavior.md](assistant-behavior.md), a Member tapping "Use for Theme", or the Nudge button "Update the Theme" after a new Inspiration, has asked for a small change. The Theme updates straight away, and the Chat shows "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'", with Undo in history so every co-planner sees it. When the Assistant decides on its own that the Theme should change, the change was not asked for, so it arrives as a Proposal. Members can also edit the Theme by hand at any time.
17. **A Theme change never rewrites the plan.** Existing Entries stay as they are. After a change, the Assistant offers 1 to 3 new decor Suggestions that fit it ("brass lantern walkway at the mehendi"). Each one carries an Estimate from the reference table through its cost category, exactly like the first plan's Suggestions; the model never writes an amount. The note on each decor budget Entry shows the current Theme words, so the brief for the decorator stays current.

    > Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: the decor Suggestions' Estimates come from the same cascade as the first plan's (researched, then the reference table, then the Assistant's own estimate), each labelled with its basis.
18. **Palette extraction** runs on the server, on pictures we are allowed to read: uploads, generated images and Remixes. It produces up to 5 hex colours (`node-vibrant`). Stock library photos carry their palette in the seed file, worked out once when the library was built. It never runs on a Reference.

### How the Assistant sees Inspirations

19. **A description at save.** When an upload, a generated image or a Remix is saved, the helper model (`claude-haiku-5-5`, or the Event key's helper model) looks at it once and stores a short description with colours and decor keywords, for example "stage with marigold strings, brass urli, pastel pink drapes". A stock library photo needs no model call: its curator's alt text is its description and its curator tags are its decor keywords. The Assistant reads these descriptions, not pixels, so every Chat turn stays cheap. Text found in an image counts as outside content: it is data, never instructions ([assistant-behavior.md](assistant-behavior.md), rule 22).
20. **Pixels only when pointed at.** The Assistant gets the actual picture only when a Member points at a specific upload, generated image or Remix in the Chat ("would this stage work for 300 Guests?") or taps "Use for Theme" on one. That is at most a few images per turn. For a stock library photo it has the alt text and tags, never the pixels. It never receives a Reference's picture. For a Reference it has the Member's note and the platform name.

### The vibe pick

21. **4 curated sets in v1.** The stock library's four sets each mark 12 of their 20 photos as vibe pick photos: North Indian Hindu wedding, general wedding, child birthday and Ganesh utsav, 48 in all. Every other wedding Tradition shows the general wedding set. Adult and parent or grandparent birthdays, Durga puja and other community events have no set yet, so their vibe pick is skipped with one line. The other 9 sets planned earlier (Marwari or Rajasthani, Punjabi or Sikh, Muslim, South Indian Hindu, Bengali, Christian; adult and parent or grandparent birthdays; Durga puja and general society events) are SHOULD (X9), curated the same way.
22. **Curation is a build task with a human in it.** The photos are hand-curated from Pexels under the Pexels License and approved by Sah-Nikhil. The seed file `seed/vibe-sets.json` holds, for each photo, its set, Pexels id, Pexels page link, photographer, photographer link, local file path, alt text, curator tags, palette, the date it was curated and whether it is a vibe pick photo. The files are WebP copies in `public/inspirations/<set>/<pexelsId>.webp`, so the grid appears instantly and nothing depends on a live service.
23. **Tapped images become Inspirations** in the Inspirations Section with their Pexels credit, Event-wide, with the description from rule 19. "Show me more" in the vibe pick shows the other 8 photos of the same set.

### Credits, deletion and takedown

24. **Every Inspiration shows where it came from** (the credit column in the table above). Stock library photos read "Photo by <photographer> on Pexels", linking both the photographer and the photo's Pexels page. The Pexels License doesn't require credit; we show it anyway. Generated images also carry the provider's own watermark, such as Google's SynthID.
25. **Any Member can delete any Inspiration.** A deleted Inspiration can be restored from history, as decided for the Canvas. Stored files (uploads, generated images and Remixes) are purged 30 days after deletion. Deleting an original doesn't delete its Remixes; their "Remixed from..." line then says the original was deleted, and keeps its credit.
26. **Takedown.** A "Report content" email address in the app footer handles requests from people outside the Event, such as a photographer who finds their work in a public demo. Uploads are never public, and Event pages are visible only to their Members.

## Tools (sketch)

These add to the tool sketch in [assistant-behavior.md](assistant-behavior.md), which lists `generateImage` as owned here. The build plan fixes names and arguments. Every write is the same server-checked, idempotent mutation used elsewhere.

| Tool | What it does | Applies |
|---|---|---|
| `searchStockImages` | Searches the stock library's curator tags; returns up to 6 matching photos as a tappable strip in the reply, fewer when fewer match | Nothing is added until a Member taps |
| `generateImage` | One image from a prompt (Event key only, counts toward the cap) | At once when a Member asked |
| `remixImage` | Redraw one image Inspiration in the Theme (Event key only, counts toward the cap); never accepts a Reference | At once when a Member asked |
| `updateTheme` | Merge palette colours, style words and decor keywords into the Theme | At once when a Member asked; a Proposal when it is the Assistant's own idea |
| `tagInspiration` | Set or clear an Inspiration's Function | At once when a Member asked |

There is no tool that opens a Pinterest or Instagram link.

## Data shape sketch

Field names are illustrative; the contract slice fixes them.

```ts
type Inspiration = {
  eventId: Id<"events">;
  functionKey: string | null;                 // null = Event-wide
  addedBy: Id<"members">;
  source:
    | { kind: "pexels"; pexelsId: number; localPath: string; photographer: string; photographerUrl: string; pageUrl: string; alt: string; tags: string[] } // a stock library photo
    | { kind: "upload"; fileId: Id<"_storage">; fromReference: Id<"inspirations"> | null; remixRightsTicked: boolean }
    | { kind: "generated"; fileId: Id<"_storage">; prompt: string; model: string; inspiredBy: Id<"inspirations"> | null }
    | { kind: "remix"; fileId: Id<"_storage">; remixOf: Id<"inspirations">; model: string }
    | { kind: "reference"; platform: "pinterest" | "instagram"; url: string; embed: "pin" | "board" | "post" | "reel" };
  memberNote: string | null;                  // "What do you like in this?"
  seen: { description: string; palette: string[]; decorKeywords: string[] } | null; // images only, written once at save
};

type ThemeUpdate = { addPalette: string[]; removePalette: string[]; addStyleWords: string[]; addDecorKeywords: string[]; fromInspiration: Id<"inspirations"> | null };
```

## Worked examples

These double as test cases.

**Stock photos from the Chat.** Rohan asks "find some haldi decor ideas". The Assistant shows 6 stock library photos tagged haldi. Aditi taps two. Two Inspirations land in the Inspirations Section, credited to their photographers and Pexels, and tagged haldi because the request named the Function. No model call describes them; their alt text and tags already do. The rule-based Nudge offers "Update the Theme"; nobody taps it, and the Theme is unchanged.

**Nothing in the library.** Aditi asks "show me Durga puja pandal ideas". No library photo has those tags, so the Assistant says "I don't have stock photos for that yet. You can upload your own." Nothing lands.

**Pinterest via the share sheet, then a screenshot.** Meera shares a Pin from the Pinterest app on Android. Utsavvy asks which Event (she has two), and she types "love the teal drapes and brass lanterns". A Reference card appears with Pinterest's widget, and the Chat shows "Meera added a Pinterest Pin: 'love the teal drapes and brass lanterns'". She taps "Add a screenshot", long-presses the Pin's image in the Pinterest app, copies it and pastes it. The Event's rights setting is on, so it uploads straight away, credited "Uploaded by Meera, from a Pinterest Pin" with a link. It has no Remix button, because the picture is someone else's. Meera taps "Use for Theme" on the upload. The Theme gains teal and "brass lanterns" at once, the Chat shows the change line, and the Assistant offers one new Suggestion, "brass lantern walkway at the mehendi", with an Estimate from the reference table. The Event has a Google Event key, so she taps "Make one like this" on the Reference: a fresh image of teal drapes and brass lanterns in pastel pink and marigold, labelled "AI-generated, inspired by a Pinterest Pin", counts 1 of 20 for the day.

**No Event key.** In a birthday Event with no Event key, Aditi opens the Generate tab. It is greyed out with "Attach a Google or OpenAI Event key to generate images". On her Instagram Reference, "Make one like this" shows the same line. Search, Upload, Paste a link and "Use for Theme" still work.

**Rights setting off.** The Event's creator left the upload rights setting off. Rohan drags in 4 photos; one tick for the batch is required before they upload.

**Pointing.** Meera selects an uploaded stage photo and asks "would this work for 300 Guests?". The Assistant receives that one picture plus its description and answers. In its next unrelated turn it has only descriptions again. Had she pointed at a stock library photo, the Assistant would have had its alt text and tags only.

## Revisit if results are poor

Sah-Nikhil wants Pinterest and Instagram images to be easy to remix. If testing shows that copy-and-paste or screenshots are too clumsy, we may switch to a **consented server fetch**: the Member ticks a consent box and our server opens the shared link and pulls the image. The risks, written down now so the choice is made knowingly:
- Pinterest's Terms of Service and developer guidelines quoted in rule 14 forbid automated access without permission and new content made from Pins. They have no private or non-commercial exception, and the consent box doesn't move responsibility off Utsavvy.
- Instagram serves its pages to servers behind a login wall, and its oEmbed has no thumbnail, so an Instagram fetch would mostly fail.
- Either platform can block the app's embeds, and the code would be visible in the public repo the judges read.

## Glossary

Added to [CONTEXT.md](../../CONTEXT.md): **Reference** and **Remix**. **Inspiration** now covers uploads and Instagram too.

## Hand-offs

- [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18):
  - Slices from this design: the Add Inspiration panel (Search, Upload with paste and the rights setting, Paste a link with Pinterest and Instagram embeds); the share target with the Event picker; Generate and Remix behind a capable Event key with the daily cap; descriptions at save and palette extraction; "Use for Theme" and Theme-driven Suggestions; vibe pick curation (13 sets, approved by Sah-Nikhil); deletion with the 30-day purge.
  - Whether the seeded demo Event has an Event key so judges can see Generate and Remix, and who pays for it.
  - The Android device check from the research: install the PWA, share one Pinterest Pin, one board, one Instagram post and one Reel, and record which fields arrive and whether any app sends an image file.
  - Storage: uploads and generated images count against Convex file storage, and the 30-day purge is a scheduled job.
  - The worked examples above as scripted test cases.
- [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14): who can change the upload rights setting after the Event is created.

## Sources

- Research report: `research/inspiration-sources:research/inspiration-sources.md`.
- [Pinterest Terms of Service](https://policy.pinterest.com/en/terms-of-service), section 2a; [Pinterest developer guidelines](https://policy.pinterest.com/en/developer-guidelines), "Publishing content" and "What not to do"; [Pinterest widgets](https://developers.pinterest.com/docs/web-features/widgets/).
- [Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed), "Limitations"; [Instagram oEmbed reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/) (fields: `html`, `provider_name`, `provider_url`, `type`, `version`, `width`); [Meta Platform Terms](https://developers.facebook.com/terms/).
- [Pexels license](https://www.pexels.com/license/) and [terms](https://www.pexels.com/terms-of-service/) (the stock library, ADR 0012).
- [Chrome Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target).
