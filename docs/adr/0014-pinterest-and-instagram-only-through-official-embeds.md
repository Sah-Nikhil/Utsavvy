# Pinterest and Instagram come in only through their official embeds, and they are MUST

Members find their taste on Pinterest and Instagram, so v1 lets them bring it in, three ways, all MUST since 2026-10-22:

- **Browse ideas on Pinterest** (S21). A sheet lists public boards on Utsavvy's own Pinterest account, which Sah-Nikhil curates, one per Function or theme (haldi decor, mehendi, sangeet stages, kids' party themes, Ganesh pandals and so on). Opening one shows it through Pinterest's official board widget (`pinit.js`, `data-pin-do="embedBoard"`, up to 50 Pins), with "Open board on Pinterest" beside it.
- **Paste a link** (X2). A Member pastes a Pinterest Pin or board URL, or an Instagram post or Reel URL, adds what they like in it, and it becomes a Reference: Utsavvy stores only the URL and the note, and the platform's own embed draws it.
- **Share from the phone** (X8). On Android, with Utsavvy installed as a PWA, sharing a Pin, a board, a post or a Reel from the Pinterest or Instagram app into Utsavvy opens the Event picker and saves a Reference.

Picking one Pin from a board works through Pinterest: the Member taps it, it opens on Pinterest, and they bring its link back by pasting it or, on Android, sharing it into Utsavvy. Decided with Sah-Nikhil on 2026-10-22, who chose the official boards only (no Google Images and no search buttons) and settled the schedule later that day (see Consequences).

## Why this way

Pinterest's board widget is the one official way to show Pinterest images inside another site. Pinterest draws its own tiles and credits, and each tile links back to its Pin, which is what Pinterest's developer guidelines require ("Link Pins back to their source on Pinterest", "Not cover or obscure content from Pinterest"). Utsavvy never holds the pictures, so the rights question from [ADR 0012](0012-stock-photos-from-a-local-hand-curated-library.md) doesn't arise. Since June 2026, Meta's Instagram oEmbed works without an app or token, so Instagram embeds need no Meta app review.

The widget has no selection event, so the board can inspire but can't hand a tile to our code. Bringing the link back keeps every saved Reference a choice the Member made, on a page Pinterest controls.

## Considered options

- **Google Images or Pinterest search inside Utsavvy** (Sah-Nikhil, 2026-10-22). Both pages send `X-Frame-Options: SAMEORIGIN` (checked 2026-10-22), so no browser will show them inside our app, PWA or not. Showing their results in our own grid would display other people's photos with no rights to them.
- **"Search Pinterest" and "Search Google Images" buttons** that open a new tab with the Theme words. Offered and declined: Sah-Nikhil chose the official boards only.
- **A "Save to Event" button on each widget tile, or reading the tile links out of the widget.** Technically possible, because the widget builds ordinary page elements, but a button over a tile covers Pinterest content, and reading its links is automated extraction. Both are against Pinterest's developer guidelines.
- **Resolving `pin.it` short links on our server.** The Pin widget documents only full Pin URLs, and X2's rule is that our server never opens a Member's link. A `pin.it` link is saved as a link-only Reference that asks the Member to open it on Pinterest and paste the full Pin URL for a preview.
- **The Pinterest API or a board's RSS feed as a picture catalog.** Rejected in ADR 0012: Pinterest forbids storing what its API returns.
- **A hand-written Instagram embed** (a `blockquote` with `data-instgrm-permalink`). It may work but isn't Meta's documented contract; the tokenless oEmbed response is.

## Consequences

- Every Pinterest and Instagram embed renders inside a small page of ours at `/embed/pinterest` or `/embed/instagram`, loaded in an iframe on the Canvas card or in the sheet. Only those routes get Pinterest's and Instagram's hosts in their Content Security Policy, so the rest of the app keeps its tighter policy. The isolation also keeps Pinterest's page changes and injected stylesheet out of our React tree, and Pinterest's logging beacon sees the embed page's address, not the Event's. The embed page reports its height to the card so the iframe fits.
- The `/embed/instagram` page asks Meta's oEmbed endpoint (`graph.facebook.com/v25.0/instagram_oembed`, tokenless, 1,000 requests an hour) for the post on each view and renders the answer without storing it, keeping only the `blockquote` and loading `www.instagram.com/embed.js` itself. That call goes to Meta's API, not to the Member's link.
- Private, deleted or embed-disabled posts, removed Pins and a failed script all fall back to a plain link card.
- The boards live on Utsavvy's own Pinterest account (decided 2026-10-22), a free business account that Sah-Nikhil runs and fills by saving Pins by hand; Pinterest's terms rule out bots. Removing a Pin there removes it from the sheet.
- A Pin saved to Utsavvy's boards is still someone else's picture. It shows only through Pinterest's widget, and Utsavvy never copies it, stores it or lets the Assistant read it; the pictures Utsavvy holds and reads are its own stock library ([ADR 0012](0012-stock-photos-from-a-local-hand-curated-library.md)) and Members' uploads.
- The share target needs Utsavvy to be installable (a web app manifest with icons, from X8) and a test on a real Android phone of what the Pinterest and Instagram apps actually send. iPhones and desktops have no share target, so they paste the link. Shared image files are SHOULD (X13); v1 shares links.
- The Browse ideas sheet and the Paste a link tab each say in one line that this content loads from Pinterest or Instagram, which receive the usual browser data.
- The MUST tier grows by S21 (M), X2 (now L: Pinterest and Instagram) and X8 (M). Later on 2026-10-22 Sah-Nikhil gave them a fourth agent of their own instead of moving anything to SHOULD: X2 starts as soon as the contract merges, then S21, then X8, one at a time beside the waves.

## Sources

Checked 2026-10-22: [Pinterest widgets](https://developers.pinterest.com/docs/web-features/widgets/), [Pinterest add-ons](https://developers.pinterest.com/docs/web-features/add-ons-overview/), [Pinterest developer guidelines](https://policy.pinterest.com/en/developer-guidelines), [Pinterest terms](https://policy.pinterest.com/en/terms-of-service), [the served `pinit_main.js`](https://assets.pinterest.com/js/pinit_main.js), [Meta's tokenless oEmbed announcement](https://developers.facebook.com/blog/post/2026/06/15/tokenless-access-to-meta-oembed-apis/), [Meta's embeds plugin](https://github.com/facebook/meta-embeds-for-wordpress/blob/main/README.md), [MDN `share_target`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target), [Chrome Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [Chrome install criteria](https://web.dev/articles/install-criteria), [Next.js manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest). The `X-Frame-Options` headers on `pinterest.com/search` and `google.com/search` by request.
