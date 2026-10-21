# How Inspirations get onto the Canvas

Decision asset for [How do Inspirations get onto the Canvas in v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/17), settled with Sah-Nikhil on 2026-10-21. Planning only: this describes behaviour, not code. Terms follow [CONTEXT.md](../../CONTEXT.md).

Inputs: [Which Inspiration sources can we use, and how can Pinterest come in?](https://github.com/Sah-Nikhil/Utsavvy/issues/8) (Pexels first with credit; Pinterest only through its official widget; Instagram through tokenless public oEmbed; uploads after a rights confirmation; local palette plus a model call for style words), [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15) and [ADR 0004](../adr/0004-event-keys.md) (image generation only with a Google or OpenAI Event key; the default model can't make images), [How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11) (Inspirations Section, placement in free space, history with Restore, Function filter), [What does the Assistant produce from a first brief?](https://github.com/Sah-Nikhil/Utsavvy/issues/13) (vibe pick, Theme shape, Estimates only from the reference table) and [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12) ([assistant-behavior.md](assistant-behavior.md): small requested changes apply at once, unrequested ones are Proposals, the "new Inspiration" Nudge, outside content is data). Research: branch `research/inspiration-sources`, file `research/inspiration-sources.md`.

The examples use the Jaipur wedding from the other design docs, planned by Meera, Rohan and Aditi, with the Theme "royal Rajputana, marigold, pastel pink".

## Kinds of Inspiration

An Inspiration is either an **image** (we hold the picture or a licensed link to it) or a **Reference** (a link to someone else's Pinterest or Instagram post that we only embed).

| Source | Kind | What we store | How it shows | Credit line | Assistant can see the picture | Remix | Use for Theme |
|---|---|---|---|---|---|---|---|
| Pexels | image | Pexels id, image URL, photographer, links, alt text | The Pexels image | "Photo by Anil Sharma on Pexels", both linked | Yes | Yes | Palette and words |
| Member upload (including a pasted screenshot) | image | The file in Convex storage | The file | "Uploaded by Meera", plus "From a Pinterest Pin" or "From an Instagram post" with a link when it came from a Reference | Yes | Yes | Palette and words |
| Generated | image | The file in Convex storage, the prompt | The file | "AI-generated" | Yes | Yes | Palette and words |
| Remix | image | The file, a link to the original | The file | "AI remix", plus "Remixed from..." with the original's credit | Yes | Yes | Palette and words |
| Pinterest Pin or board | Reference | The Member's URL and note only | Pinterest's official `pinit.js` widget (`embedPin` or `embedBoard`), link card as fallback | The widget's own credit, plus "Open on Pinterest" | No | No (see rule 14) | Words from the Member's note only |
| Instagram post or Reel | Reference | The Member's URL and note only | Instagram's oEmbed HTML, rendered in the browser and never stored; link card when the post is private or deleted | The embed's own credit, plus "Open on Instagram" | No | No (see rule 14) | Words from the Member's note only |

## Decisions

### Adding Inspirations

1. **One "Add Inspiration" panel** with four tabs: Search (Pexels), Upload, Paste a link (Pinterest or Instagram), and Generate. It opens from the "+" on the Inspirations Section and from the "+" button beside the Chat box. The phone share sheet is the third way in (rule 9). New Inspirations land in free space in the Inspirations Section, as decided for the Canvas.
2. **Search** runs a live Pexels search. The query starts from the Theme words and can be edited ("marigold mandap", "mehndi backdrop"). Narrow queries work best, because Pexels covers specific Indian decor unevenly. Search results are cached for 24 hours, as Pexels recommends, to stay inside 200 requests an hour.
3. **Asking in the Chat.** "Find me some haldi decor ideas" makes the Assistant search Pexels and show about 6 results as a strip in its reply. Members tap the ones they like, and only those become Inspirations. Any Member in the Chat can tap. Nothing lands on the Canvas that nobody chose.
4. **Upload.** Images only (JPEG, PNG, WebP; iPhones hand photos over as JPEG), up to 10 MB each and 10 at a time. The browser shrinks each to 2048 px on its long side before uploading. Paste from the clipboard (Ctrl+V after "Copy image") and drag-and-drop both work. A short note sits under the upload box: "Photos with people in them are fine to keep, but Remix works best on decor-only shots." Uploads are visible only to the Event's Members.
5. **Upload rights.** When the Event's creator creates the Event, they switch a setting on or off for everyone in it: "Members have the right to use the images they upload, or use them only for our private planning." Every Member inherits it. While it is on, uploads go straight through. While it is off, each upload batch asks for one tick with the same wording before it uploads. Who can change the setting later is for [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14).
6. **Paste a link** accepts Pinterest Pin and board URLs (including `pin.it` short links) and Instagram post and Reel URLs. We check the host and path, store the URL the Member gave, and let the platform's own embed draw it. The server never opens the link to fetch an image, a thumbnail or the page (rule 14).
7. **"What do you like in this?"** Saving a Reference asks this optional question, with tap chips from the Theme and the post type ("colours", "the stage", "flowers", "lighting", "the outfit") plus a free-text line. The note shows on the card. It is all the Assistant knows about a Reference. If a Reference has no note when it becomes relevant, the Assistant asks once in the Chat.
8. **Function tag.** Each Inspiration can be tagged with one Function or left Event-wide, which is the default. Members set it from a chip on the card. The Assistant tags one only when the request names a Function ("find mehendi decor"). The Canvas's Function filter then treats it like any other Item.
9. **Phone share sheet** (installed app on Android; iPhones have no share target, so iPhone users paste the link or upload instead). Sharing into Utsavvy opens a small sheet with the Member's Events (last used first, skipped when they have only one), the optional "What do you like in this?" note, and Save. A shared link becomes a Reference. A shared image file becomes an upload, with the rights tick on the same sheet when the Event's setting is off. A Chat line from the Member follows: "Meera added a Pinterest Pin: 'love the teal drapes'", pointing at the new card. Android puts shared links in the `text` field, so the link is parsed from `text`, `url` or `title`, whichever has it.

### Generating and remixing

10. **Generate** exists only in Events whose Event key is Google (`gemini-nano-banana-2.1`) or OpenAI (`gpt-image-2.5-flare`) ([ADR 0004](../adr/0004-event-keys.md)). Without one, the tab is shown greyed out with one line, "Attach a Google or OpenAI Event key to generate images", linking to the Event key settings. With one, the prompt box is prefilled from the Theme ("marigold mandap, royal Rajputana, pastel pink"), and each request makes one image labelled "AI-generated". Asking in the Chat ("make me an image of a marigold haldi courtyard") does the same. The Member asked for that one image, so it is added at once and the reply points at it.
11. **Daily cap.** Generations and Remixes together are capped at 20 per Event per day (Indian Standard Time). The count shows on the Generate tab ("14 of 20 left today"). The cap stops a stuck retry loop from draining a Member's key. It is a setting, like the other thresholds.
12. **Remix** redraws one image Inspiration in the Event's Theme. The image model receives that picture and the Theme and returns a new picture that keeps the layout and changes the look. For example, a white-and-gold reception stage from Pexels comes back draped in pastel pink with marigold strings and brass lamps. Remix works on Pexels photos (Pexels' licence allows edits), uploads (including pasted screenshots) and generated images or earlier Remixes. It needs a capable Event key and counts toward the cap.
13. **A Remix lands beside its original** as a new Inspiration labelled "AI remix", with a "Remixed from..." line linking to the original and keeping its credit ("Remixed from a photo by Anil Sharma on Pexels", "Remixed from Meera's upload, from a Pinterest Pin"). It has a **"Use instead"** action that puts the Remix in the original's place and sends the original to history, where it can be restored. Several Remixes held as swipeable variants in one Item are a stretch goal if time allows after the v1 core; otherwise they wait in the Ideas discussion [Remix variants in one Inspiration](https://github.com/Sah-Nikhil/Utsavvy/discussions/24).
14. **Remixing what Members found on Pinterest or Instagram.** Every Reference card has two buttons:
    - **"Remix this"** opens the upload sheet, already linked to that card, with one line: "Copy the image (or take a screenshot) and paste it here." Once the Member pastes or picks the file, it is an ordinary upload under rule 5. It can be remixed, the Assistant can see it, and its credit says where it came from with a link back.
    - **"Make one like this"** generates a fresh image from the Member's note plus the Theme ("teal drapes, brass lanterns hanging from a tree" plus "royal Rajputana, marigold, pastel pink"), labelled "AI-generated, inspired by a Pinterest Pin" with a link back. No Pinterest or Instagram pixels are used.

    Our server never fetches images from Pinterest or Instagram. Pinterest's Terms of Service forbid accessing its content "by using automated means (without our express prior permission)", and its developer guidelines say "Not create new content from Pins". Instagram's oEmbed rules prohibit "consuming, manipulating, extracting, or persisting" the content, and oEmbed no longer returns a thumbnail. Neither has an exception for private or non-commercial use. A Member's consent doesn't change this, because the terms bind whoever does the fetching. See "Revisit if results are poor" below.

### The Theme

15. **"Use for Theme"** is an action on every Inspiration. On an image, it reads the saved description (rule 19) and the image's palette. On a Reference, it reads only the Member's note, so it adds words but no colours. It merges the result into the Theme's shape from the first brief: 3 to 5 palette colours, 2 to 4 style words and 3 to 6 decor keywords.
16. **A Member's own request applies at once.** Following [assistant-behavior.md](assistant-behavior.md), a Member tapping "Use for Theme", or the Nudge button "Update the Theme" after a new Inspiration, has asked for a small change. The Theme updates straight away, and the Chat shows "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'", with Undo in history so every co-planner sees it. When the Assistant decides on its own that the Theme should change, the change was not asked for, so it arrives as a Proposal. Members can also edit the Theme by hand at any time.
17. **A Theme change never rewrites the plan.** Existing Entries stay as they are. After a change, the Assistant offers 1 to 3 new decor Suggestions that fit it ("brass lantern walkway at the mehendi"). Each one carries an Estimate from the reference table through its cost category, exactly like the first plan's Suggestions; the model never writes an amount. The note on each decor budget Entry shows the current Theme words, so the brief for the decorator stays current.
18. **Palette extraction** runs on the server, on pictures we are allowed to read: uploads, generated images, Remixes and Pexels images. It produces up to 5 hex colours (`node-vibrant` or Color Thief). It never runs on a Reference.

### How the Assistant sees Inspirations

19. **A description at save.** When an image Inspiration is saved, the helper model (`claude-haiku-5-5`, or the Event key's helper model) looks at it once and stores a short description with colours and decor keywords, for example "stage with marigold strings, brass urli, pastel pink drapes". The Assistant reads these descriptions, not pixels, so every Chat turn stays cheap. Pexels' own alt text is kept too. Text found in an image counts as outside content: it is data, never instructions ([assistant-behavior.md](assistant-behavior.md), rule 22).
20. **Pixels only when pointed at.** The Assistant gets the actual picture only when a Member points at a specific image Inspiration in the Chat ("would this stage work for 300 Guests?") or taps "Use for Theme". That is at most a few images per turn. It never receives a Reference's picture. For a Reference it has the Member's note and the platform name.

### The vibe pick

21. **13 curated sets of 12 Pexels images.** Weddings get one set per Tradition: North Indian Hindu, Marwari or Rajasthani, Punjabi or Sikh, Muslim, South Indian Hindu, Bengali and Christian. A Mixed wedding shows 6 from each of its two Traditions, and Other uses a general wedding set drawn from the seven. Birthdays get child, adult, and parent or grandparent sets. Community events get Ganesh utsav, Durga puja and general society event sets. That makes 156 images.
22. **Curation is a build task.** A build agent shortlists candidates through the Pexels API, and Sah-Nikhil approves them in one sitting. The approved sets are a seed file holding each image's Pexels id, image URL, photographer, photographer link, Pexels page link and alt text, so the grid appears instantly with no live search. A check confirms every seeded URL still loads.
23. **Tapped images become Inspirations** in the Inspirations Section with their Pexels credit, Event-wide, each getting its description as in rule 19. "Show me more" in the vibe pick is the same live Pexels search as rule 2.

### Credits, deletion and takedown

24. **Every Inspiration shows where it came from** (the credit column in the table above). Pexels images link both the photographer and Pexels, as the Pexels API guidelines ask. Generated images also carry the provider's own watermark, such as Google's SynthID.
25. **Any Member can delete any Inspiration.** A deleted Inspiration can be restored from history, as decided for the Canvas. Stored files (uploads, generated images and Remixes) are purged 30 days after deletion. Deleting an original doesn't delete its Remixes; their "Remixed from..." line then says the original was deleted, and keeps its credit.
26. **Takedown.** A "Report content" email address in the app footer handles requests from people outside the Event, such as a photographer who finds their work in a public demo. Uploads are never public, and Event pages are visible only to their Members.

## Tools (sketch)

These add to the tool sketch in [assistant-behavior.md](assistant-behavior.md), which lists `generateImage` as owned here. The build plan fixes names and arguments. Every write is the same server-checked, idempotent mutation used elsewhere.

| Tool | What it does | Applies |
|---|---|---|
| `searchStockImages` | Pexels search; returns about 6 results shown as a tappable strip in the reply | Nothing is added until a Member taps |
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
    | { kind: "pexels"; pexelsId: number; imageUrl: string; photographer: string; photographerUrl: string; pageUrl: string; alt: string }
    | { kind: "upload"; fileId: Id<"_storage">; fromReference: Id<"inspirations"> | null }
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

**Pexels from the Chat.** Rohan asks "find some haldi decor ideas". The Assistant shows 6 Pexels results. Aditi taps two. Two Inspirations land in the Inspirations Section, credited to their photographers and Pexels, and tagged haldi because the request named the Function. The rule-based Nudge offers "Update the Theme"; nobody taps it, and the Theme is unchanged.

**Pinterest via the share sheet, then Remix.** Meera shares a Pin from the Pinterest app on Android. Utsavvy asks which Event (she has two), and she types "love the teal drapes and brass lanterns". A Reference card appears with Pinterest's widget, and the Chat shows "Meera added a Pinterest Pin: 'love the teal drapes and brass lanterns'". She taps "Remix this", long-presses the Pin's image in the Pinterest app, copies it and pastes it. The Event's rights setting is on, so it uploads straight away, credited "Uploaded by Meera, from a Pinterest Pin" with a link. The Event has a Google Event key, so the Remix comes back in pastel pink and marigold beside the upload and counts 1 of 20 for the day. Meera taps "Use for Theme" on the upload. The Theme gains teal and "brass lanterns" at once, the Chat shows the change line, and the Assistant offers one new Suggestion, "brass lantern walkway at the mehendi", with an Estimate from the reference table.

**No Event key.** In a birthday Event with no Event key, Aditi opens the Generate tab. It is greyed out with "Attach a Google or OpenAI Event key to generate images". On her Instagram Reference, "Remix this" and "Make one like this" both show the same line. Search, Upload, Paste a link and "Use for Theme" still work.

**Rights setting off.** The Event's creator left the upload rights setting off. Rohan drags in 4 photos; one tick for the batch is required before they upload.

**Pointing.** Meera selects an uploaded stage photo and asks "would this work for 300 Guests?". The Assistant receives that one picture plus its description and answers. In its next unrelated turn it has only descriptions again.

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
- [Pexels API documentation and guidelines](https://www.pexels.com/api/documentation/), [Pexels license](https://www.pexels.com/license/).
- [Chrome Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target).
