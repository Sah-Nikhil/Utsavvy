---
id: 1
title: "Map: Utsavvy v1"
labels: [wayfinder:map]
status: open
assignee:
parent:
blocked_by: []
---

## Destination

A build-ready spec for v1 of the Assistant (scope, stack ADRs, data model, Canvas and Chat design, Assistant behavior, data sources), clear enough to build and submit to PromptWars Virtual (code, live preview and a LinkedIn build-in-public post) by about 2026-10-28.

## Notes

- **Challenge statement**: "create a GenAI-powered planning assistant that helps users organize weddings, birthdays, and community events with budgets, timelines, vendor checklists, and personalized ideas."
- **Challenge rules** (PromptWars Virtual 14-day cycle, from the organizer's page as shared on 2026-10-21): any AI tool may be used to build, and using AI to build is the only tooling requirement. Submission is code plus a live preview, and a LinkedIn "Build-in-Public" post, by Day 13. Experts review on Day 14. No Google service is mandated.
- **Shape**: the product is the Assistant. Each Event has a shared Canvas, where the Assistant works, and a Chat. See [ADR 0001](../docs/adr/0001-assistant-works-on-a-shared-canvas.md). Use the vocabulary in [CONTEXT.md](../CONTEXT.md) exactly: Member vs Guest, Listed price vs Estimate vs Quote, Vendor with Venue as a category, and never "pin" or "board".
- **Market**: India first. INR, weddings made of several Functions, city-based Vendors.
- **Collaboration**: v1 has invited Members, live Chat and Canvas updates (item-level, last write wins), Comments, an edit history and presence dots. Live cursors and conflict-free co-editing of one item are a stretch goal.
- **Capture**: v1 has "Add to Canvas" inside the product and the phone share sheet (PWA Web Share Target). A browser extension comes later.
- **Vendors**: discovery only. Markers come from public sources, with Listed prices shown with source and date so Members can compare. No marketplace.
- **Inspirations**: stock search, AI generation and Pinterest references, plus "remix into my theme". The theme feeds the plan.
- **Pace**: solo, about 7 days to submission. Decide fast: spreading tickets over several sessions is fine, deliberating for days is not. When a decision stalls, take the recommendation.
- **Hand-off**: after the map closes, the repo is published from GitHub Desktop and the build plan becomes GitHub Issues (with Discussions for ideas, as t3code does), so several agents can build in parallel worktrees and merge into `main`. The spec must be sliced for that.
- **Planning, not doing**: no override. Tickets produce decisions, not product code. Prototypes are throwaway.
- **Skills**: grilling tickets call `grilling` and `domain-modeling`. Research tickets have no `research` skill installed, so they go to a research subagent (Sol high, per [orchestration.md](../orchestration.md)) that commits its findings to a `research/<slug>` branch. Prototype tickets have no `prototype` skill installed, so use `impeccable` for the UI and keep the prototype on a throwaway `prototype/<slug>` branch.
- **Tracker**: local markdown in `issues/`. See [the issue tracker doc](../docs/agents/issue-tracker.md).
- **Background**: charting research (PromptWars rules by edition, Play with Putty, Google Labs CC, SahayakOS's map, comparable Indian products) is on branch `research/charting-context`, file `research/charting-context.md`. SahayakOS (Next.js, Convex, Clerk, a Leaflet map with filters, Markers and a detail panel) is reusable prior work.

## Decisions so far

<!-- one line per closed ticket: - [<title>](./NNN-slug.md): <one-line gist> -->

- [Which backend gives live Chat and Canvas updates, presence and sign-in for a one-week build?](./004-realtime-backend.md): research recommends Convex + Clerk on Vercel (shared streamed replies built in); Firebase storage needs Blaze; phone share sheet works on Android and desktop, not iOS.
- [Which LLM and agent tooling should the Assistant run on?](./005-llm-and-agent-tooling.md): research recommends `gemini-3.8-flash` on Vercel AI SDK 7 (Convex Agent if Convex wins); grounding and image generation are paid only; one Assistant run per Event at a time.
- [Where can Vendor locations and Listed prices for Indian venues legally come from?](./002-vendor-data-sources.md): Places data can't go on a non-Google map and directories forbid reuse; research recommends ~12-20 hand-curated Jaipur Vendors on an OSM map, Listed prices from Vendors' own sites, Gemini Maps grounding only for live cited answers in the Chat.
- [Which Inspiration sources can we use, and how can Pinterest come in?](./003-inspiration-sources.md): Pexels search, Member uploads and paid Gemini images; Pinterest only as pasted or shared URLs shown with its official widget (no search, no remixing its images); Instagram via tokenless public oEmbed.
- [Which search and geocoding services can power live Vendor discovery?](./015-search-and-geocoding-services.md): Serper to find Vendors' own sites (URLs only), our own polite fetch to read them, Geoapify to geocode stored Markers; all independent of the LLM provider and free at demo volume; card images default to a neutral visual.
- [How do parallel agents take build work from GitHub and merge it back cleanly?](./014-parallel-agent-build-workflow.md): build work in GitHub Issues (phase = parent issue + milestone), ideas in Discussions; contract slice first, then waves of up to 3 worktree agents with orchestrator-owned shared files; `/tdd` + Ponytail; CI typecheck, lint, test, build, preview e2e; orchestrator squash-merges when green and up to date, human approves only the contract PR. See [docs/agents/build-workflow.md](../docs/agents/build-workflow.md).

## Not yet specified

- **Capture from any website**: a browser extension that adds things to an Event's Canvas from any page (Pinterest, Instagram, Vendor sites). Wanted after v1.
- **Live co-editing**: live cursors and two Members editing the same Canvas item at once without conflicts. Stretch goal for the end of the hackathon.
- **Voice**: talking to the Assistant (e.g. Gemini Live), Clicky-style.
- **"Next up" brief**: the Assistant opening a return visit with what is due, what is over budget and which Vendors are unbooked; later possibly by email.
- **Guest list and RSVPs**: whether the Assistant manages Guests (lists, invitations, RSVPs) or only counts them. Not discussed yet.

## Out of scope

- **Vendor marketplace** (Vendor accounts, bookings, payments): the Assistant helps Members discover and compare Vendors; it doesn't transact.
- **WhatsApp or email outreach by the Assistant**: messaging infrastructure doesn't fit the build window.
- **Native app-store apps**: mobile is served by an installable web app (PWA).
- **Markets outside India**: currency and locale stay swappable, but only India is designed for.
