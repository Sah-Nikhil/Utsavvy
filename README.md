# Utsavvy

Utsavvy is an AI Assistant for planning Indian weddings, birthdays and community Events. Members give it a Brief, then plan together in a shared Chat and Canvas. It builds a Budget, Timeline and Vendor checklist, helps compare prices, and brings Inspirations into the Event.

**Live app:** [utsavvy.vercel.app](https://utsavvy.vercel.app)

## What works today

- Create an Event, invite Members and Viewers, and plan together in a live Chat and freeform Canvas. Viewers can see the work and Comment without changing the plan. [#79](https://github.com/Sah-Nikhil/Utsavvy/pull/79), [#81](https://github.com/Sah-Nikhil/Utsavvy/pull/81), [#86](https://github.com/Sah-Nikhil/Utsavvy/pull/86), [#91](https://github.com/Sah-Nikhil/Utsavvy/pull/91)
- Give the Assistant a Brief, review its Assumptions and Budget check, pick Inspirations for a Theme, then choose "Make my plan." The plan fills the Canvas with Functions, Budget Entries, Timeline Entries and Vendor checklist Entries. [#101](https://github.com/Sah-Nikhil/Utsavvy/pull/101), [#112](https://github.com/Sah-Nikhil/Utsavvy/pull/112), [#114](https://github.com/Sah-Nikhil/Utsavvy/pull/114)
- Ask the Assistant to change the Canvas. Risky changes arrive as Proposals for a Member to accept or reject. Changes appear in history and can be restored or undone by group. [#99](https://github.com/Sah-Nikhil/Utsavvy/pull/99), [#105](https://github.com/Sah-Nikhil/Utsavvy/pull/105), [#90](https://github.com/Sah-Nikhil/Utsavvy/pull/90), [#120](https://github.com/Sah-Nikhil/Utsavvy/pull/120)
- Compare labelled Estimates, source-linked Listed prices and Member-recorded Quotes. Shortlist Jaipur Vendors, link them to checklist Entries and see their Markers on a map. [#77](https://github.com/Sah-Nikhil/Utsavvy/pull/77), [#122](https://github.com/Sah-Nikhil/Utsavvy/pull/122), [#123](https://github.com/Sah-Nikhil/Utsavvy/pull/123), [#124](https://github.com/Sah-Nikhil/Utsavvy/pull/124)
- Add stock photos, uploads and Pinterest or Instagram References as Inspirations. Use Compact mode and the phone layout; see Nudges in Chat and ask the Assistant from a Comment. [#78](https://github.com/Sah-Nikhil/Utsavvy/pull/78), [#107](https://github.com/Sah-Nikhil/Utsavvy/pull/107), [#113](https://github.com/Sah-Nikhil/Utsavvy/pull/113), [#117](https://github.com/Sah-Nikhil/Utsavvy/pull/117)

## How to try it

Open the live app and sign in with Google or email. Judges receive their demo accounts through the submission form. Open **Meera weds Rohan**, the seeded Jaipur wedding Event. Look at its five Functions, ₹25 lakh Budget, run sheets, Shortlisted Vendors, Inspirations, Comments and edit history. Try a Quote in Chat, then watch the Proposal and Budget comparison. The demo Event resets nightly. [#119](https://github.com/Sah-Nikhil/Utsavvy/pull/119)

## Stack

Next.js 16.4.2 and React 19.3.1 on Vercel; TypeScript 6.0.3; Convex 1.47.0 for data and live updates; Clerk for sign-in; AI SDK 7 with the Convex Agent component; Claude Sonnet 5.5 with Gemini 3.8 Flash fallback; React Flow 12 for the Canvas; MapLibre GL JS and OpenFreeMap for the Vendor map; Tailwind CSS 4 and restyled shadcn/ui Base UI components for the Contemporary rangoli look. Bun manages packages. Vitest, Playwright, ESLint and Prettier check the build. See [package.json](package.json), [CLAUDE.md](CLAUDE.md) and [ADR 0010](docs/adr/0010-react-flow-canvas-and-restyled-shadcn-base-ui.md).

## How it was built

Planning decisions live in GitHub issues under [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6), with settled tradeoffs in [ADRs](docs/adr/). Claude Code with Claude Opus 5.5 built slices in parallel worktrees through T3 Code orchestration. Codex with GPT-6.1 Sol independently reviewed PRs before merge. The Assistant uses Gemini as a fallback model when Claude is unavailable. See the [build workflow](docs/agents/build-workflow.md) and [orchestration policy](orchestration.md).

## Known gaps

The Google places sheet (S20), browsing ideas on Pinterest (S21) and the Android share sheet (X8) have not shipped. The Assistant needs a configured model key on production to answer. A live model response, researched Estimate or first plan depends on that production setup.

## Local development

Use Node 22 or newer and Bun. Configure local Convex and Clerk values as described in [CLAUDE.md](CLAUDE.md); keep keys out of the repo.

```sh
bun install
bun run dev
bun run test
bun run typecheck
bun run lint
bun run build
```

`bun run lint` runs ESLint, Prettier and the LF line-ending check. Browser tests use `bun run test:e2e` with their required local services.

## Repo map

- `app/` and `components/`: routes and interface.
- `convex/`: backend functions, schema and Assistant.
- `lib/`: shared types and calculations.
- `seed/`: demo and starter data.
- `e2e/` and `evals/`: browser and Assistant checks.
- `docs/adr/`, `docs/design/` and `docs/agents/`: decisions, behavior and build workflow.
- `CONTEXT.md`, `IMPLEMENTATION_PLAN.md` and `ROADMAP.md`: vocabulary, scope and schedule.
