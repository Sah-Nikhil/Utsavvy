---
id: 3
title: Which Inspiration sources can we use, and how can Pinterest come in?
labels: [wayfinder:research]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/8. Edit it there; this file is no longer updated.

## Question

Which sources can put Inspirations on a Canvas legally and within a one-week build, and how can Pinterest references come in?

Cover:

- Pinterest: API v5 access tiers and review time, which endpoints a new app can use (a Member's own boards and pins through OAuth, any pin search), display terms, and the no-API routes (pin and board embeds, oEmbed, pasting a pin URL).
- Stock photos: Unsplash and Pexels API limits, hotlinking, attribution and download-tracking rules, and how well they cover Indian weddings, birthdays and community events.
- AI images: current Gemini image models and Imagen (cost, free usage, editing an existing image into a theme, watermarking), and any comparable option.
- Shared posts: what an Instagram or Pinterest post shared from a phone actually delivers (URL, image or text), and whether Instagram embeds need a Meta app and token.
- Extracting a theme (palette, style, decor keywords) from an image: on the client or with a model.

End with a recommended v1 approach.

Findings: branch `research/inspiration-sources`, file `research/inspiration-sources.md`.

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Findings: branch `research/inspiration-sources` (commit `ebc792f`), file `research/inspiration-sources.md`. A terms review, not legal advice.

- **Pinterest**: any API access (even Trial) needs a business account and Pinterest's approval, with no guaranteed turnaround. The API only reads the signed-in account's own boards and Pins; general Pin search (`/v5/search/partner/pins`) is beta and not available to new apps. Pinterest's guidelines forbid storing API data, scraping, and making new content from Pins. **The v1 route**: a Member pastes or shares a Pin or board URL; we store only that URL and render it with Pinterest's official widget (`pinit.js`), linking back. We don't download, analyze, recolor or AI-remix Pinterest images; a Pinterest reference only shapes the theme through the Member's own words.
- **Instagram**: public oEmbed has needed no token or app review since 2026-06-15 (1,000 requests an hour). Store the link and show the embed or a link card. Embedding gives no right to remix.
- **Stock photos**: **Pexels first** (free key, 200 requests an hour, 20,000 a month, edits allowed, Pexels link and photographer credit on every image). Unsplash's demo tier is 50 an hour, needs a production review and routes AI use elsewhere, so it waits. Coverage of specific Indian decor is uneven; narrow queries (e.g. "marigold mandap") and uploads fill gaps.
- **AI images**: no free tier for image generation in the Gemini API. `gemini-3.1-flash-lite-image` or `gemini-nano-banana-2.1` cost about $0.034 per 1K image plus input tokens, carry a SynthID watermark, and can edit an input image. Imagen and `gemini-2.5-flash-image` are shut down. Remix only AI-created images, Member-owned uploads (after the Member confirms rights) and suitable stock images, with a per-Event cap.
- **Theme extraction**: palette hex codes locally (`node-vibrant` or Color Thief, where CORS allows) plus a Gemini call returning `{palette, style, decorKeywords}` that the Member can edit before it feeds the plan.
- **Phone share sheet**: Android sends links in the `text` field, not `url`; the exact payload from the Pinterest and Instagram apps has to be checked on a real phone before promising one-tap sharing. Paste and upload stay as the fallback.

Input to [How do Inspirations get onto the Canvas in v1?](./012-inspirations-v1.md).
