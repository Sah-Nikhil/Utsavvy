# Roadmap

Target: PromptWars Virtual submission (code, live preview and a LinkedIn build-in-public post) by about 2026-10-28.

## Phase 0: Wayfinding

Decide everything the build needs. Progress is tracked on the map, [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6).

- [x] Destination, scope and vocabulary settled (`CONTEXT.md`, ADR 0001)
- [x] All map tickets closed
- [x] `IMPLEMENTATION_PLAN.md` written by "What is in v1, what is the demo, and what is the build plan?" (2026-10-21), with every build issue drafted in `docs/plans/build-slices.md`

Exit: nothing left to decide before building.

## Phase 1: Build v1

Follow [docs/agents/build-workflow.md](docs/agents/build-workflow.md); its setup checklist has the exact steps.

- [x] Commit the planning docs, check no secrets are tracked, then publish the repo from GitHub Desktop as **public** (File > Add local repository > Publish repository, "Keep this code private" unticked)
- [x] ~~Install Ponytail in Claude Code and Codex~~ Dropped on 2026-10-22: Sah-Nikhil chose not to use Ponytail
- [x] GitHub basics (2026-10-21): merge settings, labels, Discussions with Ideas, issue and PR templates, planning tickets moved to GitHub
- [x] Set up the rest of GitHub (2026-10-21): milestones Contract, Slices and Submit; phase parent issues #28, #29 and #30; build issues #31 to #64 from `docs/plans/build-slices.md` (and #66 to #69 for later changes) with labels and "blocked by" links
- [x] Connect Vercel (2026-10-22): project `utsavvy`, production URL https://utsavvy.vercel.app, Convex production deployment `veracious-shark-534` with production and preview deploy keys in Vercel, Clerk keys in Vercel, and `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub
- [ ] Check Convex preview deployments on the free plan with C0's first PR, which decides whether the browser test runs on each PR's preview
- [x] Contract slice built and merged after the human's go; ruleset on `main` turned on with the required checks (2026-10-22, #74)
- [ ] Build the remaining slices in waves of up to 3 worktree agents and merge into `main`

### Build days

Scope, tiers and the cut line are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) section 1; the issues are drafted in [docs/plans/build-slices.md](docs/plans/build-slices.md). The MUST tier fills every slot from 22 to 27 Oct, so a slipped day moves the cut-line items to SHOULD rather than moving the dates.

- [ ] **Thu 22 Oct, contract.** C0 alone in code; D1 (the stock library: 288 photos in 4 sets) and D2 (Jaipur starter set) beside it as data-only work. Sah-Nikhil hand-curates and approves the stock library, fills any starter-set gap with a hand-checked Instagram-only Vendor, checks the 16 Vendor cards, approves or rejects D2's reference-table adjustments, reviews the contract PR and picks the look (IMPLEMENTATION_PLAN.md section 7.3) on the real components (picked 22 Oct: D, with an Ornaments setting).
  Exit: contract merged after Sah-Nikhil's go; CI runs all five checks; the smoke test signs in on a preview and passes axe; the ruleset on `main` is on; D1 and D2 approved and merged; the reference table frozen at version `2026-10-22`.
- [x] **Fri 23 Oct, wave 1.** S1 Events and roles, S2 freeform Canvas, S5 Chat and runs, then S3 the estimate cascade and pricing (L since 22 Oct, [ADR 0013](docs/adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)).
  Exit: two browsers in one Event see the same Canvas moves and the same streamed reply; joining by the Viewer link gives a Viewer; with research stubbed, the pricing tests reproduce all three first-brief worked examples; a live Jaipur catering Estimate comes back researched, with its sources.
- [ ] **Sat 24 Oct, wave 2.** S4 plan Items, S6 history, S7 Assistant tools, S8 Comments, S20 Google places sheet (its spike first). Sah-Nikhil has the Google Cloud key and Map ID ready by 23 Oct ([docs/setup/google-cloud.md](docs/setup/google-cloud.md)).
  Exit: "Add a mehendi artist, around ₹15,000" adds one Entry, points at it and shows in history; a stale write is refused and retried; Comments work on Items and Entries; a Google place saved from the sheet reopens from its card by place ID.
- [ ] **Sun 25 Oct, wave 3.** S9 Vendors, S10 Proposals, S11 first Brief, S13 Inspirations.
  Exit: a seeded Jaipur caterer can be shortlisted and linked; a risky request arrives as a Proposal that goes out of date when someone edits it; the Ganesh utsav Brief reaches the summary with the "₹36,000 short" flag; stock library photos land from the Chat strip.
- [ ] **Mon 26 Oct, wave 4.** S12 Quotes, S14 first plan, S15 map, S16 Compact and phone layout, S19a demo Event seed and reset; then a rehearsal on production of the beats that exist. At 18:00 IST, if any of these is still open, cut-line items move to SHOULD in the order of IMPLEMENTATION_PLAN.md section 1.5 (see section 10).
  Exit: "Make my plan" fills the Canvas for all three worked-example Briefs; the WhatsApp paste becomes a Quote Proposal; the map shows Markers by status in our own map style; the phone layout passes its smoke test at 390 × 844; `demo:reset` builds "Meera weds Rohan" on production with the judge accounts in their roles.
  Status at 04:00 IST on 26 Oct: S14 merged (#114, with re-pricing when a city-change Proposal is accepted), S16 merged (#113). S12, S15 and S19a wait on S9, which waits on Sah-Nikhil's check of the 16 Vendor cards on #65.
  Cut decision at 18:00 IST on 26 Oct ([#29](https://github.com/Sah-Nikhil/Utsavvy/issues/29#issuecomment-6416042566)):
  - Merged since 04:00: D2 (#65) and S9 (#122).
  - Still open: S12 (building), S15 (PR #123 in review) and S19a (draft #119). All three keep going into the morning of 27 Oct, ahead of S19b.
  - No cut-line item moves to SHOULD.
  - Anything still unmerged at 12:00 IST on 27 Oct follows the section 10 fallback table.
- [ ] **Tue 27 Oct, wave 5 and hardening.** S17 Nudges and @Utsavvy in Comments, S18 vibe pick, then S19b the demo path end to end (at 14:00 IST, if S17 or S18 is still open, the rest of the cut line moves to SHOULD); then `ANTHROPIC_API_KEY` goes on Convex production (held back until now to save credits, decided 23 Oct, so earlier testing runs on the Gemini fallback) and #80's live research eval runs; then the full set of scripted Assistant cases runs in CI through the manual workflow, failures become `bug` issues and get fixed; then, once the key is in, the browser test (`bun run test:e2e`) and the live S7 cases (`EVAL_LIVE=1 bun run eval`: web search with citations, the three languages, the hidden-instruction page) run against the real model, and "Save as Note" is checked on a real multi-step web search reply (review of #99, L2 and L8; CI never runs these on its own); production deploy.
  Exit: the demo script in IMPLEMENTATION_PLAN.md section 9.3 runs twice in a row on the production URL with the judge accounts, after a reset.
  Status at 04:00 IST on 26 Oct: S18 merged (#112). S17 merged early (#117) on the section 10 fallback: S12 is still open, so its Quote cases use a typed amount, with named skipped tests to add when S12 merges. Its live scripted cases run with the key on 27 Oct.

- [ ] **Lane 4, 23 to 25 Oct (MUST since 22 Oct).** X2 Pinterest and Instagram References, then S21 Browse ideas on Pinterest, then X8 the Android share sheet ([ADR 0014](docs/adr/0014-pinterest-and-instagram-only-through-official-embeds.md)), built one at a time by a fourth agent beside the waves, starting as soon as C0 merges (decided 22 Oct). Sah-Nikhil creates Utsavvy's Pinterest account and its public boards by 24 Oct, before S21, and does the Android device check when X8 starts.

Later-stage and SHOULD issues (`stretch`) are built only if a slot frees up, Discovery first.

## Phase 2: Submit

**Wed 28 Oct.** Record the demo video from production after a reset, publish the LinkedIn post (IMPLEMENTATION_PLAN.md section 11), submit with the judge logins in the submission notes. Whatever time is left is buffer.

- [ ] Live preview deployed
- [ ] Code public on GitHub
- [ ] Demo video recorded
- [ ] LinkedIn build-in-public post published
- [ ] Submitted, with the judge logins in the submission notes only
