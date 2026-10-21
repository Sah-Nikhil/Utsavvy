# Build slices for v1

Every build issue for v1, drafted from [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) in the build issue template from [build-workflow.md](../agents/build-workflow.md). Written by [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18) on 2026-10-21. The orchestrator creates the GitHub issues from this file after Sah-Nikhil's go; until then nothing here exists on GitHub.

## How to turn this into issues

- **Phases.** Three parent issues, each with a milestone of the same name: "Contract" (due 2026-10-22), "Slices" (due 2026-10-27) and "Submit" (due 2026-10-28). C0, D1 and D2 go under Contract; S1 to S19 and the X issues under Slices. Submit holds no build issues; its body is the Phase 2 checklist from [ROADMAP.md](../../ROADMAP.md).
- **Bodies.** Each issue below is a full body except the last two sections, which are the same for every issue. Append them as written:

```markdown
## Checks
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:e2e

## Done means
Checks pass locally, the PR is open with the template filled in, and the PR URL and head commit are reported to the orchestrator.
```

- **Phase line.** Replace each issue's `Blocked by` slice ids with the real issue numbers once they exist, and add the links with `gh issue edit <n> --add-blocked-by <m>`.
- **Labels.** As listed per issue. Give `ready` to issues whose blockers are all closed and `blocked` to the rest; the orchestrator moves them to `ready` as blockers close.
- **Must not touch** always includes the shared files from build-workflow.md (`package.json`, `bun.lock`, `convex/schema.ts`, `lib/types/`, `app/globals.css` and the token files, `components/ui/`, the three registries, `convex/lib/`, `convex/crons.ts`, `convex/convex.config.ts`, `.env.example`, root config, `.github/`) and every other open issue's owned paths. Issues only list extra exclusions.
- **Seams** are tested with `/tdd`: test first, see it fail, then the code. Expected values come from the design docs' worked examples, never recomputed the way the code computes them.
- **UI slices** add or extend one Playwright smoke test for their screen, with the axe check from the contract.
- **Scripted Assistant cases.** A slice that changes the Assistant's behaviour adds its cases to `evals/` and runs `bun run eval` for those cases before opening the PR. The result goes in the PR's Verification section; it is not a CI check.

## Folder map

The contract creates this layout, with stubs where a later slice fills in the code. Owned paths below refer to it.

| Path | What | Owner |
|---|---|---|
| `app/` | Routes. `app/events/[eventId]/` is the workspace shell. | C0, then the slice named per route |
| `components/ui/` | The restyled primitives | Shared (orchestrator) |
| `components/shell/` | Workspace header, panels host, desktop layout | C0, then S16 |
| `components/items/registry.tsx` | Item kind to component | Shared |
| `components/items/<kind>/` | One folder per Item kind | The slice for that kind |
| `components/chat/cards/registry.tsx` | Chat card kind to component | Shared |
| `components/<area>/` | `people`, `canvas`, `chat`, `history`, `comments`, `vendors`, `quotes`, `proposals`, `brief`, `inspirations`, `map`, `compact` | One slice each |
| `convex/schema.ts`, `convex/lib/`, `convex/crons.ts`, `convex/convex.config.ts` | Schema, access, writes, idempotency, time, models, settings | Shared |
| `convex/assistant/tools/index.ts` | Tool registry | Shared |
| `convex/<module>.ts`, `convex/assistant/tools/<group>.ts` | One module per slice | One slice each |
| `lib/types/`, `lib/access/`, `lib/format.ts` | Shared types, the permissions table, ₹ formatting | Shared |
| `lib/pricing/`, `lib/brief/`, `lib/canvas/` | Pure logic | S3, S11, S2 |
| `seed/` | Seed data | D1, D2, S19 |
| `evals/` | Scripted Assistant cases | S7 for the harness, each slice for its own case file |
| `e2e/` | Playwright tests | C0 for setup and the smoke test, each slice for its own spec |

## Waves

| Day | Wave | Issues | Size |
|---|---|---|---|
| Wed 22 Oct | Contract | C0 (alone in code), D1 and D2 (data only) | L + S + M |
| Thu 23 Oct | 1 | S1, S2, S5, then S3 when a slot frees | M + L + L + M |
| Fri 24 Oct | 2 | S4, S6, S7, S8 | L + M + L + M |
| Sat 25 Oct | 3 | S9, S10, S11, S13 | M + M + L + L |
| Sun 26 Oct | 4 | S12, S14, S15, S16 | M + L + M + M |
| Mon 27 Oct | 5 | S17, S18, S19, then the scripted-case CI run, fixes and the production rehearsal | M + S + M |

At most three issues are in progress at once. The orchestrator may start the fourth issue of a day as soon as a slot frees, if its blockers are closed and its paths don't overlap.

---

## C0. Contract: schema, shared types, app shell, access checks, versioned writes and CI

Labels: `contract`, `infra`, `auth`, `needs-human`. Wave: 22 Oct, alone. Size: L.

### Goal
A person can sign in and reach every page, possibly as a stub, and every later slice has the schema, types, helpers, registries, tokens and checks it builds on.

### Phase
Parent: Contract. Blocked by: none.

### Owned paths
Everything not owned by D1 or D2: root config (`package.json`, `bun.lock`, `tsconfig.json`, ESLint and Prettier config, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`), `.gitattributes`, `.editorconfig`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, `app/` (layout, route stubs, `proxy.ts`), `components/ui/`, `components/shell/`, the three registries with stubs, `app/globals.css` and tokens, `convex/schema.ts`, `convex/convex.config.ts`, `convex/crons.ts`, `convex/lib/`, `convex/assistant/tools/index.ts`, `lib/types/`, `lib/access/`, `lib/format.ts`, `e2e/` setup and `e2e/smoke.spec.ts`, and stub files for every slice module so imports resolve.

### Must not touch
`seed/` (D1, D2), `docs/`, `issues/`, `CLAUDE.md`, `AGENTS.md`, `orchestration.md`.

### Interfaces
- Uses: the stack in `CLAUDE.md`; IMPLEMENTATION_PLAN.md sections 4, 5, 6 and 7.
- Provides:
  - `convex/schema.ts` with every table in IMPLEMENTATION_PLAN.md section 5.1 to 5.5 (not the "later" ones).
  - `lib/types/`: `BriefExtraction`, `FirstPlanDraft`, `PricedEstimate`, `BudgetCheck`, `ThemeUpdate`, `ItemKind`, `ItemData`, `EntryFields`, `Actor`, `ProposedChange`, `Role`, `Action`.
  - `lib/access/permissions.ts`: `can(role: Role, action: Action): boolean` and the table it reads, one row per line of the roles.md permissions table.
  - `convex/lib/access.ts`: `requireAccess(ctx, eventId, action) => { membership, user }`, throwing `AccessDenied`.
  - `convex/lib/write.ts`: `memberWrite`, `memberInsert`, `memberSoftDelete`, `assistantWrite`, `assistantInsert`, `assistantSoftDelete` (section 4.4), all writing `changes` rows; `VersionConflict` error with the current value and version.
  - `convex/lib/idempotency.ts`: `once(ctx, key, fn)`.
  - `convex/lib/time.ts`: `istDay(timestamp)`, `istNow()`.
  - `convex/lib/models.ts` and `convex/lib/settings.ts`: model names and the thresholds (10%, 5, 24 hours, 30 seconds, 20 a day, 10 a day, 30 days, 0.8).
  - `lib/format.ts`: `formatINR(240000) === "₹2,40,000"`, `formatLakh(2500000) === "₹25L"`.
  - Registries: `components/items/registry.tsx` (`ItemKind` to component), `components/chat/cards/registry.tsx` (card kind to component), `convex/assistant/tools/index.ts` (tool name to definition), each pre-filled with stubs that later slices replace in their own files.
  - The workspace shell at `/events/[eventId]` with mount points for the Canvas, Chat, people panel, history panel, Event settings and Add Inspiration.
  - `convex/crons.ts` with the three daily crons from section 4.7, pointing at no-op internal stubs.
  - Scripts: `dev` (Next.js and `convex dev` side by side), `typecheck`, `lint` (ESLint, then `prettier --check`), `format`, `test` (Vitest), `test:e2e` (Playwright), `build` (`next build`), `eval` (Vitest on `evals/`, outside CI).
  - CI with five jobs named `typecheck`, `lint`, `test`, `build`, `e2e`, the last against the PR's Vercel preview.
  - `e2e/axe.ts`: `expectNoSeriousA11yViolations(page)`.
  - The UI packages, fonts and design tokens chosen in IMPLEMENTATION_PLAN.md section 7, with the primitives restyled to the chosen direction.

### Test seams
- `can(role, action)`: table-driven over every row of the roles.md permissions table for all four roles. Example: `can("viewer", "comment.add")` is true, `can("viewer", "chat.post")` is false, `can("coOwner", "coOwner.make")` is false, `can("owner", "event.delete")` is true.
- `requireAccess`: a member who left, a removed member and a blocked member are all refused; an active Viewer passes for `canvas.view` and fails for `canvas.edit`.
- `assistantWrite`: with the right `expectedVersion` it bumps the version and writes one `changes` row with before and after; with a stale one it throws `VersionConflict` carrying the current value; repeating the same `runId:toolCallId` returns the first result and writes nothing.
- `memberWrite`: two writes in a row both succeed (last write wins) and the history has both.
- `istDay`: 2026-10-21T19:00:00Z is IST day 2026-10-22.
- `formatINR`: ₹2,40,000; ₹25,00,000; ₹1,210.

### Acceptance criteria
- [ ] `bun install` from a clean clone works; `bun.lock` committed; versions match IMPLEMENTATION_PLAN.md section 4.12 or the PR explains each difference.
- [ ] Signing in with Google or email + password reaches `/events`; signed-out visits to `/events/*` redirect to sign-in.
- [ ] Every route in section 4.2 renders (stubs allowed) and the shell shows the mount points.
- [ ] `convex/schema.ts` deploys to a fresh Convex deployment; `convex/_generated/` committed.
- [ ] `.gitattributes` (`* text=auto eol=lf`, `*.cmd` and `*.bat` as CRLF) and `.editorconfig` (`end_of_line = lf`) committed; `bun run lint` fails on a CRLF file.
- [ ] CI runs the five jobs on the PR; the smoke test signs in with `@clerk/testing`, opens `/events` and passes the axe check.
- [ ] `.env.example` lists every variable in section 4.11 with a comment each and no values.
- [ ] Utsavvy's own component set is built with the `impeccable` skill from the references in IMPLEMENTATION_PLAN.md section 7.4 (Material Design 3 surfaces, state layers, shape scale and easing; the Gemini-style Assistant gradient built from the Theme palette); no control is left in stock shadcn styling.
- [ ] Both candidate token sets from section 7.3 (B, Ivory ledger, and D, Contemporary rangoli, with `--function-1` to `--function-8`) work behind a development-only switch, with `<SectionOrnament>` swapping B's line motif and D's corner pieces. Sah-Nikhil picks during the review (default: B with D's Function colours), and the PR keeps only the chosen set before merging.
- [ ] Components use semantic tokens only; lint flags hex colours outside `app/globals.css`.
- [ ] The three fonts render on the landing and the shell.
- [ ] The font check from section 7.1 is done and its screenshots are in the PR.

---

## D1. Data: curate the 4 vibe pick sets

Labels: `slice`, `inspirations`, `needs-human`. Wave: 22 Oct, beside C0. Size: S.

### Goal
The vibe pick has 12 approved Pexels images each for North Indian Hindu weddings, weddings in general, a child's birthday and Ganesh utsav.

### Phase
Parent: Contract. Blocked by: none. The PR is rebased on `main` after C0 merges, so its test runs in CI.

### Owned paths
`seed/vibe-sets.json`, `seed/vibe-sets.test.ts`, `scripts/curate-vibe-sets.ts`.

### Must not touch
Everything C0 owns.

### Interfaces
- Uses: the Pexels API (`PEXELS_API_KEY`), [inspirations.md](../design/inspirations.md) rules 21 to 23.
- Provides: `seed/vibe-sets.json`: `{ setKey: "wedding-north-indian-hindu" | "wedding-general" | "birthday-child" | "community-ganesh-utsav", images: { pexelsId, imageUrl, photographer, photographerUrl, pageUrl, alt }[12] }[4]`.

### Test seams
- The seed test: 4 sets, 12 images each, no duplicate `pexelsId` across sets, every field present, every URL on `images.pexels.com` or `www.pexels.com`.

### Acceptance criteria
- [ ] The script shortlists about 25 candidates per set through the Pexels search API (queries such as "indian wedding mandap marigold", "haldi ceremony", "kids birthday party decorations", "ganesh chaturthi pandal"), and writes a contact-sheet HTML page outside the repo for Sah-Nikhil.
- [ ] Sah-Nikhil approves 12 per set; only approved images go in the seed file.
- [ ] A check confirms every seeded image URL returns 200.
- [ ] No images are downloaded into the repo.

---

## D2. Data: collect the 16 Jaipur starter Vendors and check the reference table

Labels: `slice`, `vendors`, `needs-human`. Wave: 22 Oct, beside C0. Size: M.

### Goal
The app ships with 16 hand-checked Jaipur Vendors (6 Venues, 4 caterers, 3 decorators, 3 photographers), each with facts and Listed prices traceable to a sentence on the Vendor's own site, and the reference table's seed ranges are checked against those prices.

### Phase
Parent: Contract. Blocked by: none. Rebased after C0 merges.

### Owned paths
`seed/jaipur-vendors.json`, `seed/jaipur-vendors.test.ts`, `seed/README.md`, `scripts/collect-starter-set.ts`, `seed/reference-table-check.md`.

### Must not touch
Everything C0 owns, `lib/pricing/` (S3 owns the table code and takes the check from `seed/reference-table-check.md`).

### Interfaces
- Uses: [vendors.md](../design/vendors.md) (categories, Listed price fields, polite fetch rules, the quote check), Geoapify geocoding (`GEOAPIFY_API_KEY`), IMPLEMENTATION_PLAN.md section 2.
- Provides: `seed/jaipur-vendors.json` in the shape of the `vendors` and `listedPrices` tables (without IDs), and `seed/reference-table-check.md` listing, per reference-table row, the starter set's comparable Listed prices and a proposed low and high.

### Test seams
- The seed test: 16 Vendors with the category counts above; every Listed price's `sentence` contains its amount and a currency marker (₹, Rs or INR); every comparable price has one of the four units; every Vendor has `provenance` for each field it fills; no domain is on the directory blocklist from vendors.md.

### Acceptance criteria
- [ ] Candidates found by the agent's own web search; only each business's own website is read, never a directory, Google Places or a search snippet.
- [ ] The script fetches with the User-Agent `UtsavvyBot/1.0`, obeys `robots.txt`, waits about a second between requests to a host and reads at most 4 pages per site.
- [ ] The script checks each recorded sentence against the fetched page text after whitespace normalisation and drops any fact that fails.
- [ ] Addresses geocoded with Geoapify, filtered to India and biased to Jaipur; matches below 0.8 confidence or at city level are marked approximate.
- [ ] Each Vendor's `summary` is one line in our own words.
- [ ] `seed/README.md` records the own-site hit rate, fetch success rate, address match rate and how many facts the check dropped.
- [ ] Sah-Nikhil checks every card (name, address, Marker, every Listed price and its unit) and ticks it in `seed/README.md`.
- [ ] No Vendor photos are stored or linked.

---

## S1. Events, invite links and the four roles

Labels: `slice`, `auth`, `ready` once C0 merges. Wave: 23 Oct. Size: M.

### Goal
A Member can create an Event and becomes its Owner, share a Member link and a Viewer link, and anyone with a link who signs in joins with that role; the Owner and Co-owners manage people as roles.md describes.

### Phase
Parent: Slices. Blocked by: C0.

### Owned paths
`app/page.tsx`, `app/events/page.tsx`, `app/join/`, `components/people/`, `convex/events.ts`, `convex/people.ts`, `e2e/people.spec.ts`.

### Interfaces
- Uses: `requireAccess`, `can`, `memberWrite`, the shell's people-panel mount point.
- Provides: `api.events.create({ name, eventType })` (creates the Event, its Owner membership, the four starting Sections and empty Budget, Timeline and Vendor checklist Items at their starting positions, the two link tokens and the Agent thread), `api.events.listMine()`, `api.events.get({ eventId })`, `api.people.join({ token })`, `api.people.list({ eventId })`, `api.people.setRole`, `api.people.remove`, `api.people.unblock`, `api.people.resetLink`, `api.people.leave`, `api.events.setOwnerLabel`, `useMembership(eventId)` for the UI.

### Test seams
- `join`: a Member link makes a Member, a Viewer link a Viewer; someone already in keeps their role; a removed person gets "You were removed from this Event."; a full Event (25 people) gets "This Event is full. Ask the Owner to make room."
- `resetLink`: the old token stops working at once.
- `setRole`: a Co-owner can switch Member and Viewer but not make a Co-owner; nobody can change the Owner.
- `remove`: the person's access ends at once, their status is `removed` and `blocked` is true; `unblock` lets them rejoin by link.
- `leave`: the Owner is refused until ownership moves; anyone else leaves and shows as "(left)".
- Worked example: the wedding in roles.md (Meera creates and picks Host, Rohan and Aditi join as Members, Papa as Viewer, Meera makes Rohan Co-owner, Rohan removes Aditi, Meera unblocks her).

### Acceptance criteria
- [ ] Creating an Event takes a name and an Event type and opens its workspace; the Brief flow starts from there (S11).
- [ ] The people panel lists people by role with the Owner or Host label, "(left)" tags, a Blocked section for Owners and Co-owners, and the links with copy and reset buttons only for them.
- [ ] Every change here writes a `changes` row with `op: "people"`.
- [ ] The landing page explains Utsavvy in two lines and has sign in and "Open the demo Event".
- [ ] Smoke test: create an Event, open the Viewer link as a second test user, see the Viewer in the list.

---

## S2. The freeform Canvas with Sections

Labels: `slice`, `canvas`. Wave: 23 Oct. Size: L.

### Goal
Members see one shared freeform Canvas per Event: pan and zoom, four starting Sections and custom ones, Items at shared positions that move live for everyone, new Items placed in free space, presence, selection, the Function filter and the Assistant's pointing.

### Phase
Parent: Slices. Blocked by: C0.

### Owned paths
`components/canvas/`, `lib/canvas/`, `convex/canvas.ts`, `e2e/canvas.spec.ts`.

### Interfaces
- Uses: the Canvas library from IMPLEMENTATION_PLAN.md section 7, the Item registry, `memberWrite`, presence, `highlights`.
- Provides: `<Canvas eventId>` for the shell; `placeInFreeSpace(section, items, size) => position` in `lib/canvas/placement.ts`; `api.canvas.moveItem`, `api.canvas.createSection`, `api.canvas.renameSection`, `api.canvas.deleteSection`; `useSelection()` returning the selected Item, Entry or passage for Chat and Comments; `useFunctionFilter()`; `<ItemFrame>` that every Item component renders inside (title bar, kind badge, Comment count slot, presence avatar slot, highlight ring).

### Test seams
- `placeInFreeSpace`: never overlaps an existing Item in the Section; fills left to right then down; grows the Section frame when it is full. Example: a Section with Items at (0,0) and (320,0), width 640, new 300 × 200 Item goes to (0, 220) with a 20 px gap.
- `deleteSection`: a custom Section's Items move back to their starting Section, placed in free space; starting Sections can be deleted only by the Owner and Co-owners.
- `renameSection`: a Member can rename a starting Section unless `startingSectionRenameBlocked`.

### Acceptance criteria
- [ ] First, the React Flow check from ADR 0010, reported in the PR: one rich Budget Item, a selectable Entry, a selected Hindi passage, an embed, Section containment, a camera pan for one Member only, and 150 mixed Items on a laptop without visible lag. If it fails, stop and report to the orchestrator before switching to our own canvas.
- [ ] Item content is `nodrag`, `nopan` and `nowheel` where needed; Items move by their handle.
- [ ] Two browsers on one Event see a drag in one appear in the other within about a second; the move is in the history.
- [ ] New Items from any source land highlighted in free space in their starting Section, never on top of another Item.
- [ ] Presence: dots in the header and an avatar on the Item or Entry each person has selected.
- [ ] Selecting an Item, an Entry row or a text passage exposes it through `useSelection()`.
- [ ] The Function filter dims Items not for that Function.
- [ ] A highlight from the Assistant rings the targets for everyone and pans only the asker's view.
- [ ] The Canvas is keyboard-operable (focus moves between Items, Enter opens) and the smoke test passes axe.

---

## S3. The reference table and the pricing engine

Labels: `slice`, `assistant`. Wave: 23 Oct. Size: M.

### Goal
Every Estimate in the product comes from one pure pricing engine over the reference table, by City tier, with the Budget check bands, Contingency, rounding and Timeline dates from first-brief.md.

### Phase
Parent: Slices. Blocked by: C0. Reads D2's `seed/reference-table-check.md` if merged; otherwise uses the first-brief seed values and the orchestrator opens a follow-up for the check.

### Owned paths
`lib/pricing/`, `lib/pricing/*.test.ts`.

### Interfaces
- Uses: `FirstPlanDraft`, `PricedEstimate`, `BudgetCheck` from `lib/types/`.
- Provides: `referenceTable` (rows keyed by category, with unit, low and high for tier Y, the Source note and which Vendor categories and units feed the row), `cityTier(cityName) => "X" | "Y" | "Z"`, `priceEntry(category, quantity, tier) => { low, high }`, `pricePlan(draft, { tier, budget, contingencyShare }) => { entries: PricedEstimate[], budgetCheck: BudgetCheck, note }`, `budgetCheckFixes(draft, ...)` (the three fixes with their new minimums), `deadlineDate(leadKey, functionDate, today) => { date, late, priority }`, `perHousehold(total, households)`.

### Test seams
- The three worked examples in first-brief.md, exactly as listed in IMPLEMENTATION_PLAN.md section 8, with the table pinned.
- The ₹15L variant: flagged about ₹4.6L short; the fixes' new minimums (drop the reception about ₹14.2L; 200 and 150 Guests about ₹15.5L; raise to ₹19.6L); "plan anyway" scales Entries to about 76% of their lows.
- Above high: every Entry at its high, Contingency 10% of them, the rest Unallocated.
- Rounding: Entries to the nearest ₹1,000, per-plate prices to ₹10, differences into the Contingency, so the total always equals the budget.
- Tiers: Jaipur Y, Pune X, an unlisted town Z (×0.8).
- Timeline: the Jaipur wedding's late bookings get P1, P2 and P3 dates within 7, 14 and 21 days of 2026-10-21; transport is due 13 Nov 2026; a month-only date is the 15th.

### Acceptance criteria
- [ ] No floating-point drift in totals (amounts in whole rupees).
- [ ] Every Estimate carries a basis string such as "Y-tier range ₹1,000-₹2,000 per plate, Utsavvy reference table, Oct 2026".
- [ ] The table's Source column cites the starter set's Listed prices where D2 found them; rows still unsourced keep the † note.
- [ ] No Convex or React imports: the engine runs in Convex and in the browser.

---

## S4. Budget, Timeline and Vendor checklist Items, Notes and Suggestions

Labels: `slice`, `canvas`. Wave: 24 Oct. Size: L.

### Goal
Members read and edit the Budget (Functions, Event-wide, Contingency, Unallocated, the Budget check note), the Timeline (deadlines and each Function's run sheet), the Vendor checklist, Notes and Suggestions, with Assumptions tagged and confirmable in one tap.

### Phase
Parent: Slices. Blocked by: S2, S3.

### Owned paths
`components/items/budget/`, `components/items/timeline/`, `components/items/checklist/`, `components/items/note/`, `components/items/suggestion/`, `convex/entries.ts`, `convex/suggestions.ts`, `convex/notes.ts`, `e2e/plan-items.spec.ts`.

### Interfaces
- Uses: `<ItemFrame>`, `memberWrite`, `pricePlan`, `priceEntry`, `formatINR`.
- Provides: `api.entries.add`, `api.entries.update`, `api.entries.tick`, `api.entries.remove`, `api.entries.confirmAssumption`, `api.suggestions.addToPlan` (prices it and creates its budget Entry and Timeline Entry), `api.suggestions.dismiss`, `api.notes.add`, `api.notes.update`; `budgetRollup(entries) => { byFunction, eventWide, contingency, unallocated, total, overBy }` used by Nudges and the Budget comparison.

### Test seams
- `budgetRollup`: Function totals + Event-wide + Contingency = Event total for the Jaipur wedding; `overBy` is ₹40,000 after the sangeet catering line goes from ₹2,45,000 to ₹2,85,000 in the demo seed.
- `addToPlan`: "Rajasthani folk musicians at the sangeet dinner" becomes one budget Entry priced from its cost category and one Timeline Entry; the Suggestion's status is `added`.
- `confirmAssumption`: removes the field from `assumed` and writes history.
- A Member editing an Entry's amount sets `editedByMember`.

### Acceptance criteria
- [ ] Every price shows a labelled badge (Estimate with its basis on hover or tap); amounts use lakh grouping.
- [ ] The Budget shows the tight or below-minimum note from the Budget check, and the per-household share for community Events.
- [ ] Late Timeline Entries show "late" and their note; run sheets are grouped per Function with times.
- [ ] The checklist status (to find, shortlisted, booked) is worked out from Vendor links (zero links until S9).
- [ ] Assumed values show an "assumed" tag with one-tap confirm or change.
- [ ] Smoke test renders the three Items and a Suggestion and passes axe.

---

## S5. The Chat, the run queue and Stop

Labels: `slice`, `chat`, `assistant`. Wave: 23 Oct. Size: L.

### Goal
Every Member sees the Event's Chat live, including the Assistant's reply as it streams; one run happens at a time with the others queued; the asker can stop a run, anyone after 30 seconds; a Member can send a message with "Don't reply" on.

### Phase
Parent: Slices. Blocked by: C0.

### Owned paths
`components/chat/` (except `cards/registry.tsx`), `convex/chat.ts`, `convex/runs.ts`, `convex/assistant/agent.ts`, `e2e/chat.spec.ts`.

### Interfaces
- Uses: `@convex-dev/agent`, `requireAccess`, `chatAnnotations`, the card registry, the tool registry (stubs until S7), `convex/lib/models.ts`.
- Provides: `api.chat.send({ eventId, text, dontReply, pointing })`, `api.chat.list`, `api.runs.cancelQueued`, `api.runs.stop`, `internal.runs.startNext`, `internal.chat.postSystem({ eventId, card })` for Nudges, Proposal cards and notices, `<ChatPanel eventId>`, the "Utsavvy is replying to Rohan" indicator, and the composer that attaches `useSelection()` as pointing.

### Test seams
- Two messages sent in the same second run in order; the second shows "Queued: Utsavvy answers this next" and starts after the first ends.
- `stop` by the asker works at once; by another Member it is refused before 30 seconds and works after; the Chat shows "Stopped by Aditi" and the next queued run starts.
- `cancelQueued` by the sender removes the run; by anyone else it is refused.
- A Don't-reply message starts no run; a pointed message always does.
- A Viewer's `send` is refused.

### Acceptance criteria
- [ ] Two browsers see the same stream; a browser that reloads mid-reply catches up.
- [ ] The Don't-reply toggle sits beside Send, resets after each message, and its tooltip says the Assistant still reads the message.
- [ ] Chat replies are announced through a polite live region.
- [ ] A failed run shows a short notice instead of an empty reply.
- [ ] Smoke test: send a message, see the streamed reply (the e2e environment uses a stub model so the test spends no credits).

---

## S6. Edit history, Restore and Undo all

Labels: `slice`, `canvas`. Wave: 24 Oct. Size: M.

### Goal
Everyone sees who changed what, grouped per Assistant reply ("Utsavvy for Meera: Plan the sangeet (8 changes)"); Members can Restore any earlier value and Undo all of one reply.

### Phase
Parent: Slices. Blocked by: S2.

### Owned paths
`components/history/`, `convex/history.ts`, `e2e/history.spec.ts`.

### Interfaces
- Uses: `changes`, `memberWrite`, `memberSoftDelete`, the shell's history mount point, `useSelection()` to highlight on click.
- Provides: `api.history.list({ eventId, cursor })`, `api.history.restore({ changeId })`, `api.history.undoGroup({ groupKey })`, `<UndoAllButton groupKey>` for the Chat reply (S7 places it).

### Test seams
- `restore` puts back the `before` value as a new change, including a soft-deleted Item.
- `undoGroup` on 8 changes where Rohan later edited one restores 7 and returns "Undid 7 of 8; Rohan has since edited Sangeet DJ".
- Labels: Assistant changes show "Utsavvy for <Member>", accepted Proposals "Utsavvy for Rohan, accepted by Meera", Comment-origin groups add "(from a Comment)".
- Viewers can list but `restore` and `undoGroup` are refused.

### Acceptance criteria
- [ ] Clicking a history row highlights its Item on the Canvas.
- [ ] People changes (role switches, removals, link resets) appear with who did them.
- [ ] Smoke test passes axe.

---

## S7. The Assistant's Canvas tools

Labels: `slice`, `assistant`. Wave: 24 Oct. Size: L.

### Goal
A Member asks the Assistant to change the Canvas and it does, safely: small asked-for changes apply at once through version-checked, idempotent tools; it points at what it changed; it answers price questions with cited web search on Claude; outside content stays data; it replies in the asker's language.

### Phase
Parent: Slices. Blocked by: S5, S3.

### Owned paths
`convex/assistant/instructions.ts`, `convex/assistant/outside.ts`, `convex/assistant/amounts.ts`, `convex/assistant/tools/core.ts`, `components/chat/cards/citations/`, `evals/harness.ts`, `evals/core.eval.ts`, `e2e/assistant.spec.ts`.

### Interfaces
- Uses: `assistantWrite`, `assistantInsert`, `requireAccess`, `priceEntry`, `highlights`, the tool registry, `<UndoAllButton>` (S6; placed on each reply once S6 merges).
- Provides: the tools `readCanvas`, `readChat`, `addEntry`, `updateEntry`, `addItem`, `updateItem`, `moveItem`, `createSection`, `addComment`, `pointAt` and the `webSearch` provider tool, registered in the tool registry; `wrapOutside(content, { source, addedBy })`; `checkMemberStatedAmount(amount, messageText) => boolean`; `exceedsProposalThresholds(changes, budgetTotal) => string | null`; the eval harness (`runCase({ seed, messages, expect })`).

### Test seams
- `checkMemberStatedAmount`: ₹15,000 is accepted for "Add a mehendi artist, around ₹15,000" and for "15k"; ₹18,000 is refused for the same message.
- `exceedsProposalThresholds`: a deletion, a Budget total change, a shift of more than 10% of the total and a change touching 6 Entries all return a reason; adding one ₹15,000 Entry returns null.
- A tool write with a stale version re-reads and retries once; if the Member's new value contradicts the request, the tool result tells the model to ask ("Aditi just changed the Caterer line to ₹2,40,000. Still want ₹2,10,000?").
- Repeating a tool call with the same `runId:toolCallId` writes nothing new.
- `webSearch` is not offered when the run's model is not Claude.
- A run for a removed Member stops writing at the next tool call.

### Acceptance criteria
- [ ] Scripted cases pass with `bun run eval`: simple request, collision, two asks, side conversation, the hidden-instruction Vendor page (adds facts, books nothing, adds "That page contained instructions aimed at me; I ignored them."), Hinglish, English and Devanagari replies, a Pune per-plate web search with citations, and an attempt to write an amount nobody gave.
- [ ] Replies are short, warm and practical, with ₹ in lakh grouping and no Estimate called a Listed price or a Quote.
- [ ] Web search answers show their citations and a "Save as Note" action that keeps them.
- [ ] Tool results never include another Event's data or any secret.

---

## S8. Comments

Labels: `slice`, `canvas`. Wave: 24 Oct. Size: M.

### Goal
Everyone, Viewers included, can Comment on an Item, an Entry or a highlighted passage, reply in threads and resolve their own Comments.

### Phase
Parent: Slices. Blocked by: S2.

### Owned paths
`components/comments/`, `convex/comments.ts`, `e2e/comments.spec.ts`.

### Interfaces
- Uses: `useSelection()`, `<ItemFrame>`'s Comment count slot, `requireAccess`.
- Provides: `api.comments.add({ target, body, rootId })`, `api.comments.edit`, `api.comments.resolve`, `api.comments.listForItem`, `<CommentThread rootId>` (S17 adds @Utsavvy replies to it), `markPassagesChanged(itemId, field, newText)` called when Item text changes.

### Test seams
- A Viewer can add, edit and resolve their own Comment, and can't edit someone else's.
- Editing a commented passage away keeps the Comment on the Item, quoting the original wording, marked "text changed".
- A Comment by someone who left shows "(left)".

### Acceptance criteria
- [ ] Comment counts show on Items and Entries; threads open beside the Item.
- [ ] Selecting text in a Note or an Entry label and choosing "Comment" anchors to the passage.
- [ ] Smoke test passes axe.

---

## S9. Vendors: starter set, cards, shortlisting and checklist links

Labels: `slice`, `vendors`. Wave: 25 Oct. Size: M.

### Goal
Members see the seeded Jaipur Vendors as cards (in the Chat and on the Canvas), shortlist them onto the Vendors Section, link them to Vendor checklist Entries and set each link's status.

### Phase
Parent: Slices. Blocked by: S4, S7, D2.

### Owned paths
`components/vendors/`, `components/items/shortlisted-vendor/`, `components/chat/cards/vendor-cards/`, `convex/vendors.ts`, `convex/assistant/tools/vendors.ts`, `evals/vendors.eval.ts`, `e2e/vendors.spec.ts`.

### Interfaces
- Uses: `seed/jaipur-vendors.json`, `priceEntry` (Estimate on cards without a comparable Listed price), `assistantWrite`, `memberWrite`.
- Provides: `internal.vendors.loadStarterSet` (idempotent, by domain), `api.vendors.findKnown({ eventId, category, functionKey })`, `api.vendors.shortlist({ eventId, vendorId, checklistEntryId })`, `api.vendors.setLinkStatus`, `api.vendors.forEvent` (the Event's Shortlisted Vendors with their private layer), the tools `findVendors`, `shortlistVendor`, `setVendorStatus`, `<VendorCard vendor eventLayer>`, `comparableForFunction(listedPrice, guests) => { low, high, label }`.

### Test seams
- Two Events shortlist the same Vendor; each sees only its own links, statuses and Quotes.
- Shortlisting creates one Shortlisted Vendor per Event even when it serves two Entries; each link has its own status.
- The checklist status: to find with no active link, shortlisted once one is active, booked once one link is Booked; Booking marks the Entry done.
- `comparableForFunction`: Parampara's ₹1,200 to ₹3,500 per plate for 300 Guests gives "₹3.6L to ₹10.5L, from Listed price"; Vinayak's starting ₹250 gives "from ₹250/plate (starting price)"; "₹500 per hand" is not comparable.
- "Find Vendors" outside Jaipur returns none, and the Assistant offers Chat web search.

### Acceptance criteria
- [ ] Cards show provenance per section ("from example.in · seen 21 Oct 2026"), the exact sentence on hover or tap, the Assistant's one-line summary, a neutral category illustration and "Compare on WedMeGood" for the city and category.
- [ ] No Vendor photo or search thumbnail appears anywhere.
- [ ] Scripted case: "show me caterers for the sangeet" returns starter-set caterer cards in the Chat; "add the second one" shortlists it.
- [ ] Smoke test passes axe.

---

## S10. Proposals

Labels: `slice`, `assistant`, `chat`. Wave: 25 Oct. Size: M.

### Goal
Risky or unasked changes arrive as a Proposal card that any Member can accept or reject, all or nothing, while nothing it touches has changed and for 24 hours.

### Phase
Parent: Slices. Blocked by: S7.

### Owned paths
`components/proposals/`, `components/chat/cards/proposal/`, `convex/proposals.ts`, `convex/assistant/tools/propose.ts`, `evals/proposals.eval.ts`, `e2e/proposals.spec.ts`.

### Interfaces
- Uses: `assistantWrite` (applies changes on Accept), `exceedsProposalThresholds`, `ctx.scheduler.runAt`, `internal.chat.postSystem`.
- Provides: the `propose` tool, `api.proposals.accept`, `api.proposals.reject`, `api.proposals.askAgain`, `internal.proposals.expire`, `<ProposalCard proposalId>` (also used in Comment threads by S17), and the op handlers `deleteEntry`, `deleteItem`, `setBudgetTotal`, `addQuote` (S12 supplies its handler), `updateTheme` (S13), `changeEssential` (S14).

### Test seams
- Accept applies every change in one mutation and history shows "Utsavvy for Rohan, accepted by Aditi (3 changes)".
- If any touched document's version changed, Accept is refused and the card shows "Out of date: Meera changed this since" with "Ask again".
- A new Proposal from a reply ("keep the drone shoot") replaces the old one, which shows "Replaced".
- 24 hours after posting, the card closes as expired.
- Viewers see the card without Accept or Reject; their calls are refused.

### Acceptance criteria
- [ ] The card lists each change in plain words with before and after ("Decor ₹3,00,000 → ₹2,20,000").
- [ ] Closed cards stay in the Chat, greyed, with their reason.
- [ ] Scripted cases: the risky request (decor cut plus deleting "Drone shoot" arrives as one Proposal) and the collision case.
- [ ] Smoke test passes axe.

---

## S11. The first Brief: intake, chips, Brief summary and the Budget check

Labels: `slice`, `assistant`, `chat`. Wave: 25 Oct. Size: L.

### Goal
A Member describes the Event in their own words; the Assistant asks only for missing essentials as chips; the Brief summary in the Chat shows every field, the Assumptions and the Budget check, all editable, ending in "Make my plan".

### Phase
Parent: Slices. Blocked by: S3, S5.

### Owned paths
`components/brief/` (except `vibe-pick/`), `components/chat/cards/brief/`, `lib/brief/`, `convex/brief.ts`, `evals/brief.eval.ts`, `e2e/brief.spec.ts`.

### Interfaces
- Uses: structured output for `BriefExtraction`, `cityTier`, `pricePlan`, `budgetCheckFixes`, `internal.chat.postSystem`, Geoapify (city centre).
- Provides: `nextQuestion(extraction) => ChipQuestion | null` (first-brief order, seven at most), `festivalDates(kind, year)` with Drik Panchang sources, `defaultFunctions(tradition)`, `assumeFunctionDetails(...)` (dates relative to the wedding day, Guest shares 20%, 40%, 75%, 100%), `api.brief.submitText`, `api.brief.answerChip`, `api.brief.editField`, `api.brief.summary`, and the "Make my plan" hook S14 fills in, plus the vibe-pick mount point S18 fills in.

### Test seams
- Extraction cases (scripted, with the model): the three first-brief Briefs produce the extractions listed there; unknown fields are null.
- `nextQuestion`: the Jaipur wedding asks only Q6 (Tradition) then Q7; Aarav's birthday asks none of Q4 (Guests assumed at 60); the Ganesh utsav asks Q4 (Guests) after confirming 4 to 14 Sep 2027.
- `festivalDates("ganesh-utsav", 2027)` returns 4 to 14 Sep 2027.
- `assumeFunctionDetails` for the Jaipur wedding gives the Assumptions listed in first-brief.md (mehendi 13 Feb evening, haldi 60 Guests, and so on).
- Budget check: the ₹15L variant shows the flag, the three fixes with their previews, and "Plan at my budget anyway".
- A city not in the X or Y list is Z, shown as the Assumption "treated as a smaller city".

### Acceptance criteria
- [ ] The opening line matches first-brief.md.
- [ ] Chips have a "type my own" option and are keyboard-operable.
- [ ] Every field on the Brief summary is editable in place, and edits re-run the Budget check.
- [ ] Smoke test: the Ganesh utsav Brief reaches the summary with the "₹36,000 short" flag (stub model in e2e).

---

## S12. Quotes and the Budget comparison

Labels: `slice`, `vendors`. Wave: 26 Oct. Size: M.

### Goal
Members record Quotes on a Shortlisted Vendor's checklist links, by form or by pasting a WhatsApp message (which becomes a Proposal), and every budget Entry shows its Estimate, the comparable Listed prices and the current Quotes side by side, never mixed.

### Phase
Parent: Slices. Blocked by: S9, S10.

### Owned paths
`components/quotes/`, `convex/quotes.ts`, `convex/assistant/tools/quotes.ts` (the `addQuote` op handler), `evals/quotes.eval.ts`, `e2e/quotes.spec.ts`; may change `components/items/budget/` and `components/items/shortlisted-vendor/` (both merged by then).

### Interfaces
- Uses: `vendorLinks`, `comparableForFunction`, `budgetRollup`, Convex file storage, `propose`.
- Provides: `api.quotes.add`, `api.quotes.listForLink`, `api.quotes.useAsAmount({ entryId, quoteId })`, `quoteForEntries(quote, entries) => amount` (a Quote that names Functions compares with those Functions' Entries; one that names none with all Entries its checklist Entry pays for).

### Test seams
- Adding a Quote moves a Considering or Contacted link to Quoted; a Booked link stays Booked.
- Pasting "Veg 950/plate for 300 pax, live counters extra" produces one Proposal: ₹950 per plate, 300 Guests, Function sangeet, note "live counters extra", received today. Accepting saves the Quote; the line shows Estimate ₹3L to ₹6L, the Listed price and Quote ₹2.85L side by side.
- Booking a Vendor asks "Use the ₹2.85L Quote as this line's amount?"; only a Member's yes changes the planned amount.
- The planned amount never changes on its own.

### Acceptance criteria
- [ ] Over and under show in colour against the planned amount and the Function's budget, with text as well as colour.
- [ ] Quote attachments (image or PDF) upload to Convex storage and open only for the Event's people.
- [ ] Scripted case: the WhatsApp paste.
- [ ] Smoke test passes axe.

---

## S13. Inspirations: Pexels, uploads and the Theme

Labels: `slice`, `inspirations`. Wave: 25 Oct. Size: L.

### Goal
Members add Inspirations from a Pexels search (in the Add Inspiration panel or as a tappable strip in the Chat) and from uploads, use any image for the Theme, and get 1 to 3 decor Suggestions priced from the reference table after a Theme change.

### Phase
Parent: Slices. Blocked by: S2, S7.

### Owned paths
`components/inspirations/`, `components/items/inspiration/`, `components/chat/cards/stock-strip/`, `convex/inspirations.ts`, `convex/pexels.ts`, `convex/assistant/tools/images.ts`, `evals/inspirations.eval.ts`, `e2e/inspirations.spec.ts`.

### Interfaces
- Uses: `PEXELS_API_KEY`, `pexelsCache`, Convex file storage, `node-vibrant`, the helper model for descriptions, `placeInFreeSpace`, `priceEntry`, the `updateTheme` op of `propose`.
- Provides: `api.pexels.search({ query, page })` (24-hour cache), `api.inspirations.addFromPexels`, `api.inspirations.generateUploadUrl`, `api.inspirations.addUpload`, `api.inspirations.useForTheme`, `api.inspirations.tag`, `api.inspirations.remove`, `internal.inspirations.describe` (once at save), `internal.inspirations.purgeDeleted` (the 30-day cron), `mergeTheme(theme, update) => theme` (3 to 5 colours, 2 to 4 style words, 3 to 6 decor keywords), the tools `searchStockImages`, `updateTheme`, `tagInspiration`.

### Test seams
- `mergeTheme`: never more than 5 colours, 4 style words or 6 decor keywords; new ones replace the oldest.
- "Use for Theme" from a Member applies at once with the Chat line "Utsavvy updated the Theme for Meera: + teal #1F6F78, + 'lantern-lit'"; an Assistant-initiated Theme change goes through `propose`.
- A Theme change never edits existing Entries; it offers 1 to 3 decor Suggestions, each with an Estimate from the table.
- Upload rules: JPEG, PNG and WebP only, up to 10 MB, 10 at a time; with the Event's upload rights setting off, each batch needs the tick.
- `purgeDeleted` removes stored files 30 days after deletion and leaves Pexels links alone.

### Acceptance criteria
- [ ] Every Inspiration shows its credit ("Photo by Anil Sharma on Pexels", both linked; "Uploaded by Meera").
- [ ] Paste from the clipboard and drag and drop both upload; the browser shrinks images to 2048 px first.
- [ ] Asking "find some haldi decor ideas" shows about 6 results; only tapped ones land, tagged haldi.
- [ ] The panel has Search and Upload tabs only (Paste a link arrives with X2, Generate with X3).
- [ ] The footer has the "Report content" address.
- [ ] Scripted cases: Pexels from the Chat, rights setting off, pointing at an image ("would this stage work for 300 Guests?").
- [ ] Smoke test passes axe, including alt text on every image.

---

## S14. The first plan

Labels: `slice`, `assistant`, `canvas`. Wave: 26 Oct. Size: L.

### Goal
"Make my plan" turns the Brief into the first plan on the Canvas, streamed Section by Section: Functions, the priced Budget, the Timeline with late bookings pulled forward, run sheets, the Vendor checklist and 5 to 8 Suggestions. Changing an essential afterwards arrives as one Proposal.

### Phase
Parent: Slices. Blocked by: S4, S7, S11.

### Owned paths
`convex/plan.ts`, `components/chat/cards/plan-progress/`, `evals/plan.eval.ts`, `e2e/plan.spec.ts`; may change `components/brief/` (S11, merged) to wire "Make my plan".

### Interfaces
- Uses: structured output for `FirstPlanDraft`, `pricePlan`, `deadlineDate`, `assistantInsert`, `placeInFreeSpace`, `propose` with the `changeEssential` op.
- Provides: `internal.plan.generate({ eventId, runId })`, `validateDraft(draft) => errors[]`, `applyPlan(ctx, eventId, priced)`, `diffEssentialChange(event, change) => ProposedChange[]` (keeps Entries with `editedByMember` or Quotes).

### Test seams
- `validateDraft` rejects a draft with an amount, an unknown category or a run sheet outside 6 to 10 Entries.
- Applying the Jaipur wedding's fixed draft gives the worked example's numbers, 14 checklist Entries all "to find" and the late-booking dates.
- `diffEssentialChange` for 300 to 400 Guests raises catering and Venue lines, keeps a Member-edited line, flags Venue capacity to recheck, and is one Proposal.
- Applying is idempotent per run: a retried run doesn't duplicate Entries.

### Acceptance criteria
- [ ] The Chat shows progress while each Section fills ("Budget done, now the Timeline").
- [ ] Every Assumption is tagged; prices are Estimates with their basis.
- [ ] Scripted cases: the three first Briefs end to end, checked for structure (Functions, Entry counts, bands), not for exact wording.
- [ ] Smoke test on the Ganesh utsav (stub model): the Canvas shows daily aarti as one Function with a date range and "₹1,000 per household".

---

## S15. The Vendor map

Labels: `slice`, `vendors`. Wave: 26 Oct. Size: M.

### Goal
Members see their Shortlisted Vendors on a map coloured by status, other shared Vendors in the city as faint Markers, filter by category and by a Function's needs, and drag an approximate Marker into place.

### Phase
Parent: Slices. Blocked by: S9.

### Owned paths
`components/map/`, `convex/map.ts`, `e2e/map.spec.ts`.

### Interfaces
- Uses: `maplibre-gl`, `react-map-gl/maplibre`, `NEXT_PUBLIC_MAP_STYLE_URL`, `api.vendors.forEvent`, `memberWrite` on `vendors.marker`.
- Provides: `<VendorMap eventId>` (as a Canvas Item in the Vendors Section and full-screen), `api.map.moveMarker({ vendorId, lat, lng })`, `filterForFunction(vendors, fn, budgetEntry)`.

### Test seams
- `filterForFunction`: for the sangeet with 300 Guests, Venues with capacity under 300 and Listed prices above the budget line drop out; Vendors without a comparable price stay, marked "no price".
- `moveMarker` clears `approximate`, updates the shared record and writes history in the moving Event.

### Acceptance criteria
- [ ] The map centres on the Event's city and stays zoomed to it.
- [ ] Approximate Markers are hollow and labelled "approximate"; Vendors without an address are listed beside the map.
- [ ] OpenFreeMap, OpenStreetMap and Geoapify attribution show near the map.
- [ ] Every Marker is reachable from the list beside the map by keyboard; smoke test passes axe.

---

## S16. Compact mode and the phone layout

Labels: `slice`, `canvas`. Wave: 26 Oct. Size: M.

### Goal
On desktop, Members can switch to Compact mode (the same Items in collapsible Sections, by kind or by Function, with personal order and collapse state); on a phone, the Chat is the main view and the Canvas tab is Compact mode.

### Phase
Parent: Slices. Blocked by: S2, S4, S8.

### Owned paths
`components/compact/`, `components/shell/`, `app/events/[eventId]/`, `app/settings/`, `convex/viewPrefs.ts`, `e2e/mobile.spec.ts`.

### Interfaces
- Uses: the Item registry (the same Item components), `useSelection()`, the Event defaults.
- Provides: `<CompactCanvas eventId grouping>`, the responsive shell, `api.viewPrefs.get` and `api.viewPrefs.set` (personal order, collapse state and mobile pointing default).

### Test seams
- Grouping by Function puts Event-wide Items in their own group.
- Personal order and collapse state don't change anyone else's view.
- On a phone, tapping a reference in the Chat jumps to the Canvas tab with the Item highlighted and "Back to Chat", or opens a preview sheet, following the person's setting or the Event default.

### Acceptance criteria
- [ ] Phone edits from the Canvas ticket work: tick Entries, edit Entry values, write Notes, Comment, highlight passages, add and delete Items; moving Items between Sections is desktop-only.
- [ ] Compact mode is fully keyboard and screen-reader usable and is linked as "Canvas as a list" from the freeform view.
- [ ] Playwright runs the smoke test at 390 × 844 and passes axe.

---

## S17. Nudges and @Utsavvy in Comments

Labels: `slice`, `assistant`, `chat`. Wave: 27 Oct. Size: M.

### Goal
Plain code posts the three Nudges in the Chat, each with one button that sends a ready-made request; and a Member can ask @Utsavvy from inside a Comment thread, getting the reply and any Proposal in that thread.

### Phase
Parent: Slices. Blocked by: S8, S10, S12, S13.

### Owned paths
`convex/nudges.ts`, `components/chat/cards/nudge/`, `convex/commentAsks.ts`, `evals/nudges.eval.ts`, `e2e/nudges.spec.ts`; may change `components/comments/` (S8, merged).

### Interfaces
- Uses: `budgetRollup`, `nudges`, `internal.chat.postSystem`, `runs` (with `source: "comment"`), `<CommentThread>`, `<ProposalCard>`.
- Provides: `internal.nudges.check({ eventId })` (called after budget, Timeline and Inspiration writes), `internal.nudges.dueSoonSweep` (the daily cron), `api.nudges.act({ nudgeId })`, `api.commentAsks.ask({ commentId })`.

### Test seams
- The Budget going over posts "The Budget is now ₹40,000 over. Want me to suggest cuts?" once that day; a second over-budget write the same IST day posts nothing.
- An unticked Entry due within 3 days posts "Book decorator is due Friday and still open."
- A new Inspiration posts "Meera added a pastel lehenga photo. Want me to update the Theme to match?"
- `act` sends the ready-made request as the Member who tapped it; a Nudge never changes the Canvas itself.
- A Comment mentioning @Utsavvy by a Member queues a run; by a Viewer it doesn't.
- The Chat gets one line: "Utsavvy answered Aditi in a Comment on Caterer (Proposal waiting)".

### Acceptance criteria
- [ ] A Nudge makes no model call.
- [ ] Scripted cases: the Nudge example (Quote pushes the Budget over, "Suggest cuts" arrives as a Proposal) and an @Utsavvy question on a Venue card.
- [ ] Smoke test passes axe.

---

## S18. The vibe pick

Labels: `slice`, `inspirations`. Wave: 27 Oct. Size: S.

### Goal
After the essentials, a Member can tap 3 to 5 images to seed the Theme, or skip; the tapped images become Inspirations.

### Phase
Parent: Slices. Blocked by: S11, S13, D1.

### Owned paths
`components/brief/vibe-pick/`, `lib/brief/vibeSets.ts`, `e2e/vibe-pick.spec.ts`.

### Interfaces
- Uses: `seed/vibe-sets.json`, `api.pexels.search`, `api.inspirations.addFromPexels`, `mergeTheme`, S11's vibe-pick mount point.
- Provides: `setForBrief(extraction) => setKey | null` (the mapping in IMPLEMENTATION_PLAN.md section 2).

### Test seams
- `setForBrief`: North Indian Hindu wedding → its set; Punjabi wedding → general wedding; child birthday → child set; adult birthday → null (live search); Ganesh utsav → its set; Durga puja → null.
- Picking 3 images produces a Theme with 3 to 5 colours and style words, shown on the Brief summary.

### Acceptance criteria
- [ ] The curated grid appears instantly; "Show me more" runs a live Pexels search from the Brief's words.
- [ ] If Pexels is down, only the curated set shows; with no curated set and no Pexels, the step is skipped with one line.
- [ ] Every image shows its Pexels credit.
- [ ] Smoke test passes axe.

---

## S19. The demo Event and its reset

Labels: `slice`, `infra`, `needs-human`. Wave: 27 Oct. Size: M.

### Goal
Judges sign in with a judge account and find "Meera weds Rohan" exactly as IMPLEMENTATION_PLAN.md section 9.1 describes, and the Event resets nightly or on demand.

### Phase
Parent: Slices. Blocked by: S12, S14, S15, S16, S17 (and every MUST slice through them).

### Owned paths
`seed/demo/`, `convex/demo.ts`, `e2e/demo-path.spec.ts`.

### Interfaces
- Uses: `seed/jaipur-vendors.json`, `internal.vendors.loadStarterSet`, `pricePlan`, `applyPlan`, every insert helper, `DEMO_JUDGE_*_ID`.
- Provides: `internal.demo.reset`, the nightly cron's target, the demo banner.

### Test seams
- `reset` twice in a row gives the same Event (same totals, same people, same history groups) and leaves other Events untouched.
- After reset, the judge-owner is Owner (shown as Host), judge-member is Member, judge-viewer is Viewer.
- The seeded Budget totals exactly ₹25,00,000, with the sangeet at 300 Guests and the catering line at ₹2,45,000.

### Acceptance criteria
- [ ] The demo-path Playwright test walks the script in section 9.3 on the preview (stub model for Assistant replies, real model in the manual rehearsal).
- [ ] The banner from section 3 shows on the demo Event only.
- [ ] Sah-Nikhil has created the three judge accounts and set their IDs; the logins are not in the repo.
- [ ] A full rehearsal on the production URL, after a reset, runs the script twice in a row.

---

## Later stage and SHOULD

These are `stretch` issues: built only when a slot frees up, in this order. Each follows the same template; the design docs already specify them, so the bodies below are short. The orchestrator fills in owned paths from the folder map when it creates them, and each needs a contract-change PR first for its tables and packages.

### X1a. Discovery pipeline (later stage, first)
Labels: `slice`, `vendors`, `stretch`. Size: L. Blocked by: S9.
Goal: the server finds Vendors' own sites with Serper and reads them under the polite fetch rules with the SSRF guard, quote-checks extracted facts and geocodes them (IMPLEMENTATION_PLAN.md section 4.9, vendors.md "Discovery" and "Extraction"). Seams: the SSRF guard refuses `127.0.0.1`, `10.0.0.5`, `169.254.169.254`, `[::1]` and a redirect from a public host to a private one; the blocklist drops WedMeGood and JustDial; a sentence not on the page drops its field; `robots.txt` disallow skips the site. Contract change: `discoveryRuns`, `serperCache`, `SERPER_API_KEY`, `robots-parser`, `ipaddr.js`.

### X1b. Discovery in the Chat, pasted URLs, refresh, pooling and flagged Estimates (later stage)
Labels: `slice`, `vendors`, `assistant`, `stretch`. Size: M. Blocked by: X1a.
Goal: "Find Vendors" and Chat requests stream Vendor cards with "Reading 3 of 5 sites", known Vendors first, the 10-a-day cap, "Paste a website URL", Refresh with price history and change notices, automatic pooling behind the vendors.md guardrails, and the flagged AI Estimate for free-label categories (section 3, item 1). Seams: the pooling guardrails (5 prices from different Vendors in 12 months, outliers beyond 3× or under a third of the median ignored, 25th to 75th percentile, Estimates already on a Budget unchanged); the cap message; tests still pin the table with pooling off. Tools: `discoverVendors`, `addVendorFromUrl`.

### X2. Pinterest and Instagram References (SHOULD, first)
Labels: `slice`, `inspirations`, `stretch`. Size: S. Blocked by: S13.
Goal: "Paste a link" accepts Pin, board, `pin.it`, Instagram post and Reel URLs, stores only the URL and the Member's "What do you like in this?" note, and shows them through `pinit.js` and Instagram oEmbed (inspirations.md rules 6, 7 and 14). Seams: host and path checks; the server never fetches the link; "Use for Theme" on a Reference adds words only.

### X3a. Event keys (later stage)
Labels: `slice`, `assistant`, `auth`, `stretch`. Size: M. Blocked by: S7.
Goal: the Owner and Co-owners attach an Anthropic, Google or OpenAI key to an Event (ADR 0004, roles.md "The Event key and roles", section 4.10). Seams: encrypt and decrypt round trip; no query returns ciphertext; a failing key falls back to the default model with the Chat notice; leave with "Remove my Event key too"; the removed person's one remaining action. Contract change: `eventKeys`, `EVENT_KEY_SECRET`, `@ai-sdk/openai`.

### X3b. Generate, Remix and the second demo Event (later stage)
Labels: `slice`, `inspirations`, `stretch`. Size: M. Blocked by: X3a, S13, S19.
Goal: the Generate tab, "Remix this", "Make one like this" and "Use instead" behind a capable Event key with 20 a day per Event (inspirations.md rules 10 to 14), and the seeded "Aarav's 6th birthday" Event carrying Sah-Nikhil's Google key from `DEMO_GOOGLE_EVENT_KEY`. Tools: `generateImage`, `remixImage`.

### X4. Sticky Don't reply and the mention rule (SHOULD)
Labels: `slice`, `chat`, `stretch`. Size: S. Blocked by: S5.
Goal: the "Keep Don't reply on until I turn it off" setting, and a message that @mentions only Members counts as Don't reply while @Utsavvy always gets a reply (assistant-behavior.md rules 2 and 3).

### X5. Email invites (SHOULD)
Labels: `slice`, `auth`, `stretch`. Size: S. Blocked by: S1.
Goal: the Owner and Co-owners pre-approve an address with a role; signing in with it joins; pending invites count toward 25 and can be cancelled; an invite lifts a block. Utsavvy sends no email.

### X6. Ownership transfer, deleting an Event and Owner succession (SHOULD)
Labels: `slice`, `auth`, `stretch`. Size: M. Blocked by: S1.
Goal: transfer to a Co-owner or Member; delete after typing the Event's name (shared Vendors stay); the longest-standing Co-owner becomes Owner when the Owner's Clerk account is deleted (needs a Clerk webhook in `convex/http.ts`, a contract change).

### X7. Hand-typed Vendors (SHOULD)
Labels: `slice`, `vendors`, `stretch`. Size: S. Blocked by: S9.
Goal: a Member types a Vendor with no website (name, category, phone, area); it stays private to the Event, has only Quotes, and a Marker only if dropped on the map. Brings the flagged Estimate for free labels if X1b hasn't. Contract change: `privateVendors`.

### X8. Android share sheet (SHOULD)
Labels: `slice`, `inspirations`, `stretch`. Size: M. Blocked by: X2.
Goal: the PWA's Web Share Target with the Event picker (inspirations.md rule 9), after the device check: install the PWA, share one Pin, one board, one Instagram post and one Reel, and record which fields (`text`, `url`, `title`, files) arrive.

### X9. The other 9 vibe pick sets (SHOULD)
Labels: `slice`, `inspirations`, `stretch`, `needs-human`. Size: S. Blocked by: S18.
Goal: curate and approve the remaining sets from inspirations.md rule 21, the same way as D1.
