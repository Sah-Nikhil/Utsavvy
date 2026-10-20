---
id: 11
title: How do Vendors and Listed prices get into v1?
labels: [wayfinder:grilling]
status: open
assignee:
parent: 1
blocked_by: [2, 15]
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/16. Edit it there; this file is no longer updated.

## Question

How do Vendors and Listed prices get into v1?

- Which sources, which demo cities and which Vendor categories.
- Whether Vendors are fetched live when a Member searches, or collected ahead of time.
- How a Listed price records its source and the date it was seen.
- When the Assistant may give an Estimate instead, and how a Member records a Quote.
- How the map and its Markers filter by Function needs (capacity, budget, category).

Inputs: [Where can Vendor locations and Listed prices for Indian venues legally come from?](./002-vendor-data-sources.md) and [Which search and geocoding services can power live Vendor discovery?](./015-search-and-geocoding-services.md).

## Comments

### 2026-10-21 Sah-Nikhil

Raised during charting: what about a computer-use agent that reads the directory listings (WedMeGood and similar) in a browser instead of scraping them?

- It doesn't change the terms picture. The directories ban robots, bots and automated data collection whatever the mechanism (VenueLook's terms also cover "equivalent manual processes"), and showing the collected prices publicly in the app is the reuse their terms forbid. See [Where can Vendor locations and Listed prices for Indian venues legally come from?](./002-vendor-data-sources.md). Not legal advice, but a public hackathon repo makes it visible.
- **Where computer use does fit**: browsing each Vendor's own website to collect the curated v1 set (name, address, Listed price, unit, URL, date seen). Small, first-party, cited.
- **Other legitimate ways to surface directory prices**: a "Compare on WedMeGood" link on each Vendor card, and live Chat answers through grounded search that cite their sources and aren't stored on the Canvas.

### 2026-10-21 Sah-Nikhil

Follow-up: can the Assistant run a web search, open the pages it finds and reply with the prices it sees?

- **Yes, from a search provider's grounded results.** With Gemini's Google Search grounding (or Claude's web search tool), the provider retrieves and cites the pages and the Assistant answers in the Chat with those citations. Our app isn't crawling the directories. Directory prices can appear this way as cited answers, live, per question. Gemini's terms require showing the citations with the answer and forbid storing grounded results as an index or database, so these answers stay in the Chat; they don't become Listed prices on the Canvas.
- **Not by fetching directory pages itself.** The Assistant (our server, or a fetch tool acting for us) opening WedMeGood or VenueLook pages is automated access their terms ban.
- **Vendors' own websites are fair game live**: the Assistant can search, open a Vendor's own page and record a Listed price (URL, unit, conditions, date seen) on the Canvas, which extends the curated set on demand. Claude's web search tool takes `allowed_domains` / `blocked_domains`, which could keep fetches off the directories.
- To decide here: whether live Vendor discovery is in v1 or only the curated set, and what a price from a Chat answer is called if a Member wants to keep it (probably they record a Quote after contacting the Vendor).

### 2026-10-21 Sah-Nikhil

Decided in the charting chat: **live discovery from Vendors' own websites is in v1.** When a Member asks, the Assistant searches, opens Vendors' own sites and saves Vendor cards (link, image, Listed price, contact) with the source URL and date seen.

Exact terms checked 2026-10-21, correcting the earlier summary:

- **Gemini Grounding with Google Search** ([terms](https://ai.google.dev/gemini-api/terms)): storing the text of Grounded Results is allowed for up to two years, but you may not "cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results", may not use "programmatic or automated means to collect Links, using Links to build an index", and "will not modify, or intersperse any other content with, the Grounded Results". End users may save individual results shown to them, if not collected by automated means. So a grounded answer can be kept as-is in the Chat, but turning it into structured Vendor cards (extracting price and contact, following its links automatically) is what the terms rule out.
- **Gemini Grounding with Google Maps**: cache up to 90 days only to optimize display, keep in that user's chat history up to six months, no modifying, no scraping or exporting Maps data.
- **Claude web search** ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)): $10 per 1,000 searches; citations must be shown when outputs are displayed directly, and "as appropriate" when reprocessed. No grounded-results-style ban on storing or extracting. It supports `allowed_domains` / `blocked_domains`, and the web fetch tool reads pages found in the conversation. This fits building cards from Vendors' own sites with citations; the Vendor's own site terms still apply.

Still open here: geocoding a Vendor's address into Marker coordinates (public Nominatim's policy rules out app-style geocoding; Google Geocoding results come with Google-map display terms; an OSM-based geocoder that allows storing results is needed), and the card image (the Vendor's own preview image linked back to its site, a category illustration, or a Member upload).
