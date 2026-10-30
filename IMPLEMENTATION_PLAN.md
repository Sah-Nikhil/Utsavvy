# Implementation plan: Utsavvy v1

The canonical spec for the build, written by [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18) with Sah-Nikhil on 2026-10-21. It turns the closed planning tickets into what gets built, in what order, on which data model. Amend this file when a decision changes; never contradict it silently.

This file does not repeat behaviour that the design docs already define. It points at them and fixes what they left to the build plan: scope, names, the data model, the final tool list, the slices and the demo. Read it with:

- [CONTEXT.md](CONTEXT.md) for the vocabulary, used exactly.
- [docs/design/first-brief.md](docs/design/first-brief.md) for the Brief, pricing, Timeline and the three worked examples.
- [docs/design/assistant-behavior.md](docs/design/assistant-behavior.md) for replies, Proposals, Nudges, history and outside content.
- [docs/design/vendors.md](docs/design/vendors.md) for Vendors, Listed prices, Quotes and the map.
- [docs/design/inspirations.md](docs/design/inspirations.md) for Inspirations, the Theme and the vibe pick.
- [docs/design/roles.md](docs/design/roles.md) for the four roles.
- [docs/adr/](docs/adr/) for the settled tradeoffs (0001 to 0009, plus 0010 from this ticket, 0011 and 0012 from the 2026-10-21 changes, and 0013 from the 2026-10-22 changes).
- [docs/agents/build-workflow.md](docs/agents/build-workflow.md) for how agents build and merge.
- [docs/plans/build-slices.md](docs/plans/build-slices.md) for every build issue, ready to create.

## 1. Scope

The build runs from 22 to 27 Oct 2026, with up to 3 build agents at a time. That is about 22 slice-units of work, and the MUST tier below fills all of it. There is no slack, so the order of the cut line in 1.5 matters.

**Changed on 2026-10-21, after the issues were created.** Sah-Nikhil made three decisions: stock photos come from a local, hand-curated library instead of the Pexels API ([ADR 0012](docs/adr/0012-stock-photos-from-a-local-hand-curated-library.md)); a Google places sheet built on Google's Places UI Kit is a new MUST slice, S20 ([ADR 0011](docs/adr/0011-google-places-only-through-the-places-ui-kit.md)); and Instagram-only Vendors may fill gaps in the starter set ([vendors.md](docs/design/vendors.md), "The starter set"). Capacity after the change: S13 shrinks from L to M without the API and its cache, D1 grows from S to M (80 photos with local files and tags), and S20 adds an M on 24 Oct. To make room, Sah-Nikhil accepted that the first two cut-line items (1.5) move to SHOULD from the start, which shrinks S6 and S8 from M to S. The slice days stay 22 to 27 Oct and 28 Oct stays the buffer.

**Changed on 2026-10-22.** Sah-Nikhil made two more decisions. First, Estimates are researched live: each budget line's price per unit comes from web search and the Event's Shortlisted Vendors' Listed prices, falls back to the reference table, and as a last resort uses the Assistant's own estimate, always labelled with its basis, while code keeps doing every total ([ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md), sections 3 and 4.14). He also rejected both reference-table adjustments D2 proposed, so the table stays the first-brief seed at version `2026-10-22`. Second, the Vendor map gets Utsavvy's own map style over OpenFreeMap's tiles (section 7.5). Capacity after the change: S3 grows from M to L (the research step, its cache and the fallback order). To make room, the next cut-line item, the previewed Budget check fixes (1.5, item 3), moves to SHOULD as X12, which shrinks S11 from L to M; S11 keeps the flag, "Raise the budget" and "Plan at my budget anyway", and gains only the wait for research. S15 stays M: the style is one module in its own folder. The total is unchanged, but 23 Oct now carries S1, S2, S5 and an L-sized S3, so S3 is the first issue to watch that day. Later the same day he added Google's own map beside the list in the Google places sheet, so it reads like the Places box on a Google Search page ([ADR 0011](docs/adr/0011-google-places-only-through-the-places-ui-kit.md), amended); S20 stays M, since Google's own sample pairs the two, and the setup steps are in [docs/setup/google-cloud.md](docs/setup/google-cloud.md). Then he promoted Pinterest and Instagram References (X2, now L) and the Android share sheet (X8, links only; shared image files split off as X13) to MUST, and added S21, browsing public boards on Utsavvy's own Pinterest account through Pinterest's board widget ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)). No slot exists for them yet: the MUST tier was already full, and he parked where they fit and what moves to SHOULD.

### 1.1 MUST: the v1 demo path

Every item here is built in v1. Slice ids refer to [docs/plans/build-slices.md](docs/plans/build-slices.md).

| Slice | What a Member can do | Size |
|---|---|---|
| C0 | (Contract) Sign in. Every page exists. Schema, shared types, design tokens, role checks, versioned writes, CI and the browser smoke test are in place. | L |
| D1 | (Data) The stock library exists: 288 photos hand-curated from Pexels in 4 sets and 18 categories of 16 (grown from 80 on 2026-10-22), served from our app, 12 per set marked for the vibe pick, approved by Sah-Nikhil. | M |
| D2 | (Data) The 16 hand-checked Jaipur Vendors exist as seed data (own sites first; Instagram-only Vendors only to fill a category gap), and the reference table is checked against their Listed prices (both proposed adjustments rejected on 22 Oct, so the table stays the first-brief seed). | M |
| S1 | Create an Event, share the Member and Viewer links, join by link, see the people list, switch Member and Viewer, remove, block and unblock people, pick the Owner or Host label. | M |
| S2 | Use the freeform Canvas: four starting Sections plus custom ones, Items placed in free space, live positions, presence, selection, the Function filter, and the Assistant's pointing. | L |
| S3 | (Engine) Get Estimates from the estimate cascade (live research, then the reference table by City tier, then the Assistant's own estimate), each labelled with its basis, with the Budget check bands, Contingency, rounding and Timeline dates worked out in code. | L |
| S4 | Work with the Budget, Timeline (including run sheets) and Vendor checklist Items and their Entries, Notes and Suggestions ("Add to plan", "Not for us"). | L |
| S5 | Chat with the Assistant: streamed replies every Member sees, the run queue, Stop, and the per-message "Don't reply" toggle. | L |
| S6 | See the edit history grouped per Assistant reply and Restore any earlier value. (Undo all moved to SHOULD, X11.) | S |
| S7 | Ask the Assistant to change the Canvas: version-checked, idempotent tools, pointing back, the citations card and "Save as Note" for Chat web search (the search itself is S5's since 2026-10-23), outside content handled as data, replies in the asker's language. | L |
| S8 | Comment on Items and Entries, with threads and resolve. (Comments on highlighted passages moved to SHOULD, X10.) | S |
| S9 | See the seeded Jaipur Vendors as cards, shortlist them onto the Canvas, link them to checklist Entries with statuses. | M |
| S10 | Accept or reject Proposals: out of date, 24-hour expiry, replace, all or nothing. | M |
| S11 | Give a first Brief: free text, chip questions, Assumptions, the editable Brief summary and the Budget check with its flag, "Raise the budget" and "Plan at my budget anyway". (The previewed fixes moved to SHOULD, X12.) | M |
| S12 | Record Quotes (form, file, or a pasted WhatsApp message that becomes a Proposal) and compare Estimate, Listed price and Quote side by side. | M |
| S13 | Add Inspirations from the stock library (panel and Chat strip) and uploads, use one for the Theme, and get Theme-driven decor Suggestions. | M |
| S14 | Tap "Make my plan" and watch the first plan stream onto the Canvas; change an essential later through a Proposal. | L |
| S15 | See Vendors on the map, drawn in Utsavvy's own map style, filter them, and drag an approximate Marker into place. | M |
| S16 | Use Compact mode on desktop and the Chat-first phone layout with a Canvas tab. | M |
| S17 | Get the three Nudges, and ask @Utsavvy from inside a Comment thread. | M |
| S18 | Do the vibe pick during the Brief. | S |
| S19a | Open the seeded demo Event with a judge account, and have it reset nightly or on demand. | S |
| S19b | Walk the whole demo script on the seeded Event in a browser test, and rehearse it on production. | S |
| S20 | Browse Google places in a full-screen sheet built on Google's Places UI Kit, with Google's own map beside the list, save one to the Canvas as a Google place (place ID and own note only), and reopen it in the sheet or in Google Maps. | M |
| X2 | (MUST since 2026-10-22, lane 4 from 23 Oct) Paste a Pinterest Pin or board link, or an Instagram post or Reel link, and keep it as a Reference shown through the platform's official embed. | L |
| S21 | (MUST since 2026-10-22, lane 4 from 23 Oct) Browse the public boards on Utsavvy's Pinterest account for the Event's Functions through Pinterest's board widget, and bring a Pin back by its link. | M |
| X8 | (MUST since 2026-10-22, lane 4 from 23 Oct) On Android, share a Pin, board, post or Reel from the Pinterest or Instagram app into Utsavvy as a Reference. | M |

Sizes: S is about half a slice, M one slice, L about one and a half.

### 1.2 Folded in

Sah-Nikhil chose to fold four small extras into the MUST slices they belong to:

- Nudges, in S17.
- The WhatsApp Quote paste, in S12.
- Chat web search, in S5 (moved from S7 on 2026-10-23); its citations card and "Save as Note" in S7.
- @Utsavvy in Comments, in S17.

### 1.3 Stretch: later stage and SHOULD, in build order

Sah-Nikhil filed live Discovery and Event keys for a later stage, and the smaller extras are SHOULD. All of them are drafted as `stretch` issues, built only if a slot frees up. With the MUST tier filling every day, expect them after v1. Sah-Nikhil picked Discovery to go first.

1. **Live Discovery** (later stage; 2 slices, X1a and X1b): Serper search, the polite fetch with its SSRF guard, the own-site check, quote-checked extraction, Geoapify geocoding, Vendor cards streaming into the Chat, the 10-a-day cap, "Paste a website URL", the refresh button, and automatic pooling of Listed prices into the reference table. (The flagged AI Estimate for free-label categories is gone: since ADR 0013, a free-label line goes through the same estimate cascade as any other.)
2. *Pinterest and Instagram References (X2) and the Android share sheet (X8) moved to MUST on 2026-10-22, with S21 ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)).*
3. **Event keys with Generate and Remix** (later stage; 2 slices, X3a and X3b), including the second seeded Event (Aarav's 6th birthday) carrying Sah-Nikhil's Google key from a Convex environment variable, while the wedding demo Event stays on `claude-sonnet-5-5`.
4. **The rest of SHOULD**: the sticky "Keep Don't reply on" setting and the Member-mention rule (X4), email invites (X5), ownership transfer, deleting an Event and Owner succession (X6), hand-typed Vendors (X7), the other 9 vibe pick sets (X9), the two cut-line items moved on 2026-10-21: Comments on highlighted passages (X10) and grouped "Undo all" (X11), and the one moved on 2026-10-22: the previewed Budget check fixes (X12), and shared image files from the share sheet (X13, split from X8 on 2026-10-22).

### 1.4 After v1

Already parked in the [Ideas discussions](https://github.com/Sah-Nikhil/Utsavvy/discussions/categories/ideas): capture from any website, live co-editing, voice, the "Next up" brief, Guest lists and RSVPs, Event keys with any model name, Chat web search on Gemini and OpenAI Event keys, opt-in pooling of Quotes, Remix variants in one Inspiration, emailed invites, a public read-only link, and (added 2026-10-22) [a native mobile app beside the mobile website](https://github.com/Sah-Nikhil/Utsavvy/discussions/70).

### 1.5 Cut line

If a build day slips, these sub-features move to SHOULD first, in this order. None of them is in the demo script.

1. Comments on highlighted passages (Comments on Items and Entries stay), from S8. **Moved to SHOULD on 2026-10-21** (X10), to make room for S20.
2. Grouped "Undo all" (per-change Restore stays), from S6. **Moved to SHOULD on 2026-10-21** (X11), to make room for S20. **Built back on 2026-10-26** (X11, #68): `api.history.undoGroup` and the Undo all button under each Assistant reply and on each history group.
3. The three previewed fixes in the Budget check (the flag, "raise the budget" and "Plan at my budget anyway" stay), from S11. **Moved to SHOULD on 2026-10-22** (X12), to make room for the estimate cascade in S3. **Built back on 2026-10-26** (X12, #69): `budgetCheckFixes` in `lib/pricing/budgetCheckFixes.ts`.
4. Presence avatars on Items (the header dots stay), from S2.
5. The Function filter, from S2.
6. Compact mode's "by Function" grouping ("by kind" stays), from S16.

## 2. What the cut changes in the design docs

These are consequences of the scope above, not new decisions. Short "Amended by" notes in the design docs point here.

- **Vendors come only from the starter set in v1.** "Find Vendors" on a checklist Entry, and asking in the Chat, show matching shared Vendors (the 16 in Jaipur). In any other city the Assistant says it has no Vendors there yet and offers Chat web search. Vendors added by URL and hand-typed Vendors arrive with X1 and X7.
- **The starter set is collected without the Discovery pipeline.** [vendors.md](docs/design/vendors.md) planned to collect it by running Discovery. Since Discovery is later, the D2 agent finds each Vendor's own site, reads it under the same polite fetch rules (our User-Agent, `robots.txt`, one request a second per host, at most 4 pages per site) and the same SSRF guard, timeout, size and redirect limits as Discovery (section 4.9), through the shared `politeFetch` helper D2 builds in `lib/fetch/`, and records every fact with the exact sentence and page it came from. A script checks that each sentence is on the page and that each price's amount and currency are in its sentence. Sah-Nikhil then checks every card by hand.
- **No Generate tab in v1.** With no way to attach an Event key, the greyed-out Generate tab and the "Remix this" and "Make one like this" buttons from [inspirations.md](docs/design/inspirations.md) would point at a setting that doesn't exist yet, so they are not shown until X3.
- **References are in v1 since 2026-10-22** ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)). The Add Inspiration panel has Search, Upload and Paste a link, plus "Browse ideas on Pinterest" (S21); Generate waits for X3.
- **The vibe pick ships 4 curated sets** (North Indian Hindu wedding, general wedding, child birthday, Ganesh utsav), 12 photos each from the stock library. Every other wedding Tradition shows the general wedding set. Adult and parent or grandparent birthdays, Durga puja and other community events have no curated set, so their vibe pick is skipped with one line. "Show me more" shows the set's other photos that aren't tagged `branded` (licensed characters), 12 at a time. There is no live stock search anywhere ([ADR 0012](docs/adr/0012-stock-photos-from-a-local-hand-curated-library.md)). The pick makes no model call (amended 2026-10-24, PR #112): its colours and decor keywords come from the photos' curated palettes and tags, its style words from a short map of the curators' look tags, and it only fills the Theme's free places ([first-brief.md](docs/design/first-brief.md) "Vibe pick").
- **No Remix from a screenshot of a Reference** (inspirations.md rule 14, corrected 2026-10-21). This first matters with X3b.
- **Google places are the way to look beyond the starter set in v1** (S20). They stay Google's: the Canvas keeps only the place ID and the Member's note, and nothing from them reaches a Vendor, a Marker, the Chat or the Assistant ([ADR 0011](docs/adr/0011-google-places-only-through-the-places-ui-kit.md)).
- **The model label** always shows `claude-sonnet-5-5` (or the fallback setting) until Event keys exist.
- **The Budget check offers two ways forward in v1**: "Raise the budget" (to the minimum) and "Plan at my budget anyway". The fewer-Guests and fewer-Functions fixes with their previewed minimums are X12. Built back on 2026-10-26 (X12, #69): before the plan, a budget below the minimum also gets "Plan for N Guests instead of M" and "Skip the <Function>", each previewing its new minimum and saying whether it fits. The previews are priced in the Brief summary's query from the cached or reference-table ranges, so they spend no search and no model call. Fewer Guests lowers the Brief's own Guest count in round steps, down by about a third, to the nearest round step. Every assumed Function count and the invitation cards follow it, as an edit to the Brief does, so the worked examples' fewer-Guests figures change (first-brief.md, amended the same day). Skipping never removes the Event's own Function, a Ganesh utsav's sthapana, daily aarti or visarjan, or the last Function; for a wedding whose Functions are all ones Utsavvy doesn't know, the largest of them stays. Merging Functions is not built. **Known gap:** a preview line with no cached research is priced from the table, while the Budget check after the tap may research it and land elsewhere. When the stored check researched any line, such a preview says "which should fit" or "which should leave about ₹X short" instead of a firm answer.

## 3. Conflicts between the design docs, resolved

1. **Who writes amounts.** [first-brief.md](docs/design/first-brief.md) said the LLM never writes an amount, and [vendors.md](docs/design/vendors.md) made one knowing exception. [ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) (2026-10-22) replaces both with the estimate cascade. The full rule for the build: an amount on the Canvas comes from exactly one of these places.
   - The estimate cascade (section 4.14): every Estimate in a plan, a Suggestion, a Theme-driven Suggestion, an `addEntry` with an estimate source, and a Vendor card. The model's only numbers are a low and high price per unit for one line, from research or its own knowledge, each labelled with its basis; the reference table fills in when research finds nothing. Code does every multiplication, total, the Contingency, rounding and the Budget check.
   - A number a Member typed in their own request ("add a mehendi artist, around ₹15,000"). The server checks that the number appears in the requesting Member's message; otherwise the write is refused.
   - A number from outside content, such as a pasted WhatsApp Quote. It always arrives as a Proposal.
   - Inside a Proposal (S10's `propose`), a budget amount comes from one of three sources: the asking Member's own stated amount (checked as above), the low end of a line's Estimate, used only to lower the line and kept as an Estimate, or the rupees freed by other changes in the same Proposal, each change's freed rupees claimed by one line at most, so a Proposal only moves money. A new quantity moves an Estimate line at its price per unit (code arithmetic, so a lower quantity frees rupees too), freed rupees land on the receiving line as a fixed amount, so neither an Estimate cut nor freed rupees can share a change with a new quantity on an Estimate line, a change that leaves a line as it is is refused, and one helper works out a line's new amount for the card, for Accept and for the freed rupees, so the card shows the rupees Accept writes. Decided 2026-10-24, review of PR #105 (three rounds).
   - A Listed price, quote-checked against the Vendor's own page (seed data in v1; Discovery later).
   - The old free-label exception (an Estimate "not from our cost table" with its own `GeneratedEstimate` type) is folded into the cascade: a free-label line has no table row, so it is researched or the Assistant's own estimate. `GeneratedEstimate` and `generatedEstimates` are dropped.
2. **Chat lookups.** [first-brief.md](docs/design/first-brief.md) answers price questions through Gemini grounding. [vendors.md](docs/design/vendors.md) replaced that with Claude's web search tool, used only when the Event runs on Claude. The build follows vendors.md: answers are cited, stay in the Chat, can be saved as a Note with their citations, and are never stored as Listed prices or used to change Estimates already on the Canvas. The estimate cascade runs its own searches (section 4.14). Gemini and OpenAI search is an Idea ([discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/22)).
3. **The reference table.** [first-brief.md](docs/design/first-brief.md) treats it as fixed; [vendors.md](docs/design/vendors.md) adds guarded automatic pooling of Listed prices; ADR 0013 makes it the cascade's fallback. In v1 the table is a code module, hand-checked in D2 against the starter set's Listed prices and cited in its Source column. On 22 Oct Sah-Nikhil rejected both adjustments D2 proposed, so the table is the first-brief seed, frozen at version `2026-10-22`. S3 builds on it from 23 Oct, and nothing changes it during v1. Automatic pooling needs Listed prices from many Vendors, which only Discovery produces, so it ships with X1 behind the guardrails in vendors.md. Tests always pin the table with research stubbed to return nothing and pooling off.
4. **A pasted Quote is a Proposal.** vendors.md says the Member confirms before a pasted Quote is saved; assistant-behavior.md says numbers read from outside content arrive as a Proposal. They agree: the Quote form filled from a paste is a Proposal card with Accept and Reject.
5. **Fictional content in a public demo.** The demo Event's people, Quotes and Comments are made up, but its Vendors are real Jaipur businesses. So the demo Event shows a banner: "Demo Event: the people, Quotes and Comments here are made up. Vendor facts come from each Vendor's own website, or for a few, its public Instagram profile, checked by hand."

## 4. Architecture

### 4.1 Overview

- **Next.js 16.4 (App Router) on Vercel Hobby** serves the UI. Pages are thin; almost all data comes from Convex through live `useQuery` queries, so every Member sees changes as they happen.
- **Convex** holds every table, runs every mutation, stores files, keeps presence (`@convex-dev/presence`) and hosts the Assistant through the Convex Agent component (`@convex-dev/agent`). Each Event has one Agent thread, so a streamed reply is saved once and every Member, including one who reconnects, sees the same stream.
- **Clerk** signs people in (Google, and email + password) on development keys. `ConvexProviderWithClerk` passes the Clerk token to Convex. Clerk's middleware lives in `proxy.ts`, the Next.js 16 name for middleware. A `users` row is upserted from the Clerk identity on the first authenticated call; there is no webhook in v1. The Clerk application is the Consumer type with Organizations off (decided 2026-10-22): who is in an Event, and with which role, lives only in our own `memberships` table (roles.md), so Clerk never holds Event membership.
- **AI SDK 7** inside Convex actions calls the models through `@ai-sdk/anthropic` (default) and `@ai-sdk/google` (fallback). Model names are settings in `convex/lib/models.ts`, read from Convex environment variables.

### 4.2 Routes

| Route | Page | Slice |
|---|---|---|
| `/` | Landing: what Utsavvy is, sign in, "Open the demo Event" for judge accounts | S1 |
| `/sign-in`, `/sign-up` | Clerk | C0 |
| `/events` | The person's Events, newest first, and "New Event" | S1 |
| `/events/[eventId]` | The workspace: Canvas beside Chat on desktop, Chat with a Canvas tab on phones | C0 shell, S16 responsive |
| `/join/[token]` | Invite link: sign in, then join with the link's role, or the full, removed or already-in messages from roles.md | S1 |
| `/settings` | Personal settings (mobile pointing default; the sticky Don't reply setting arrives with X4) | S16 |
| `/terms` | Terms and privacy: what each outside service receives (section 4.15) | S1 |

The people list, history, Event settings, Add Inspiration and the Google places sheet open as panels or sheets inside the workspace, not as separate routes.

### 4.3 Access checks

- `lib/access/permissions.ts` (contract) holds the permissions table from [roles.md](docs/design/roles.md) as data: one action name per row, with the roles allowed. It is pure TypeScript, shared by Convex and the UI.
- `convex/lib/access.ts` (contract) exposes `requireAccess(ctx, eventId, action)`, which loads the caller's membership, refuses anyone not active (left, removed or blocked) and checks the action against the table. Every Event-scoped query, mutation, action and Assistant tool calls it first. Hiding a button is never the only protection.
- **Four narrow exceptions** run before the caller has a membership, or after it has ended. Each calls `requireIdentity(ctx)` (contract, same file), which refuses anyone not signed in and returns their `users` row, and touches nothing beyond what is listed:
  - `api.events.create` creates the Event and the caller's Owner membership in the same mutation.
  - `api.events.listMine` reads only the caller's own memberships (`by_user`) and the Events they are active in.
  - `api.people.join({ token })` looks the token up by its index, refuses a reset token, a blocked person and a full Event (25 people, pending email invites included), keeps the role of someone already active, and otherwise creates or reactivates the membership. It returns only the Event ID and role.
  - Finding and removing one's own Event key after leaving or removal (X3a): `api.eventKeys.listMineRevocable()` returns, for each key the caller attached (`by_attacher`) in an Event where their membership is `"left"` or `"removed"`, only the Event ID, the Event name and the key's model; `api.eventKeys.removeMine({ eventId })` checks that the caller attached that key and does nothing else.

  Every other read or write of Event data goes through `requireAccess`.
- The Assistant acts with the abilities of the Member it is answering. Because Viewers can't ask, a run never starts on a Viewer's behalf, and a Viewer's Comment never starts one, @Utsavvy or not.
- **When the asker loses access mid-reply** (removed, or switched to Viewer), the reply's text finishes streaming and ends with a short notice ("Rohan no longer has access to this Event, so I stopped changing it."). From the moment of removal every Assistant tool call in that run, read or write, is refused by `requireAccess`, so nothing more is read or written for them. Their queued runs are cancelled in the same mutation that removes them.

### 4.4 Writes, versions and history

All writes go through `convex/lib/write.ts` (contract):

- `memberWrite(ctx, {table, id, patch, actor})`: last write wins. It bumps the document's `version`, writes the change to `changes` with before and after values, and returns the new version.
- `assistantWrite(ctx, {table, id, expectedVersion, patch, runId, toolCallId, forMembershipId})`: refused with `VersionConflict` (returning the current value and version) when `expectedVersion` doesn't match. It is idempotent: the key `runId:toolCallId` is stored in `toolCalls` with its result, and a repeat returns the stored result without writing again.
- Inserts and soft deletes (`deletedAt`) go through the same two helpers, so Restore can bring back a deleted Item, Entry or Section.
- Every change row records who acted ("Utsavvy for Meera", or "Utsavvy for Rohan, accepted by Aditi"), the run or Proposal it belongs to, and whether the request came from a Comment. S6 builds the history panel and Restore on top of these rows; X11 adds Undo all. Undo all (decided 2026-10-26, X11) puts back a group's changes newest first with Restore's own rules, deletes again (softly) the Items, Entries and empty custom Sections the group added, skips any row someone outside the group edited since, and sets `undoneBy` on each change it undid, so a second tap does nothing. Its writes go through `memberWrite` and `memberSoftDelete` as the pressing Member, so the post-write hooks run, and form their own history group per tap, `undo:<tap>:<groupKey>` ("Meera: Undo all of Plan the sangeet"); Undo all on that group (shown as "Redo") redoes the reply and makes it undoable again, and a per-change Restore of one of its rows joins the same chain as a one-row redo, so the reply's next Undo all takes that row back again without naming the Member who restored it (their Restore stays visible as its own "Redo" group in the history). A change someone already put back by hand counts as undone, and the result names who did it ("Rohan had already put back Sangeet DJ"); restoring that hand-made Restore, or redoing over it, reopens the change. A Restore never tags an Item or Entry to a Function skipped since (X12 deletes its row): it comes back Event-wide instead. A custom Section the group added that still holds someone else's Items stays ("Favours still holds Items, so it stays"), and when nothing else is left the button settles until the Section is emptied. Changes Undo all can never undo (a shared Vendor, a Function, the plan's Budget, Timeline and Vendor checklist Items, Contingency and Unallocated lines) are named in the result and don't keep the button live. Comment threads on an Item Undo all deletes again are hidden with it and come back when the Item is Restored, as with any delete. One tap reads at most about 8,000 documents; past that it stops, keeps what it undid, and asks for another tap. An accepted Proposal's group is undone like a reply's, by any Member, as Restore allows. A write to a shared `vendors` row (a Marker drag) puts its change row in the Event of the acting membership.
- **Post-write hooks.** After writing the change row, every helper calls each hook in `convex/lib/hooks.ts` (contract) inside the same mutation, with a `WriteEvent` (`eventId`, `table`, `docId`, `op`, `before`, `after`, `actor`). The contract registers two hooks, each imported from a stub that its slice fills in its own file: `passagesAfterWrite` in `convex/comments.ts` (S8; marks Comment passages "text changed") and `nudgesAfterWrite` in `convex/nudges.ts` (S17; schedules the Nudge check). Because the hooks sit in the helpers, every writer (S4, S6, S7, S10, S12, S13, S14) triggers them without calling them.
- **Two exceptions.** `viewPrefs` (section 5.1) is personal view state, not Canvas content, so it is written directly and leaves no history. The demo reset (S19a) writes its seed rows, including the seeded `changes` rows, with `seedInsert` in `convex/demo.ts`: plain `ctx.db.insert` calls that write no extra history and run no post-write hooks, so a reset posts no Nudge and marks no passage. `seedInsert` is a plain function, not a Convex function, called only from `internal.demo.reset`, and it refuses any row whose `eventId` isn't the Event found by the demo's `demoKey`.

### 4.5 The Assistant at runtime

- **One run at a time per Event.** A Member's message to the Assistant inserts a `runs` row as `queued`. `convex/runs.ts` starts the oldest queued run when none is running, through the scheduler. The sender can cancel a queued run. The first plan's run (`source: "brief"`) waits in the same queue, and `startNext` starts its pipeline (`internal.plan.generate`) instead of a reply (S14, review of PR #114).
- **Stop.** The asker can stop a run at once; any Member can after 30 seconds. Stop sets the run to `stopping`; the streaming loop checks that flag between chunks and tool steps and ends the run as `stopped`. Changes already made stay, and the next queued run starts.
- **Context.** Each run reads the Canvas fresh through `readCanvas`. Recent Chat, including Don't-reply messages, is in context with each author's name. Pointed-at Items, Entries and passages come with the message.
- **Outside content** (Vendor pages, pasted text, image text, image descriptions, Chat history, and the search results Estimate research reads) goes to the model wrapped in a labelled block with its source and who added it, never as instructions. The system prompt says so, and when such content contains instructions aimed at the Assistant, it ignores them and adds "That page contained instructions aimed at me; I ignored them."
- **Language.** The reply follows the language and script of the message it answers. Canvas content the Assistant writes stays in English, keeping Indian terms as they are.
- **Chat web search** uses Anthropic's provider-executed web search tool through `@ai-sdk/anthropic`, at most 3 searches per reply, only when the run's model is Claude. Citations always show.
- **Model failure.** Gemini is an automatic fallback (decided by Sah-Nikhil on 2026-10-22, [ADR 0003](docs/adr/0003-assistant-runs-on-claude-sonnet.md), contract change [#75](https://github.com/Sah-Nikhil/Utsavvy/issues/75)). `modelChain` in `convex/lib/models.ts` lists the models to try in order: the Event key's model if any (ADR 0004), then `DEFAULT_MODEL` or `HELPER_MODEL` (Claude), then `FALLBACK_MODEL` (`gemini-3.8-flash`), skipping any whose provider key isn't set. A call moves to the next model on an authentication, credit, rate-limit, timeout or outage error raised before any output; bad requests and validation errors don't fall back. A streamed reply that fails after its first token isn't retried. The Chat header shows the model that answered. On Gemini, Chat web search and Estimate research are off, so Estimates come from the reference table or the model's own estimate (section 4.14), and Estimate research goes straight to the table when Claude isn't configured. Gemini may be on its free tier; the terms page discloses that (section 4.15). `DEFAULT_MODEL` can still be changed to switch the default outright, without a deploy.
- **Costs.** The default model runs on the Anthropic API key funded by the developer's monthly API credits ([ADR 0003](docs/adr/0003-assistant-runs-on-claude-sonnet.md)); requests stop rather than overspend when they run out. Estimate research adds up to 8 web searches per Brief or plan ($10 per 1,000 searches, so about $0.08) plus the tokens of the search results the model reads; the cache cuts both on repeat Briefs in the same city. The scripted cases record the real cost and time per plan.

### 4.6 The first plan

The plan is not a tool call. It is a fixed pipeline in `convex/brief.ts` (S11) and `convex/plan.ts` (S14):

1. The Member's free text goes to the model with structured output for `BriefExtraction` ([first-brief.md](docs/design/first-brief.md)). Unknown fields are `null`.
2. Code, not the model, decides which chip question comes next from the missing fields, in the first-brief order. The community festival dates come from a small dated table (`lib/brief/festivalDates.ts`, sourced from Drik Panchang), not from the model's memory.
3. The Brief summary is built by code from the extraction and the Assumptions, with the Budget check from S3 over the estimate cascade's ranges for the Brief's lines (section 4.14). The research runs here, so the Chat shows "Checking current prices in Pune" until the summary arrives, and the cache keeps those ranges for the plan.
4. "Make my plan" asks the model for a `FirstPlanDraft` (structured output, no amounts). The server validates it, prices it with S3 (the cascade, mostly from the cache the Brief summary filled, then the arithmetic), computes every deadline date from its `leadKey`, and applies it through the same writes Members use, one Section at a time, so the Canvas fills while the Chat shows progress.
5. Changing an essential after the plan (date, city, Guest count, budget) re-runs the cascade and the arithmetic on the changed Brief and sends the difference as one Proposal. Entries a Member edited or got Quotes for are left as they are. The server enforces this in `api.brief.editField` (S11): while `briefState` is `"intake"` or `"summary"` an edit applies directly; once it is `"planning"` or `"planned"`, an edit to an essential doesn't touch the stored Brief and instead calls `proposeEssentialChange(ctx, eventId, change)` from `convex/plan.ts` (a contract stub that refuses until S14 fills it). S14 fills it to schedule an internal action, because research can't run inside a mutation; the action posts one version-checked Proposal. Other fields still apply directly.
   Decided by Sah-Nikhil on 2026-10-25 (review of PR #114): Accepting a city change re-prices the plan on the server as part of that Accept: the estimate cascade runs for the new city straight after it, and `pricePlan` (Contingency and Unallocated included) writes the new Estimates and tier labels in the same history group, instead of one Proposal change per line, so S10's 20-change limit stays. Lines a Member set or got a Quote for, and Quotes and Listed prices themselves, are left as they are; a budget change re-runs the same arithmetic over the stored ranges.
   Follow-ups from the second review of PR #114, built in #102 on 2026-10-26: (a) a budget or city Proposal's card says up front when Accept would put the plan below the usual minimum ("the ₹20L budget would be below the usual minimum of ₹23,70,500 for Mumbai"), from the same `repriceBudget` Budget check the plan holds after Accept. For a city change the cascade runs once, when the Proposal is made: the new city's prices are stored with the Proposal (a `toolCalls` row keyed `<proposalId>:city:prices`, no schema change) and Accept applies exactly those, so the card and the Budget agree and research is spent once (review of #118, M1); only a Proposal without stored prices looks them up at Accept. (b) A city Proposal guards only the Event's version, not every budget line: its re-price reads the lines afresh after Accept and keeps any that moved since the prices were looked up. A budget Proposal still guards every line it re-prices, because its card quotes their amounts. (c) If the city re-price fails, the notice carries the Proposal and offers Try again (`api.plan.retryCityReprice`, Members only, refused like Accept once the Member who asked has left or can't edit), which applies the same stored prices as the Proposal was accepted; the step lands once per Proposal, so a double tap or a late retry writes nothing more.
   Decided 2026-10-30 (#102 follow-up, amended after the review of #130): the Budget check (`events.budgetCheck`) and the Budget note are derived state, not history. `recomputeBudget` (`convex/plan.ts`) rewrites both from the plan as it stands: the band from each line's stored per-unit range against the Budget total, the Contingency and Unallocated as the Budget holds them, the note's band and "N lines have no Estimate yet" sentences from that same check (`budgetCheckNote`, `lib/pricing/pricePlan.ts`) and the catering share from the stored lines, so the note and the badge always agree. The check's basis counts only lines priced from a range. Above the high end the note says every Estimate sits at its high end only when every priced line does; with a line a Member set or got a Quote for below it, it says there's room for every Estimate at its high end. It runs after an accepted budget, city, Guest or date change, the new city's prices, a plan that stopped part-way and an accepted `setBudgetTotal`. The post-write hook `budgetAfterWrite` also schedules it, once per mutation, after any write by a Member or the Assistant that moves the Budget total, the city, a budget Entry or the Budget note of a planned Event: an Entry edit, an accepted Proposal, a Restore or an Undo all. Nothing runs while the first plan is being written. With no line priced from a range there is no band: the check is null and the note says the current total isn't checked yet. Accepting `setBudgetTotal` re-prices the plan as an accepted budget change does (above: "a budget change re-runs the same arithmetic over the stored ranges"): lines the Assistant priced move to the plan's position for the new total, lines a Member set or got a Quote for stay, and the Contingency and Unallocated take the rest, all as part of the accepted Proposal, with no research or model call. Undo all of such an Accept also takes back an Unallocated row it added, so the Budget again adds up to the restored total (#132, 2026-10-30); a Contingency line it added stays, as before.

### 4.7 Scheduled work

| Job | How | Slice |
|---|---|---|
| Start the next queued run | `ctx.scheduler.runAfter(0, ...)` when a run ends or is queued | S5 |
| Expire a Proposal 24 hours after it was posted | `ctx.scheduler.runAt` when the Proposal is created | S10 |
| Due-soon Nudge sweep | Daily cron, 08:00 IST | S17 |
| Purge stored files 30 days after their Inspiration was deleted | Daily cron, 03:30 IST | S13 |
| Reset the demo Event | Daily cron, 03:00 IST, plus `bunx convex run demo:reset` | S19a |

`convex/crons.ts` is created by the contract with all three crons pointing at internal functions that start as no-op stubs in the owning slices' files.

### 4.8 Files

Uploads (images up to 10 MB, shrunk in the browser to 2048 px on the long side) and Quote attachments (image or PDF) go to Convex file storage. A query never returns a storage URL to someone without `requireAccess` on the Event. Every stored file is created by the feature that owns it, never attached afterwards by a storage ID a client sends: no public function takes a storage ID (a convex-test checks every module). An Inspiration upload sends the shrunk photo's bytes to `inspirations.addUpload`, which checks access, the rights tick, size and type before storing anything, stores the file itself and claims it in `uploadClaims` with its Item; if saving the Item fails, it deletes the file again. Only the claiming Item's purge deletes a claimed file. Quote attachments and generated images (X3b) follow the same rule: their own function stores the file and records its owner in the same flow (second review of PR #107, 2026-10-24; fixed in #102, 2026-10-25, replacing the earlier 15-minute freshness rule for upload URLs).

### 4.9 Later stage: Discovery pipeline (X1)

Runs in a Node action (`"use node"`), only on a Member's request. Serper organic search (URLs only, 7-day cache) → blocklist and one URL per domain → `robots.txt` (`robots-parser`) → polite fetch (User-Agent `UtsavvyBot/1.0 (+https://<app>/bot)`, about 8 s and 2 MB per page, at most 3 redirects, `http` and `https` on default ports, one request a second per host) → own-site check by the helper model → JSON-LD first, then helper-model extraction with the exact sentence per field → the quote check in code → Geoapify geocoding → save the shared Vendor and stream its card. The SSRF guard resolves the host before every request and every redirect hop, refuses loopback, private, link-local, CGNAT and cloud-metadata ranges, connects to the resolved address, and never follows a redirect it hasn't checked. All of this is D2's `politeFetch` helper in `lib/fetch/`, built for the starter set and reused here. Jina Reader is a fallback for JavaScript-only pages under the same rules. The whole run stops at 30 seconds.

### 4.10 Later stage: Event keys (X3a)

AES-256-GCM with Node's `crypto` in a Node action, a random 12-byte IV per key, and the 32-byte secret in the Convex environment variable `EVENT_KEY_SECRET`. The ciphertext, IV and auth tag are stored; no query returns them. The key is decrypted only inside the action that calls the model and never appears in logs, errors, Chat messages or tool results. Saving makes one small test call. Model lists per provider are fixed in `convex/lib/models.ts`.

### 4.11 Environment variables

`.env.example` (contract) lists every variable. Values live in `.env.local`, the Convex dashboard and the Vercel dashboard, never in the repo.

| Variable | Where | Used for |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | Next.js | Convex client |
| `CONVEX_DEPLOY_KEY` | Vercel (production and preview keys) | `bunx convex deploy` in the Vercel build |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Next.js | Clerk |
| `CLERK_FRONTEND_API_URL` | Convex | Verifying Clerk tokens: `convex/auth.config.ts` uses it as the provider `domain` with `applicationID: "convex"`, per [Clerk's Convex guide](https://clerk.com/docs/guides/development/integrations/databases/convex). Set with `bunx convex env set`, not in `.env.local` (set 2026-10-22) |
| `ANTHROPIC_API_KEY` | Convex | Default model, helper model, Chat web search and Estimate research. Held back until the build is done (decided by Sah-Nikhil on 2026-10-23, to save credits): until then production and development answer on the Gemini fallback, because the model chain skips Claude when this key is missing, so Chat web search is not offered and every Estimate comes from the reference table. It goes on Convex production on Tue 27 Oct, before the scripted Assistant cases, the live research eval (#80) and the production deploy |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Convex | Fallback model, and the only real model on production and development until `ANTHROPIC_API_KEY` goes in. With neither key set, the Assistant can't answer |
| `DEFAULT_MODEL`, `HELPER_MODEL`, `FALLBACK_MODEL` | Convex | Optional; default to `claude-sonnet-5-5`, `claude-haiku-5-5` and `gemini-3.8-flash`. The fallback runs by itself when Claude can't answer (section 4.5). On Convex **preview** deployments `DEFAULT_MODEL` is `stub-utsavvy` (a project default for previews, set 2026-10-23), so each PR's browser test gets the same canned replies and previews never call a real model. Every model caller honours it, because the stub lives in `convex/lib/models.ts` with the chain (#87): `modelChain` returns the stub for every kind of call, with or without keys, and `languageModel` builds it, so the Chat, helper jobs and S3's own-knowledge Estimate all answer from it. Structured output gets a canned object registered by the output's name or a phrase in the prompt (`registerStubObject`), otherwise the schema's emptiest valid object. Estimate research stays off (`claudeReachable` is false on the stub). The stub is never active unless `DEFAULT_MODEL` starts with `stub-utsavvy`. `stub-utsavvy-fallback` makes the fake Claude fail so the fallback label shows |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Next.js (browser) | The Google places sheet (S20). A browser key restricted by website to the production URL, `localhost:3000` and S20's branch preview (Google allows no wildcard mid-hostname, and `*.vercel.app` would trust every Vercel site), and by API to Maps JavaScript (plus the Places UI Kit entry if the console lists one); daily caps of 300 map loads and 300 Places UI Kit queries where the console offers them keep it inside the free tier. The Cloud project needs a billing account even at $0. Steps: [docs/setup/google-cloud.md](docs/setup/google-cloud.md). |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Next.js (browser) | The Map ID for Google's map in the sheet, which its result markers (Advanced Markers) need. Not secret. |
| `GEOAPIFY_API_KEY` | Convex (and D2's script) | Geocoding an Event's city, and the starter set |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Next.js | Optional, empty by default: the map then uses Utsavvy's own style over OpenFreeMap's tiles (section 7.5). A style URL here (for example `https://tiles.openfreemap.org/styles/liberty`) replaces it, so the basemap can still be swapped with one setting ([ADR 0005](docs/adr/0005-maplibre-with-openfreemap.md)). |
| `NEXT_PUBLIC_REPORT_EMAIL` | Next.js | The "Report content" address in the footer |
| `DEMO_JUDGE_OWNER_ID`, `DEMO_JUDGE_MEMBER_ID`, `DEMO_JUDGE_VIEWER_ID` | Convex | Clerk user IDs the demo reset gives their roles |
| `E2E_CLERK_USER_EMAIL`, `PLAYWRIGHT_BASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET` | CI | The browser test. It signs in with a Clerk sign-in ticket made with `CLERK_SECRET_KEY`, because a password sign-in from a fresh CI browser meets Clerk's new-device email check, so it needs no password. |
| Later: `SERPER_API_KEY`, `EVENT_KEY_SECRET`, `DEMO_GOOGLE_EVENT_KEY` | Convex | X1 and X3 |

### 4.12 Content Security Policy

The contract sets one enforcing `Content-Security-Policy` header for every route in `next.config.ts`, built from a single list so a later source is a one-line contract change. It allows `'self'`, the inline scripts Next.js needs (`'unsafe-inline'`; nonces are out of scope for v1), Clerk (the hosts in [Clerk's CSP guide](https://clerk.com/docs/security/clerk-csp)), Convex (`https://*.convex.cloud` and `wss://*.convex.cloud`), OpenFreeMap tiles and label fonts (`https://tiles.openfreemap.org`) and MapLibre's `blob:` workers, Vercel's preview toolbar on previews, and the allowlist in [Google's Maps JavaScript CSP guide](https://developers.google.com/maps/documentation/javascript/content-security-policy) for the Google places sheet, including the map's tiles and images. The site sends no `Referrer-Policy` stricter than the browser default (`strict-origin-when-cross-origin`), because the Google key is restricted by website and Google must see our origin. Stock library photos are served from our own origin, so images need no stock host. The contract's smoke test runs with the policy on; S20's spike confirms the Google entries in a deployed preview and reports any missing one to the orchestrator. Pinterest's and Instagram's hosts are allowed only on the `/embed/*` routes, through a second policy built from the same list ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)): `script-src` adds `https://assets.pinterest.com`, `https://widgets.pinterest.com` and `https://www.instagram.com`; `img-src` adds `https://i.pinimg.com`, `https://s.pinimg.com`, `https://log.pinterest.com` and `data:`; `media-src` adds `https://v1.pinimg.com`; `frame-src` adds `https://www.instagram.com`; `style-src` keeps `'unsafe-inline'`; and `frame-ancestors 'self'`. The main policy adds `frame-src 'self'` for the embed iframes. X2's deployed check confirms the hosts. Meta's oEmbed call is made by the server, so it needs no browser entry. `/embed/pinterest` also sends a CSP `sandbox` (the card iframe's own flags), and Clerk's proxy skips both embed pages (#82). The Instagram card keeps `allow-same-origin`, so Meta's `embed.js` runs with the app's origin; Sah-Nikhil accepted that trust for v1 on 2026-10-23, with Utsavvy building the placeholder itself instead of rendering Meta's HTML (ADR 0014).

### 4.13 Packages

The contract installs these once, at the versions current on 2026-10-21 (npm registry), plus the UI packages in section 7. Later packages are added by contract-change PRs.

- App: `next@16.4.2`, `react@19.3.1`, `react-dom@19.3.1`, `convex@1.47.0`, `@clerk/nextjs@7.9.18`, `ai@7.0.148`, `@ai-sdk/anthropic@4.0.85`, `@ai-sdk/google@4.0.102`, `@convex-dev/agent@0.7.8`, `@convex-dev/presence@0.4.0`, `zod@4.6.7`, `maplibre-gl@6.15.0`, `react-map-gl@8.1.3`, `node-vibrant@4.0.4`.
- Tooling: `typescript@6.0.3`, `eslint@10.13.0`, `eslint-config-next@16.4.2`, `typescript-eslint@8.72.0`, `@convex-dev/eslint-plugin@5.0.0`, `prettier@3.9.10`, `vitest@5.0.5`, `convex-test@0.0.63`, `@edge-runtime/vm@5.0.0`, `@playwright/test@1.64.1`, `@clerk/testing@2.2.48`, `@axe-core/playwright@4.14.0`.
- Later stage: `robots-parser@3.0.1` (X1), `@ai-sdk/openai@4.0.99` (X3). D2's `politeFetch` checks addresses with Node's built-in `node:dns` and `node:net` (`BlockList`), so it needs no package.

The contract agent confirms each peer range at install time (for example `typescript-eslint` against TypeScript 6.0, per [ADR 0006](docs/adr/0006-eslint-prettier-typescript-6-vitest.md)) and reports any mismatch instead of switching versions.

### 4.14 Estimates

Decided by Sah-Nikhil on 2026-10-22 ([ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)). S3 owns all of it.

- **One entry point.** `estimateLines(ctx, { eventId, city, tier, eventType, lines })` in `convex/estimates.ts` returns one `{ unit, unitLow, unitHigh, basis }` per line (a line is a category or free label, a quantity and a unit). Everything that needs an Estimate calls it: the Brief summary (S11), the first plan and essential changes (S14), `addEntry` with an estimate source (S7) and Theme-driven decor Suggestions (S13). It runs in actions only. A Suggestion carries its Estimate, so "Add to plan" (S4) reuses it and runs no research. Vendor cards (S9) are read by queries, so they use `cachedOrTableEstimate(ctx, city, tier, category)`: the city's cached researched range when one exists, the table otherwise. The pure arithmetic in `lib/pricing/` (`pricePlan`, the bands, rounding, dates) takes those ranges and never calls a model.
- **The cascade, per line.**
  1. *Cache.* A fresh `estimateCache` row for the city, category and unit is used as it is, with no search.
  2. *Research.* Only when Claude is reachable (`claudeReachable`), as two calls per line (changed on 2026-10-23 after the review of PR #77, issue #80). Call 1 runs the default model with Anthropic's provider-executed web search and nothing else, as free text, continuing when the API pauses the turn (`pause_turn`) up to a small cap; Anthropic doesn't allow structured output together with web search's always-on citations. Call 2 has no tools and turns call 1's notes and result URLs into structured output: `unitLow`, `unitHigh`, the source URLs it used and one line of reasoning (at most about 200 characters). Call 2 runs on the helper model chain, so it may run on Gemini when Claude's helper can't answer. Lines are researched in parallel under one shared deadline, and a line that finished before the deadline keeps its research. Before a researched range is cached, a line with a table row must fall within [row low ÷ 3, row high × 3] at the Event's tier, or it falls through to the table; free-label results are never cached. Every line that falls through reports why (an error status, the pause cap, no output or the deadline). Its prompt holds only the category, unit, Event type and city, plus the comparable Listed prices of the Event's Shortlisted Vendors in that category as data with their page URLs. Code then keeps only URLs that appear in that call's search results (or are a supplied Listed price's page), and drops a result with no URL left, with `unitLow` above `unitHigh`, or with a non-positive amount. A result that used the Event's Listed prices is stored on the Entry only, never in the shared cache.
  3. *Reference table.* The first-brief table row for the category and unit, times the City tier multiplier, version `2026-10-22`.
  4. *Assistant's own knowledge.* For a line with no table row, one structured call (no tools) for `unitLow`, `unitHigh` and a line of reasoning, labelled "Assistant's own estimate, no sources". If that fails too, the line has no Estimate and shows "No Estimate yet" with "Add a Quote" and a typed amount; the Budget check counts it as zero and says so.
- **Rounding at the high edge** (decided 2026-10-23, review of PR #85): when an Entry is priced at its high end, it rounds down, per-plate prices to ₹10 and other lines to ₹1,000, so an Entry never shows more than its own high.
- **Limits** (settings in `convex/lib/settings.ts`): at most 8 searches per call of `estimateLines`, spent on uncached free-label lines first (they have no table to fall back on), then on the lines with the largest table highs; a 20-second limit on the research step, after which unfinished lines fall through to the table; cache rows live 24 hours. All three are tuned with the scripted cases.
- **Basis.** Every `PricedEstimate` carries an `EstimateBasis` (section 5.6). The UI shows it as the Estimate badge's source line: "Researched 22 Oct 2026 · 3 sources" (the URLs on hover or tap), "Utsavvy reference table, Y tier, Oct 2026" or "Assistant's own estimate, no sources".
- **Privacy.** Search queries and cache rows hold only a category, a unit, an Event type and a city. No Brief text, names, budget or Event ID reaches a search, and the shared cache never holds an Event's private layer.
- **Stubbing.** `estimateLines` takes its research and knowledge calls as dependencies. Tests and the e2e environment pass stubs that return nothing, so every line with a table row falls through to the table and the first-brief worked examples come out exact.

### 4.15 Terms and privacy page

Added on 2026-10-22, when Sah-Nikhil accepted the Gemini free tier as the fallback on condition that it is disclosed. `/terms` is one static page, linked from the landing page and the footer, written plainly. It says that Utsavvy is a non-commercial hackathon prototype with no warranty, and what each outside service receives:

- **Clerk** signs people in and holds their name, email and photo.
- **Convex** stores Events, the Chat, Comments and uploads.
- **Anthropic** receives Chat messages and the Canvas context the Assistant needs, on `claude-sonnet-5-5`.
- **Google Gemini**, when the fallback model is on, receives the same. On Gemini's free tier, Google may use those prompts and replies to improve its products.
- **Web research** for Estimates sends only a category, a unit, an Event type and a city (section 4.14), never names, budgets or Brief text.
- **Geoapify** receives city names and Vendors' published addresses for map positions.
- **Google Maps** receives what a Member searches in the Google places sheet.
- **Services added later** get their own line in the slice that brings them in (noted in the review of S1, 2026-10-23): **Vercel** hosts the site and sees every request (S1 adds this line now); **OpenFreeMap** serves the map tiles (S15); **Serper** and **Jina Reader** (X1) receive search queries and Vendor page addresses; **OpenAI** receives the same as Anthropic for an Event whose key is an OpenAI key (X3a).
- **Pinterest and Instagram** receive the usual browser data when their boards or embeds load.
- Stock photos are credited to their Pexels photographers, and the demo Event's people, Quotes and Comments are made up.
- The "Report content" address is how to ask for something to be taken down.

## 5. Data model

Convex tables, defined once in `convex/schema.ts` by the contract. Field names here are the contract's starting point; the contract may rename for TypeScript reasons but not change meaning. Every table with an `eventId` is reached only through `requireAccess`. "Versioned" means the row has a `version: number` that every write bumps (section 4.4).

### 5.1 People and Events

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| `users` | `tokenIdentifier` (Convex's stable identity key; null for seed personas), `clerkId` (Clerk's user ID), `name`, `email` (lowercase), `imageUrl`, `mobilePointing` (`"jump"`, `"sheet"` or null), `keepDontReplyOn` (X4) | `by_tokenIdentifier`, `by_clerkId`, `by_email` | Signed-in people are looked up by `tokenIdentifier`; `clerkId` stays for the `DEMO_JUDGE_*_ID` settings and the seed personas, which use values like `seed:meera` and can never sign in. `ensureMe` refreshes `name`, `email` and `imageUrl` from Clerk on every sign-in, so an email change in Clerk reaches email invites. |
| `events` | `name`, `eventType` (`"wedding"`, `"birthday"`, `"community"`), `ownerLabel` (`"owner"` or `"host"`), `city` (name, tier, centre), `tradition`, `communityKind`, `honoree`, `households`, `budgetTotal`, `contingencyShare` (0.10), `theme` (palette, styleWords, decorKeywords), `briefState` (`"intake"`, `"summary"`, `"planning"`, `"planned"`), `brief` (the `BriefExtraction` plus Assumptions), `budgetCheck`, `uploadRightsOn`, `defaults` (view, compactGrouping, mobilePointing), `startingSectionRenameBlocked`, `agentThreadId`, `demoKey`, `createdAt` | `by_demoKey` | Versioned. The invite link tokens live in `inviteLinks`, never on the Event, because every Event edit copies the document into history and a stale write returns it in the conflict. The Budget total and the Theme change through versioned writes, so the Assistant can't overwrite a Member's edit to them. `uploadRightsOn` is chosen at creation (default off, so each upload batch asks for the tick); it and `defaults` change only through the Owner and Co-owner setters in S1. |
| `viewPrefs` | `eventId`, `userId`, `grouping` (`"kind"`, `"function"` or null for the Event default), `order` (Item IDs per group), `collapsed` (group keys), `updatedAt` | `by_event_user` | One row per person per Event, for every active role, Viewers included. Personal: written directly, not versioned, no history (section 4.4). The person's mobile pointing choice stays on `users.mobilePointing`. |
| `memberships` | `eventId`, `userId`, `role` (`"owner"`, `"coOwner"`, `"member"`, `"viewer"`), `status` (`"active"`, `"left"`, `"removed"`), `blocked`, `displayName`, `joinedAt`, `endedAt` | `by_event`, `by_user`, `by_event_user` | One row per person per Event. Work keeps pointing at the membership, so a person who left shows as "Aditi (left)". |
| `inviteLinks` | `eventId`, `role` (`"member"` or `"viewer"`), `token`, `createdBy`, `createdAt` | `by_token`, `by_event_role` | One row per link. Not versioned and never copied into history or a conflict payload; only the Owner and Co-owners can read or reset a link (S1). A reset replaces the token, and its history line names who reset which link without the token. Moved off `events` on 2026-10-22 after the contract review. |
| `emailInvites` | `eventId`, `email`, `role`, `invitedBy`, `createdAt` | `by_event`, `by_email` | Built in X5, defined now because the 25-person cap counts pending invites. |
| `eventFunctions` | `eventId`, `key` (`"sangeet"`), `name`, `date` (a day or a range), `guests`, `assumed` (field names still assumed), `order` | `by_event` | Versioned. Named `eventFunctions` because "functions" means something else in Convex. `key` is one of `FUNCTION_KEYS` in `lib/types/functions.ts` (decided 2026-10-23); S11's Brief extraction normalises Function keys to it, and S21's boards and the vibe sets use the same keys. |

### 5.2 The Canvas

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| `sections` | `eventId`, `kind` (`"money"`, `"vendors"`, `"inspirations"`, `"notes"`, `"custom"`), `name`, `frame` (x, y, w, h), `order`, `deletedAt` | `by_event` | Versioned. Deleting a custom Section sends its Items to their starting Section. |
| `items` | `eventId`, `sectionId`, `kind` (`"budget"`, `"timeline"`, `"checklist"`, `"shortlistedVendor"`, `"googlePlace"`, `"inspiration"`, `"suggestion"`, `"note"`), `position`, `size`, `functionKey` (null means Event-wide), `data` (a union by kind, below), `createdBy`, `deletedAt` | `by_event`, `by_event_kind`, `by_section` | Versioned. One Budget, one Timeline and one Vendor checklist Item per Event. |
| `entries` | `eventId`, `itemId`, `kind` (`"budget"`, `"timeline"`, `"checklist"`), `order`, `functionKey`, `fields` (a union by kind, below), `assumed`, `createdBy`, `deletedAt` | `by_item`, `by_event_kind` | Versioned. |
| `comments` | `eventId`, `target` (an Item; an Entry; or a passage with `field`, `start`, `end`, the quoted original and `textChanged`), `rootId` (null for the first in a thread), `authorMembershipId` or `byAssistant` (run and the Member it answered), `body`, `resolved`, `createdAt`, `editedAt` | `by_event`, `by_item`, `by_root` | |
| `uploadClaims` | `fileId`, `eventId`, `itemId`, `membershipId`, `claimedAt` | `by_file` | One row per uploaded Inspiration's file (section 4.8). Internal functions only. |
| `highlights` | `eventId`, `runId`, `forMembershipId`, `targets`, `expiresAt` | `by_event` | The Assistant's pointing. Everyone sees the highlight; only the asker's view pans. Expires after 30 seconds. |

Item `data` by kind:

- `budget`, `timeline`, `checklist`: the Budget note (shows the current Theme words on decor lines) and nothing else; their rows are Entries.
- `shortlistedVendor`: `vendorId` (a shared Vendor; `privateVendorId` arrives with X7).
- `inspiration`: `source` as in [inspirations.md](docs/design/inspirations.md) (in v1, `pexels`, a stock library photo with `pexelsId`, `localPath`, photographer and links, `alt` and `tags`, and `upload`; `reference` since 2026-10-22, with `platform` (`"pinterest"` or `"instagram"`), `urlKind` (`"pin"`, `"board"` or `"pinShort"` on Pinterest, `"post"` or `"reel"` on Instagram) and `url`, nothing else from the platform, and `seen` always null ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)); `generated` and `remix` later), `addedBy`, `memberNote`, `seen` (description, palette, decorKeywords; for a library photo these are its alt text, seed palette and tags, with no model call).
- `googlePlace`: `placeId` (Google's place ID) and `note` (the Member's own words, required, up to 280 characters). Nothing else from Google. Who saved it and when are the Item's `createdBy` and its `changes` row.
- `suggestion`: `title`, `body`, `costCategory`, `quantity`, `estimate`, `status` (`"open"`, `"added"`, `"dismissed"`).
- `note`: `text`, `citations` (for a saved web search answer).

Entry `fields` by kind:

- `budget`: `label`, `category` (a reference-table key, or null for a free label), `quantity`, `unit`, `estimate` (`PricedEstimate`: low, high, amount, label and its `EstimateBasis`, section 5.6; null for "No Estimate yet"), `plannedAmount`, `role` (`"line"`, `"contingency"`, `"unallocated"`), `belowUsualRange`, `editedByMember`.
- `timeline`: `title`, `date`, `time` (run sheet Entries only, such as `"19:30"`), `leadKey`, `priority` (`"P1"`, `"P2"`, `"P3"` or null), `late`, `note`, `vendorCategory`, `done`.
- `checklist`: `vendorCategory`, `freeLabel`, `functionKeys`, `bookByEntryId` (its Timeline deadline), `budgetEntryIds`. Its status (to find, shortlisted, booked) is worked out from its Vendor links, never stored.

### 5.3 Vendors: the shared layer and the Event's private layer

Shared, app-wide ([ADR 0008](docs/adr/0008-vendors-are-one-shared-record.md)):

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| `vendors` | `domain` (unique key: the own site's domain, or `instagram.com/<handle>` for an Instagram-only Vendor), `name`, `category` (`"venue"`, `"caterer"`, `"decorator"` or `"photographer"` in v1; the other four fixed categories and `freeLabel` arrive with X1 and X7), `website` (null for an Instagram-only Vendor), `profileUrl` (the Instagram profile, for those only), `address` (line, locality, city), `phone`, `email`, `capacity` (min, max), `areaServed`, `summary` (the Assistant's own words), `marker` (lat, lng, confidence, matchType, approximate, provider, attribution), `provenance` (one entry per field: `field`, `kind` (`"ownSite"` or `"instagramProfileHumanChecked"`), `url`, `sentence` (the exact sentence from the page, quote-checked; null for `instagramProfileHumanChecked`), `seenAt` (the date seen or checked), `confirmedBy` (`"Sah-Nikhil"` for `instagramProfileHumanChecked`, otherwise null)), `factsSeenAt`, `source` (`"starterSet"`, later `"discovery"` or `"pastedUrl"`) | `by_domain`, `by_city_category` | Versioned. A Marker drag is `api.map.moveMarker({ eventId, vendorId, lat, lng })`: it needs Member access to that Event and a Vendor in its city or shortlisted by it, and writes the shared Marker and that Event's history row in the same mutation. The demo reset never rewrites these rows (section 9.2). |
| `listedPrices` | `vendorId`, `sourceUrl`, `sentence`, `seenAt`, `comparable`, `amount` (min, max), `unit` (`per_plate`, `per_person`, `per_day`, `per_function`), `qualifier` (`exact`, `approx`, `starting`), `diet`, `guestRange`, `inclusionsNote`, `text`, `supersededAt` | `by_vendor` | Never overwritten; a refresh adds rows. |

Private to one Event:

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| `vendorLinks` | `eventId`, `shortlistItemId`, `checklistEntryId`, `status` (`"considering"`, `"contacted"`, `"quoted"`, `"booked"`, `"dropped"`) | `by_event`, `by_item`, `by_entry` | Versioned. One per Shortlisted Vendor and checklist Entry pair. |
| `quotes` | `eventId`, `linkId`, `amount`, `unit` (the four units or `"total"`), `functionKeys`, `guests`, `receivedAt`, `note`, `fileId`, `source` (`"form"` or `"chatPaste"`), `createdBy`, `createdAt` | `by_link`, `by_event` | The newest per link is current. Never pooled. |

No query that returns a shared Vendor may join another Event's links, Quotes or Comments. S9's tests check this with two Events shortlisting the same Vendor.

### 5.4 Chat, runs and Proposals

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| (Agent component) | Thread and messages, stored by `@convex-dev/agent` | | Message text and streaming. One thread per Event. |
| `chatAnnotations` | `eventId`, `messageId` (the Agent message), `authorMembershipId`, `dontReply`, `mentions`, `pointing` (Items, Entries, passage), `card` (`proposal`, `stockStrip`, `vendorCards`, `nudge`, `briefChips`, `briefSummary`, `planProgress`, `citations`, `system`) with its id | `by_event`, `by_message` | Our metadata on top of the Agent's messages. |
| `runs` | `eventId`, `requestedBy`, `source` (`"chat"`, `"comment"`, `"nudge"`, `"brief"`), `messageId`, `commentId`, `status` (`"queued"`, `"running"`, `"stopping"`, `"done"`, `"stopped"`, `"failed"`, `"cancelled"`), `stoppedBy`, `model`, `createdAt`, `startedAt`, `endedAt` | `by_event_status`, `by_event_created` | One `running` per Event. |
| `toolCalls` | `key` (`runId:toolCallId`), `result`, `at` | `by_key` | Idempotency. |
| `proposals` | `eventId`, `runId` (null for a Proposal from a Brief edit), `requestedBy`, `origin` (Chat, a Comment thread, or a Brief edit), `summary`, `changes` (each a `ProposedChange`: `op`, `table`, `docId` or null, `expectedVersion` or null, `guards`, `values`), `status` (`"open"`, `"accepted"`, `"rejected"`, `"replaced"`, `"outOfDate"`, `"expired"`), `decidedBy`, `decidedAt`, `replacedBy`, `expiresAt`, `createdAt` | `by_event_status` | Stored apart from the changes it applies ([ADR 0009](docs/adr/0009-assistant-changes-are-version-checked-and-risky-ones-are-proposals.md)). Accept re-checks every `expectedVersion` and every guard, then applies all changes in one mutation, or none. An insert has no version of its own, so its `guards` list the parents it depends on (section 6). |
| `nudges` | `eventId`, `trigger` (`"budgetOver"`, `"dueSoon"`, `"newInspiration"`), `targetId`, `dayIst`, `messageId` | `by_event_trigger_target_day` | At most one per trigger per target per IST day. A photo counts as new when its creation change's own `at` falls on the current IST day, not when its row was written (#102 follow-up, 2026-10-30); only the vibe pick's photos, which set the Theme as they arrive, are left out by their history label. |
| `changes` | `eventId`, `at`, `actor`, `groupKey` (run or Proposal), `groupLabel`, `fromComment`, `table`, `docId`, `op` (`"create"`, `"update"`, `"delete"`, `"restore"`, `"people"`), `before`, `after`, `undoneBy` | `by_event_at`, `by_doc`, `by_group` | The edit history. People changes (role switches, removals, link resets) are rows too. |

### 5.5 Caches and later tables

- No stock cache: the stock library is a seed file plus static files ([ADR 0012](docs/adr/0012-stock-photos-from-a-local-hand-curated-library.md)).
- `estimateCache` (v1, in the contract's schema; written only by S3's research step, [ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)): `cityKey` (the city name, lowercased and trimmed), `category`, `unit`, `unitLow`, `unitHigh`, `sourceUrls`, `reasoning`, `searchedAt`, `model`, `expiresAt`; index `by_city_category_unit`. App-wide and holds no Event data, so it has no `eventId` and no `requireAccess`; only internal functions read or write it. A newer row for the same key wins, and a read ignores expired rows.
- Later, added by contract-change PRs: `privateVendors` (X7), `eventKeys` (X3a), and `discoveryRuns` and `serperCache` (X1a). The `generatedEstimates` table planned for X1b and X7 is dropped (section 3, item 1).
  - `eventKeys`: `eventId`, `provider`, `model`, `attachedByMembershipId`, `attachedByUserId`, `last4`, `ciphertext`, `iv`, `authTag`, `createdAt`; indexes `by_event` (at most one key per Event, enforced in the attach mutation) and `by_attacher` (`attachedByUserId`). Queries return only `provider`, `model`, the attacher and `last4`, and only to the roles roles.md allows. The leave-time "Remove my Event key too" choice is applied when the person leaves and isn't stored. A removed or blocked attacher can still call `api.eventKeys.removeMine({ eventId })`, which checks `attachedByUserId` and only deletes that key (section 4.3). They find it through `api.eventKeys.listMineRevocable()`, which the `/events` page shows as "Your Event keys in Events you're no longer in", each row with the Event name, the model and "Remove my Event key from this Event".
- Presence uses `@convex-dev/presence` with the Event as the room and the selected Item or Entry as the person's data.

### 5.6 Shared types

`lib/types/` (contract) holds `BriefExtraction`, `FirstPlanDraft`, `PricedEstimate`, `BudgetCheck` and `ThemeUpdate` from the design docs, the Item and Entry unions, `CommentTarget`, `Selection`, `Actor`, `WriteEvent`, `ProposedChange` and `ProposalOpHandler` (section 6), and the action names of the permissions table. Convex validators and TypeScript types come from one definition, so a field rename fails the build.

`PricedEstimate` is `{ low, high, amount, label: "Estimate", basis: EstimateBasis }`, where `EstimateBasis` is `{ kind: "researched" | "referenceTable" | "assistantKnowledge", unit, unitLow, unitHigh, text, sourceUrls, searchedAt, reasoning, tableVersion }`. `text` is the line shown on the badge (section 4.14). `sourceUrls` and `searchedAt` are filled only for `researched` (URLs only, never page text), `reasoning` for `researched` and `assistantKnowledge`, and `tableVersion` (`"2026-10-22"`) only for `referenceTable`; the others are empty or null.

## 6. The Assistant's tools

Final names. Every write tool takes `expectedVersion` for anything it changes, goes through `assistantWrite`, checks `requireAccess` for the Member it is answering, and returns the IDs it touched so the Assistant can point at them. "Direct" means the change applies at once when a Member asked for it and it stays under the Proposal thresholds; otherwise the Assistant must use `propose`.

| Tool | Arguments (short) | Applies | Slice |
|---|---|---|---|
| `readCanvas` | optional Item or Entry IDs | Read: Event summary (Functions, Budget roll-up, Theme, open Proposals) or the named documents | S7 |
| `readChat` | `before`, `limit` | Read: older messages | S7 |
| `addEntry` | Item kind, `functionKey`, fields, and an amount source: `{ estimate: { category or freeLabel, quantity, unit } }` (the server runs the estimate cascade, section 4.14) or `{ memberStated: amount }` | Direct when asked and small | S7 |
| `updateEntry` | `entryId`, `expectedVersion`, patch | Direct when asked and small | S7 |
| `addItem` | kind (`note` or `suggestion`), Section, data | Direct | S7 |
| `updateItem` | `itemId`, `expectedVersion`, patch | Direct when asked | S7 |
| `moveItem` | `itemId`, `expectedVersion`, Section or position | Only when a Member asked | S7 |
| `createSection` | `name` | Only when a Member asked | S7 |
| `addComment` | target, body | Direct when asked, or replying to @Utsavvy in a Comment | S7 (S17 for Comment threads) |
| `pointAt` | Items, Entries, passages | Highlight; the asker's view pans | S7 |
| `webSearch` | (provider tool) | Read: cited answer in the Chat; Claude only, at most 3 per reply | S5 |
| `propose` | `summary`, changes (any write above, plus `deleteEntry`, `deleteItem`, `setBudgetTotal`, `addQuote`, `updateTheme`, `changeEssential`) | Proposal card | S10 |
| `findVendors` | category, `functionKey`, `minCapacity`, `maxPrice` (per its unit) | Read: shared Vendors in the Event's city, shown as Vendor cards in the reply | S9 |
| `shortlistVendor` | `vendorId`, `checklistEntryId` | Direct when asked | S9 |
| `setVendorStatus` | `linkId`, `expectedVersion`, status | Direct when asked | S9 |
| `searchStockImages` | `query`, `functionKey` | Read: up to 6 stock library photos whose curator tags match, as a strip (fewer when fewer match; none, with an upload offer, when nothing matches); nothing is added until a Member taps | S13 |
| `updateTheme` | `ThemeUpdate` | Direct when asked; through `propose` when it is the Assistant's own idea | S13 |
| `tagInspiration` | `itemId`, `functionKey` or null | Direct when asked | S13 |
| `discoverVendors` | category, city, locality | Later (X1): starts Discovery | X1b |
| `addVendorFromUrl` | `url` (must appear in the Member's message) | Later (X1): reads that one site | X1b |
| `generateImage` | `prompt` | Later (X3b): Event key only, counts toward 20 a day | X3b |
| `remixImage` | `itemId` (never a Reference) | Later (X3b): Event key only, counts toward 20 a day | X3b |

There is no estimate tool. The Chat model never passes a price of its own: `addEntry` names the line, and the server's cascade prices it, the same as for the plan and Suggestions. The research model inside the cascade is a separate call with web search only (section 4.14).

The Proposal thresholds are settings in `convex/lib/settings.ts`: deletions, Budget total changes, shifting more than 10% of the Budget total, touching more than 5 Entries or Items, and anything no Member asked for. The server enforces them: a direct tool call that crosses one is refused with a message telling the model to use `propose`.

**Proposal operations.** The contract defines the `ProposedChange` union in `lib/types/`, one variant per `propose` op (`addEntry`, `updateEntry`, `addItem`, `updateItem`, `moveItem`, `createSection`, `addComment`, `deleteEntry`, `deleteItem`, `setBudgetTotal`, `addQuote`, `updateTheme`, `changeEssential`). Each variant has `op`, `table`, `docId` or null, `expectedVersion` or null, `guards` (`{ table, docId, version }[]`, the parents an insert depends on) and its `values`. A handler has the type `ProposalOpHandler<Op> = { validate(ctx, change): Promise<string | null>; apply(ctx, change, actor): Promise<Id[]> }`. The registry `convex/lib/proposalOps.ts` (contract) maps each op to its handler, imported from stubs in the owning slice's file: S10 owns every op except `addQuote` (S12, `convex/assistant/tools/quotes.ts`), `updateTheme` (S13, `convex/assistant/tools/images.ts`) and `changeEssential` (S14, `convex/plan.ts`). `shortlistVendor`, `setVendorStatus` and `tagInspiration` have no op, because the Assistant never makes those changes on its own idea (inspirations.md rule 8 already limits tagging to a request that names a Function). Each of those tools is refused unless the run answers a Member's own message (`runs.source` is `"chat"` or `"comment"`) that asked for that change; the refusal tells the model to suggest it in its reply instead, and a Member makes it with the existing tap (the Vendor card's shortlist button, the link's status menu, the Inspiration's Function chip). On Accept, S10's `applyProposal` runs inside the one `api.proposals.accept` mutation: it checks every `expectedVersion` and every guard first, then calls each handler's `validate` and `apply`, and handlers write through `assistantWrite` and `assistantInsert` with the Proposal as the group. Any refusal or throw rolls back the whole mutation, so Accept applies all or nothing. A pasted Quote's `addQuote` change guards its `vendorLink` and its checklist Entry; adding a Quote bumps its link's version, so a link that was dropped, booked, reassigned or given another Quote while the Proposal waits makes it out of date.

**No tool, ever:**

- Messaging anyone (WhatsApp, email, SMS) or sending invites.
- Paying, booking or taking deposits.
- Fetching an address of its own choosing. Pages are read only by the Discovery pipeline or from a URL a Member pasted, both later stage.
- Opening a Pinterest or Instagram link.
- Changing Members, roles, invite links or Event keys.
- Renaming or deleting Sections.
- Writing a Listed price (only the quote-checked extraction code does), or saving a Quote without a Member's Accept.
- Writing an amount that is not from the estimate cascade or the requesting Member's own words (section 3, item 1).

## 7. UI stack and look

Decided with Sah-Nikhil on 2026-10-21 after a research pass that compared 8 component kits and 6 canvas options; see [ADR 0010](docs/adr/0010-react-flow-canvas-and-restyled-shadcn-base-ui.md).

### 7.1 Stack

| Layer | Choice | Package (pinned 2026-10-21) |
|---|---|---|
| Styling | Tailwind CSS 4, tokens in `app/globals.css` | `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `postcss@8.5.31` (dev) |
| Primitives | shadcn/ui, Base UI variant, copied in with `bunx shadcn@4.22.1 init` and restyled before any feature work | `@base-ui/react@1.9.0`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, `tw-animate-css@1.4.0` |
| Canvas | React Flow, one custom node per Item kind, group nodes for Sections | `@xyflow/react@12.12.0` |
| Motion | CSS transitions first; Motion only for Chat arrivals, Proposal cards and the pointing ring | `motion@14.5.0` |
| Compact reordering | dnd kit, handle-only drag plus visible "Move up / Move down" actions | `@dnd-kit/react@0.5.1` |
| Fonts | Anek Devanagari (all product text, Latin and Hindi), Fraunces upright (English display and Section labels), Tiro Devanagari Hindi upright (standalone Hindi display only), self-hosted by `next/font/google` with no italic files | none |
| Icons | Lucide for controls; original SVG illustrations for the Vendor categories | `lucide-react@1.61.0` |
| Budget visuals | A real HTML table with labelled CSS bars; no chart library | none |

Rules for the build:

- The contract restyles every copied primitive (Button, Field, Dialog, Sheet, Menu, Tooltip, Accordion, Tabs) to the chosen look before any slice starts, so no screen ships with stock shadcn styling.
- Every Item kind has its own designed shell (title, kind, provenance line, actions, Comment count, presence avatar) built on `<ItemFrame>`.
- Copy-in components from third-party registries only when their licence is confirmed and noted in the file; Magic UI and motion-primitives are MIT, Aceternity and the current Origin UI collection are not verified, so skip them.
- Motion runs 120 to 180 ms for control feedback and 220 to 300 ms for arrivals, with one easing curve, no bounce or confetti, and nothing for people who prefer reduced motion. The pointing ring is the one marigold animation.
- Body text 14 to 15 px on desktop and 16 px on phones, tabular numerals for ₹ amounts and dates, line height about 1.55 for Devanagari, and `lang="hi"` on Hindi runs.
- The font check before the contract merges: Hindi matras and conjuncts at 13, 16 and 32 px on Windows and Android, including mixed text such as "Mehendi के लिए ₹2,40,000". If Anek fails, Mukta is the fallback for text.
- **Font roles, decided on 2026-10-22** after the font check, when Sah-Nikhil found Anek and Tiro both fine and asked for the choice to be analysed. Anek sets every piece of product text, including the Budget, chips and Chat, and the Hindi runs inside Hinglish sentences stay in Anek: at 13 px its even strokes read more clearly than Tiro's finer, higher-contrast ones, and switching faces mid-sentence changes the tone. Tiro sets only standalone Hindi display text, such as the landing headline, because at 32 px and above it pairs with Fraunces where Anek's Hindi beside Fraunces looks like an abrupt serif-to-sans switch. A Hindi phrase inside an English heading is wrapped in `<span lang="hi">` with the Hindi display face. Fraunces's `next/font` Latin subset has no ₹, so an amount inside display text is set in Anek with tabular digits by the shared money formatting. Hindi in headings, Section labels and Item titles gets line height of at least 1.4 to 1.5 (1.55 in text) and no clipping wrapper. Dropping the unused italic files and Tiro's Latin subset cuts the landing page's preloaded fonts from 8 files and about 744 KB to about 4 files and 487 KB; one Hindi family would save only another 64 KB.

### 7.2 Motion inspiration

Sah-Nikhil likes [Prompt Motion](https://prompt-motion.com/), a collection of motion videos made with Claude Opus 5.5 together with the prompts and skills behind them. It is a reference for the few UI motion moments above and for the demo video and LinkedIn clip; nothing from it is copied.

### 7.3 The look

Sah-Nikhil compared four looks rendered on the same screens (the Canvas prototype's own tones, Ivory ledger, Midnight mehfil and Contemporary rangoli) in a throwaway mockup page. Two candidates remained for the contract review on 22 Oct, where Sah-Nikhil picked D (below).

Shared by both candidates:

- Indigo for actions, selection and focus (`#333A83`, selected `#EDEDF8`).
- Teal for Booked and Quotes (`#146B65`).
- Marigold (`#D58600` on `#FFF2C8`, text `#603C00`) only for "the Assistant is pointing here". The prototype also used it on the Assistant's avatar and on Estimate badges; production doesn't.
- Every price wears a labelled badge: Estimate (dashed outline), Listed price (with source and date), Quote. They are never added into one total.
- Ink text `#252631`, secondary `#56586B`, Fraunces for English display, Anek Devanagari for text.

**Candidate B, Ivory ledger.** Warm ivory ground `#F6F1E8` with a faint paper grain, paper Items `#FFFDF8`, rules `#D7D2C8`. Sections are labelled in italic Fraunces with one thin original line motif (a diamond chain drawn from textile and rangoli geometry), used at Section labels only. Function rows stay neutral. Calm, like a well-set planning document.

**Candidate D, Contemporary rangoli.** Sand ground with bright white Items. Every Section is framed by original ornamental corner pieces. Each Function has its own muted colour, shown as a diamond marker and a tinted row band in the Budget, the Timeline and the Function filter: haldi ochre, mehendi green, sangeet plum, wedding maroon, reception slate (new Functions take the next colour from a fixed set). Friendlier and more festive, with more colours to keep apart from price, focus and selection states.

**Decided on 2026-10-22: D**, picked by Sah-Nikhil on the contract's real components over B and over C0's default of B with D's Function colours, with one change: the ornaments can be switched off. "Ornaments" is a personal display setting, on by default, in the account menu. Turned off, it hides the corner pieces and any other purely decorative motif and leaves the sand ground, the Function colours and the layout exactly as they are. It is stored per device, like a theme setting, and applied before the page paints, so a reload doesn't flash. B's italic Section labels and diamond line motif went with B.

### 7.4 Our own components, not stock shadcn

The copied shadcn/ui and Base UI code is a starting point for behaviour and accessibility only. The contract builds Utsavvy's own component set with the `impeccable` skill, so no control looks like a default shadcn app. References:

- [Material Design 3](https://m3.material.io/): tonal surfaces to show elevation instead of drop shadows; state layers (a tinted overlay) for hover, focus and press; a deliberate shape scale where small controls, Items and sheets each have their own corner family and shapes shift slightly on press; emphasized easing for arrivals and standard easing for feedback.
- [Google's Gemini visual design](https://design.google/library/gemini-ai-visual-design): the Assistant is shown as a soft circular gradient that moves while it thinks and streams, "inner activity" that makes processing visible, and settles when the reply is done. Utsavvy builds that gradient from the Event's own Theme palette, so every Event's Assistant looks a little different. Because a Theme can itself contain marigold (the Jaipur demo's Theme is "royal Rajputana, marigold, pastel pink"), the pointing ring keeps its own solid marigold ring and "Assistant" label, and the gradient drops hues close to it.
- [Prompt Motion](https://prompt-motion.com/) for the feel of the few animated moments (section 7.2).

Rules that keep the final call cheap:

- Components and slices use semantic tokens only (`--surface`, `--surface-raised`, `--ink`, `--action`, `--point`, `--price-estimate`, `--function-1` to `--function-8`, the `--map-*` colours from section 7.5, and so on), never raw colours. The lint step flags hex values outside `app/globals.css`.
- Both candidate token sets ship in the contract behind a development-only switch, so Sah-Nikhil can compare them on the real components. The contract PR keeps only the chosen set before it merges.
- Section decoration is one component (`<SectionOrnament>`), so B's line motif and D's corner pieces are a swap, not a rewrite.

The throwaway mockup is `looks.html`, kept on the `prototype/looks` branch (never merged) as a reference for the contract agent.

### 7.5 The Vendor map's own style

Decided by Sah-Nikhil on 2026-10-22, after seeing the stock OpenStreetMap look ("looks UGLY... can we make it look better ourselves?"). This amends [ADR 0005](docs/adr/0005-maplibre-with-openfreemap.md) without changing its choice: MapLibre and OpenFreeMap's vector tiles stay, and only the style that draws them is ours.

- **Our style, built from our tokens.** `buildMapStyle(colours)` in `components/map/style.ts` (S15) returns a MapLibre style object: OpenFreeMap's vector source (`https://tiles.openfreemap.org/planet`, OpenMapTiles schema) and its label fonts, with our own short list of layers. Warm paper land, a soft water tint, parks a shade off the land, muted roads with major roads only a little stronger, faint buildings at close zoom, and quiet labels with a paper-coloured halo. No points of interest and no icon sprite, so the only symbols on the map are our Markers. Labels use the Latin name fields, because MapLibre can't shape Devanagari. The style is built in the browser rather than committed as a JSON file under `public/`, so its colours stay in the token files and the hex lint rule needs no exception.
- **Colours come only from tokens.** The map reads the `--map-*` tokens (`--map-land`, `--map-water`, `--map-park`, `--map-road`, `--map-road-major`, `--map-building`, `--map-label`, `--map-label-halo`, `--map-boundary`) from the document when it mounts and passes them to `buildMapStyle`, so the map follows the look chosen at the contract review and no colour is written outside the token files. The contract defines these tokens in both candidate sets, in a format MapLibre parses (hex or `rgb()`).
- **Our own Markers.** Marker shapes are ours: drawn in SVG with the status colours from the tokens and the category illustration; an approximate Marker is the same shape, hollow, with "approximate" in its label.
- **Attribution stays.** OpenFreeMap, OpenMapTiles and OpenStreetMap credits show in the map's attribution control (from the source's attribution string), with Geoapify beside them.
- **The basemap is still one setting.** When `NEXT_PUBLIC_MAP_STYLE_URL` is set, the map loads that style URL instead of building ours (section 4.11), as ADR 0005 intends.
- **The look, decided 2026-10-27 by Sah-Nikhil.** He rejected the first build as generic ("no character") and compared three rendered directions. The panel is option A, "Rangoli atlas": Look D's corner pieces, Fraunces headings, the filter chips, a compact key inside the panel so it never covers the map, the Shortlisted and Others lists and a diamond between them. The map is option B's Jaipur block print on option A's sand ground, with no pink anywhere: a butta printed on the land, a leaf print on parks, lahariya waves on water and major roads inked in terracotta. Markers are option B's hand-stamped motifs in the status colours, slightly misregistered, with a different shape per status so colour is never the only cue. The selected Marker gets option A's frame of rangoli petals and a dotted ring, not B's printed square. "approximate" is written under a Marker only on hover, on focus or at street zoom. The prints use the `--map-print-*` tokens (`--map-print-butta`, `--map-print-park`, `--map-print-leaf`, `--map-print-water`, `--map-print-wave`, `--map-print-building`, `--map-print-ink`, `--map-print-label`) on `--map-land`, drawn on a canvas and added with `map.addImage`. Prints, petals and the other ornaments follow the Ornaments setting: with it off, the flat colours and the shapes stay.

## 8. Testing and accessibility bar

Chosen by Sah-Nikhil: seams, scripted cases and axe on every slice, plus a CI run of the scripted Assistant cases at the end of v1.

- **Unit and backend tests.** Vitest with `convex-test`, always `bun run test` (never `bun test`). Each issue lists its seams; the agent writes each test first and shows it failing in the PR.
- **The worked examples are exact tests**, with research stubbed to return nothing so every line falls through to the reference table pinned at its frozen version (section 3, item 3; section 4.14). Two kinds of pricing test: rule tests (bands, fraction f, roll-up, rounding into the Contingency) that hold for any ranges, and worked-example snapshots that name the table version they expect. Sah-Nikhil rejected both D2 adjustments, so the numbers below are the first-brief seed table's and stand as written.
  - Jaipur wedding, 300 Guests, ₹25L: Minimum ₹19.62L, Typical ₹32.47L, High ₹45.33L, tight band, f ≈ 0.209, wedding catering ₹1,210 per plate × 300 = ₹3,63,000, Event total exactly ₹25,00,000. The ₹15L variant is flagged ₹4.6L short and scales Entries to about 76% of their lows.
  - Aarav's 6th birthday, 60 Guests, ₹1.5L: comfortable, f ≈ 0.65, catering ₹660 per plate × 60 = ₹39,600.
  - Pune Ganesh utsav, 240 households, ₹2.4L: tier X, Minimum ₹2,75,700, about ₹36,000 short, ₹1,000 per household, daily aarti as one Function from 4 to 13 Sep 2027.
  - The Timeline cases from first-brief.md: late bookings pulled to P1, P2 and P3 dates, a month-only date assumed as the 15th.
  - Vendors: the Parampara price range, the Vinayak starting price, the not-comparable "₹500 per hand", the WhatsApp Quote.
- **The estimate cascade** ([ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)), with stubbed research and knowledge calls:
  - Fallback order: a fresh cache row is used with no search; a stubbed researched range is used and labelled `researched`; empty research falls to the table (`referenceTable`, tier multiplier applied); a free label with empty research gets the stubbed knowledge range (`assistantKnowledge`, "Assistant's own estimate, no sources"); with both empty it has no Estimate.
  - The basis is recorded: kind, per-unit range, URLs and search date for `researched`, table version for `referenceTable`.
  - URLs only: a source URL not in the stubbed search results is dropped, a result left with no URL falls to the table, and no field of the stored basis or cache row holds page text.
  - Cache: a second call for the same city, category and unit within 24 hours runs no search; after 24 hours it searches again; a result that used the Event's Listed prices writes no cache row.
  - Limits: with 12 uncached lines, research runs on at most 8, free labels first; a research stub that never resolves is cut off at the time limit and its lines get table Estimates.
  - No model arithmetic: the researched range is per unit, and the line's low and high are code's quantity × unit price (a stubbed ₹1,100 to ₹1,900 per plate for 300 Guests gives ₹3,30,000 to ₹5,70,000).
  - Privacy: the research prompt for the Jaipur wedding contains no Guest name, budget or Brief text.
- **Roles.** One table-driven test runs every row of the permissions table for all four roles, plus "removed and blocked people are refused" and "a Viewer's Comment never starts a run".
- **Assistant rules in code** (no model needed): the Proposal thresholds, version conflicts and the one retry, idempotent repeats, the member-stated amount check, Undo all skipping later Member edits (with X11), Proposals going out of date.
- **Scripted Assistant cases.** About 25 cases run against the real model with `bun run eval`, against a dedicated Convex dev deployment: the seven assistant-behavior examples (simple request, risky request, collision, two asks, side conversation, Nudge, the hidden-instruction Vendor page), the inspirations examples that apply in v1 (stock photos from the Chat, nothing in the library, rights setting off, pointing), the three first Briefs and the ₹15L variant, the WhatsApp Quote, Hinglish, English and Devanagari Hindi replies, a Pune per-plate web search with citations, an attempt to write an amount nobody gave, and live Estimate research. The research cases check tolerance bands, not exact numbers: Jaipur wedding catering and Pune Ganesh utsav pandal and decor come back `researched` with at least one source URL and a per-unit range inside a wide band around the table row (from a third of its low to three times its high); a tent house in Jaipur comes back `researched` or `assistantKnowledge`; and each case records the searches spent, the time taken and the cost. Agents run the cases their slice touches before opening the PR. They are not a required CI check, because they spend API credits and replies vary. On 27 Oct the orchestrator runs the full set in CI through a manual workflow and turns failures into `bug` issues.
- **Browser tests.** Playwright against the PR's Vercel preview, signed in with `@clerk/testing`. One smoke test per screen, plus one demo-path test that walks the demo script on the seeded Event. The demo-path test runs on a local backend, not the preview (29 Oct, S19b): its reset and check helpers refuse any deployment that isn't local, by design. The demo Event smoke test (`e2e/demo.spec.ts`) is local-only for the same reason, so the preview runs only the per-screen smoke tests, and the production rehearsal walks the script twice.
- **Accessibility.**
  - `@axe-core/playwright` runs inside every smoke test and fails on any serious or critical violation.
  - Every control works by keyboard, with visible focus.
  - Text and controls meet WCAG AA contrast.
  - Every image has alt text (the curator's alt text for stock library photos, the saved description for uploads).
  - Motion respects `prefers-reduced-motion`.
  - Compact mode is the keyboard and screen-reader route to everything on the Canvas.
  - Chat replies are announced through a polite live region; Proposal cards and Nudges are reachable by keyboard.
  - Rupee amounts are written with lakh grouping (₹2,40,000) everywhere, and `lang="hi"` is set on Devanagari replies.

## 9. The demo

### 9.1 Seeded content

The S19a reset builds everything below from seed files with no model calls, using the same pricing engine on the reference-table path (no research), so the numbers always match the worked example and every seeded Estimate shows the reference-table basis.

- **"Meera weds Rohan", Jaipur, February 2027.** The first-brief worked example 1 plan: North Indian Hindu, five Functions, Theme "royal Rajputana, marigold, pastel pink", priced at ₹25L in the tight band, with run sheets, 14 checklist Entries and 7 Suggestions (two already added, one dismissed). The Owner label is "Host".
- **One change from the worked example, for the demo's Budget beat.** The family confirmed 300 Guests at the sangeet (the Assumption said 225), and Rohan set the sangeet catering line to ₹2,45,000. The Contingency absorbs the difference so the Event total stays exactly ₹25,00,000. Pasting the WhatsApp Quote (₹950 × 300 = ₹2,85,000) and using it as the line's amount therefore puts the Budget exactly ₹40,000 over.
- **People.** judge-owner (Owner, shown as Host), judge-member (Member), judge-viewer (Viewer), Meera (Co-owner, shown as Co-host), Rohan (Member), Papa (Viewer, Meera's dad), Aditi (left), Kabir (removed and blocked). Meera, Rohan, Papa, Aditi and Kabir are seed personas that can't sign in.
- **Vendors.** The 16 starter Vendors are on the map; 5 are shortlisted with mixed statuses: two Venues (Considering, Contacted), a caterer (Contacted, for the sangeet and the wedding), a decorator (Quoted, with one Quote) and a photographer (Booked).
- **Inspirations.** The three vibe pick photos and two haldi photos from the stock library, with their Pexels credits.
- **Comments and history.** Papa's "Is this hall big enough for our relatives from Kota?" on a Venue card, two more Comments in a thread, Aditi's Note marked "(left)", history groups such as "Utsavvy for Meera: Plan the sangeet (8 changes)" and one accepted Proposal ("Utsavvy for Rohan, accepted by Meera").
- **The banner** from section 3, item 5.

Pending email invites and the second seeded Event with an Event key arrive with X5 and X3.

### 9.2 Judge accounts and reset

- Three email + password accounts (judge-owner, judge-member, judge-viewer) were created on 2026-10-22 through Clerk's API, with `+clerk_test` addresses so a new-device email check accepts the code `424242`, and their Clerk user IDs are in the dev and production Convex environments (`DEMO_JUDGE_OWNER_ID`, `DEMO_JUDGE_MEMBER_ID`, `DEMO_JUDGE_VIEWER_ID`). The logins go in the submission notes, never in the repo.
- A judge who signs up with any `+clerk_test` address and the code `424242` gets a fresh account and owns any Event they create.
- `demo:reset` deletes and rebuilds the demo Event's private data by its `demoKey` (its Canvas, Chat annotations, memberships, Shortlisted Vendors, links, Quotes, Comments, Proposals, Nudges and history), and gives the three judge accounts their roles again. It runs nightly at 03:00 IST and on demand with `bunx convex run demo:reset`. It never touches other Events.
- The shared starter set is not part of the reset. `internal.vendors.loadStarterSet` (S9) loads it once, idempotently by domain: it inserts a missing starter Vendor and never rewrites an existing row, so a Marker a Member corrected from any Event stays corrected, as [ADR 0008](docs/adr/0008-vendors-are-one-shared-record.md) intends. The reset calls it only to make sure the 16 Vendors exist. This narrows ADR 0008's line that the reset "restores the starter set": it restores the set's presence, not its Marker positions.

### 9.3 The 2-minute script

Chosen by Sah-Nikhil: a Ganesh utsav Brief first, then the seeded wedding. Recorded for the video, and repeatable by judges with the judge accounts.

| Time | Who and where | What happens |
|---|---|---|
| 0:00 | Title card | "Utsavvy plans Indian weddings, birthdays and festivals with your family and an AI planner." |
| 0:08 | judge-member, new Event | Types "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat." Utsavvy proposes 4 to 14 Sep 2027 and asks one chip question (Guests: 400). "Checking current prices in Pune" shows while the Estimates are researched. The Brief summary warns "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short." with "Raise the budget" and "Plan at my budget anyway". Tap "Plan at my budget anyway". The plan streams onto the Canvas, with daily aarti as one Function, "₹1,000 per household" beside the total, and Estimates labelled "Researched" with their sources. |
| 0:35 | judge-member, "Meera weds Rohan" | Pan across the Budget (₹25L, "Estimates sit near the low end"), the Timeline with late bookings pulled into this week, the wedding's run sheet, and the Vendors on the map. |
| 0:50 | Same | Paste "Sangeet: Veg 950/plate for 300 pax, live counters extra". A Proposal card offers a ₹950 per plate Quote for 300 Guests at the sangeet; Accept. The caterer's line shows Estimate, Listed price and Quote side by side. Mark the caterer Booked; "Use the ₹2.85L Quote as this line's amount?"; Yes. The Budget is ₹40,000 over and a Nudge offers "Suggest cuts". |
| 1:05 | Same, plus judge-viewer in a second window | Tap "Suggest cuts". The cuts arrive as a Proposal. The Viewer window shows it live with no Accept button; the Viewer leaves a Comment. judge-member taps Accept, and history shows "Utsavvy for judge-member". |
| 1:30 | judge-member | "Find some haldi decor ideas" shows 6 stock library photos. Tap two, then "Use for Theme" on one. The Theme gains its colours and a new decor Suggestion appears with an Estimate. |
| 1:45 | Phone | The same Event on a phone: the Chat first, the Canvas tab in Compact mode. End on the repo link. |

The 0:50 paste names the sangeet (changed on 29 Oct, S19b): the caterer serves the sangeet and the wedding, both with 300 Guests, so a Quote that names no Function can't say which line it prices, lands on every catering line, and Booked never asks to use it. Asking the Member which Function, when several fit, is a later product fix.

The 0:08 figures above are the table-path numbers. On production they come from the live estimate cascade ([ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)) and may differ; the beats stay the same. The rehearsal checks that the researched numbers are plausible and that ₹2,40,000 still falls below the minimum so the flag and "Plan at my budget anyway" appear. If it doesn't, Sah-Nikhil picks a smaller collection for the script's Brief (for example ₹800 per flat) at the rehearsal, and the narration quotes whatever the summary shows. The demo-path browser test runs with research stubbed, so it checks the table-path wording exactly. Sah-Nikhil confirmed on 2026-10-22 that the demo runs on live numbers: the reset doesn't pre-fill any prices for this beat.

Fallbacks for demo day: if the Anthropic credits run out, the Assistant moves to `gemini-3.8-flash` by itself, the web search beat is skipped, and Estimates come from the reference table, so 0:08 shows exactly the numbers above. The video is recorded on 28 Oct from the production URL after a reset.

## 10. Build schedule

The days, waves and exit criteria are in [ROADMAP.md](ROADMAP.md), and every issue is drafted in [docs/plans/build-slices.md](docs/plans/build-slices.md). In short: 22 Oct contract and the two data tasks, ending with the reference table frozen; 23 to 27 Oct about four slices a day in waves of up to three; 26 Oct also builds the demo Event's seed and reset (S19a) and rehearses the beats that exist on production, so 27 Oct holds only S17, S18, the final demo wiring (S19b), the CI run of the scripted Assistant cases and the full demo rehearsal on production; 28 Oct is for the video, the LinkedIn post and submitting.

**Dated cut decisions.** At 18:00 IST on 26 Oct the orchestrator checks the 26 Oct wave, decides with the table below, and posts the decision on the Slices phase issue and in its chat with Sah-Nikhil, who can overrule it. A slice still open then keeps going on the morning of 27 Oct and takes a slot before S17, S19b and S18, in that order; if S16 is open, cut-line item 6 moves to SHOULD at once. At 12:00 IST on 27 Oct, any of these slices still unmerged is dropped from the demo as the table says, and S19b starts on whatever has merged. At 14:00 IST, if S17 hasn't merged, the rest of the cut line moves to SHOULD in the section 1.5 order; if S18 hasn't started, Sah-Nikhil decides whether it lands after the rehearsal or moves to SHOULD (it is not in the demo script). The demo-path test has one step per beat, and a dropped beat's step is skipped by name. The scripted-case CI run and the rehearsal are never cut.

| Still open at 12:00 IST on 27 Oct | Demo beat in section 9.3 | S17 | S19b and the rehearsal | Scripted-case CI run |
|---|---|---|---|---|
| S12 Quotes | 0:50: no WhatsApp paste. Rohan types ₹2,85,000 into the sangeet catering line himself, the Budget goes ₹40,000 over and the Nudge offers "Suggest cuts". The line shows Estimate and Listed price only. | Starts without waiting for S12; its Quote-pushes-over case uses the typed amount instead | Walks the typed-amount version of 0:50 | Drops the WhatsApp Quote case |
| S14 first plan | 0:08: the Ganesh utsav Brief ends at the Brief summary with the "₹36,000 short" flag, then the video cuts to the seeded wedding. | No change | Skips the plan-streaming step | Drops the three end-to-end first-Brief cases; keeps their extraction cases |
| S15 map | 0:35: the pan shows the Shortlisted Vendor cards in the Vendors Section, no map. | No change | Skips the map step | No change |
| S16 Compact and phone | 1:45: dropped; the video ends on the desktop Canvas with the repo link. S16 still merges in v1, because Compact mode is the keyboard and screen-reader route (section 8). | No change | Skips the phone step | No change |
| S19a demo seed | 0:35 to 1:30 run on a wedding Event that judge-owner builds from the Jaipur Brief through S11 and S14, without the seeded Viewer Comment, Quote or history; the judge notes say it isn't reset nightly. | No change | Runs on that Event; reset steps skipped | No change |

### Human tasks

| When | Task | Time |
|---|---|---|
| 21 Oct | Give the go for GitHub setup and the build issues; connect Vercel; create the Clerk development instance (Consumer type) and activate its Convex integration; put `ANTHROPIC_API_KEY` and `GEOAPIFY_API_KEY` in the Convex dashboard (all done 22 Oct except `ANTHROPIC_API_KEY`, which is held back until 27 Oct, see section 4.11) | 30 min |
| 22 Oct | Hand-curate and approve the stock library photos (288 after the second pass, 12 per set for the vibe pick) and their tags with D1 (done 22 Oct) | 2 h |
| 22 Oct | Fill any starter-set category gap with an Instagram-only Vendor, checked by hand on its public profile (D2) | 20 min, if needed |
| By 23 Oct | Follow [docs/setup/google-cloud.md](docs/setup/google-cloud.md): the Google Cloud project with a billing account (Free Trial, not upgraded, if offered), Maps JavaScript and the Places UI Kit enabled, the browser key with website and API restrictions, the Map ID, daily caps where offered, a ₹100 budget alert, and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` in `.env.local` and the Vercel dashboard (S20 starts on 24 Oct) | 30 min |
| 22 Oct | Check the 16 starter Vendor cards against their sites, and approve or reject D2's reference-table adjustments by the end of the day (this freezes the table; done 22 Oct, both rejected) | 50 min |
| 22 Oct | Review the contract PR, pick the look (B or D, section 7.3) on the real components, and give the go to merge (look picked 22 Oct: D, with an Ornaments setting) | 45 min |
| By 24 Oct, before S21 starts | Create Utsavvy's Pinterest account (a free business account), then about 12 to 18 public boards on it, one per Function or theme (haldi decor, mehendi, sangeet stages, kids' party themes, Ganesh pandals and so on), save Pins to them, and give the orchestrator their URLs for `seed/pinterest-boards.json` | 2 h |
| About 25 Oct, when X8 starts | The Android device check: install Utsavvy from Chrome, then share one Pin, one board, one Instagram post and one Reel into it | 20 min |
| 26 Oct, morning | Create the three judge accounts in Clerk and put their IDs in Convex, before S19a merges (done 22 Oct) | 10 min |
| 28 Oct | Record the demo video, publish the LinkedIn post, submit | 2 h |

## 11. The LinkedIn post

Chosen by Sah-Nikhil: product hook first, the build process as proof.

- **Opening:** a 20-second screen recording of the Pune Ganesh utsav Brief turning into a plan, with captions.
- **First line:** "I built an AI planner for Indian weddings, birthdays and festivals in a week."
- **Three points on why it can be trusted:** every price says where it came from (an Estimate researched on the web with its sources, from Utsavvy's reference table, or marked as the Assistant's own estimate; a Listed price with its source; or a Quote), and they are never added together; risky changes wait for a family member's Accept; the whole family plans together, live, with roles for the elders who only want to look.
- **How it was built:** every decision planned in public GitHub issues (14 planning tickets under one map, and 13 ADRs), built by up to 3 AI agents in parallel worktrees, every PR reviewed by a second AI model before merging. Name the tools and models used.
- **Close:** the live link, the repo link, #PromptWars and #BuildInPublic.
- Write it in Sah-Nikhil's own voice, run it through `unslop`, add alt text to the video, and post on 28 Oct before submitting.
