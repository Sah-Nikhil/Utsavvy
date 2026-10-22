# Utsavvy

Utsavvy (utsav, "festival", + savvy) is a GenAI planning Assistant that helps people in India organize weddings, birthdays and community events with budgets, timelines, vendor checklists and personalized ideas. Built solo for PromptWars Virtual, with submission due about 2026-10-28.

Status: **planned, build not started**. Every planning ticket on the wayfinder map, [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6), is closed, and the spec is `IMPLEMENTATION_PLAN.md`, with every build issue drafted in `docs/plans/build-slices.md`. There is no app code and no tests yet. The contract slice (C0) does all the scaffolding; nothing else starts before it merges.

## Stack (locked: don't substitute without a new decision)
Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15) on 2026-10-21. Versions are the latest as of that date; the contract slice pins them.
- Package manager: **bun**: `bun install`, `bun add`, `bun run <script>`, `bunx`. Never npm/npx/yarn/pnpm; translate `npx` in third-party docs to `bunx`.
- App: **Next.js 16.4** (App Router) + React 19, hosted on **Vercel Hobby** (non-commercial use only), Node 22+. See ADR 0002.
- Backend: **Convex** for the database, live Chat and Canvas, file storage (Inspiration uploads) and presence (`@convex-dev/presence`). Each PR preview gets its own Convex preview deployment. See ADR 0002.
- Sign-in: **Clerk** on development keys on the `*.vercel.app` URL (no owned domain), with Google and email + password. Judges use ready-made accounts in a seeded demo Event or `+clerk_test` addresses with code `424242`. See ADR 0002.
- Assistant: **AI SDK 7** + the **Convex Agent** component (`@convex-dev/agent`). Default model `claude-sonnet-5-5`, helper model `claude-haiku-5-5`, fallback default `gemini-3.8-flash`; the model is a setting. See ADR 0003.
- Event keys: Anthropic, Google or OpenAI keys attached to an Event, encrypted with AES-256-GCM, fixed model list, falling back to the default model on failure. Image generation (`gemini-nano-banana-2.1`, `gpt-image-2.5-flare`) exists only with a capable Event key. See ADR 0004.
- Vendor discovery: **Serper** (find Vendors' own sites, URLs only), our own polite server-side fetch (Jina Reader as fallback for JavaScript-only sites), **Geoapify** for geocoding. Directories, Google Places data, search snippets and automated Instagram or Facebook reading are never sources of stored Vendor data (vendors.md).
- Google places: Google's **Places UI Kit** with Google's own map beside the list, in its own full-screen sheet; we store only place IDs and Members' notes, never Google content (ADR 0011). Needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`; setup steps in `docs/setup/google-cloud.md`.
- Stock Inspirations: a **local, hand-curated library** of Pexels photos served from `public/inspirations/` with tags in `seed/vibe-sets.json`; no stock-photo API at runtime (ADR 0012).
- Pinterest and Instagram: official embeds only (Pinterest's `pinit.js` board and Pin widgets, Instagram through Meta's tokenless oEmbed), each rendered in an isolated `/embed/*` page with its own Content Security Policy; we store only the Member's link and note (ADR 0014).
- Map: **MapLibre GL JS** via `react-map-gl/maplibre` with **OpenFreeMap** tiles; the style URL is a single setting. See ADR 0005.
- Tooling: TypeScript **6.0** (not 7), **ESLint** (`eslint-config-next` + `@convex-dev/eslint-plugin`) + **Prettier** (LF line endings), **Vitest** + `convex-test`, **Playwright**. See ADR 0006.
- UI: **Tailwind CSS 4** + **shadcn/ui** (Base UI variant), copied into the repo and restyled from our own tokens so nothing looks stock; **React Flow** (`@xyflow/react` 12) for the freeform Canvas; fonts Anek Devanagari, Fraunces and Tiro Devanagari Hindi via `next/font`. Components use named colour tokens only, never raw colour values. See ADR 0010; the look is picked at the contract review (`IMPLEMENTATION_PLAN.md` section 7.3).
- All code is written with the Ponytail skill (smallest change that fully solves the task); see `docs/agents/build-workflow.md`.

## Commands
Planned; the contract slice creates these scripts in `package.json`.
- dev: `bun run dev` (Next.js and `convex dev` side by side)
- check before "done": `bun run typecheck && bun run lint`
- typecheck: `bun run typecheck` (`tsc --noEmit`)
- lint: `bun run lint` (ESLint, then `prettier --check`; fails on CRLF line endings). Fix formatting with `bun run format`.
- test: `bun run test` (Vitest). **Never `bun test`**: that starts Bun's own runner, which can't run `convex-test`.
- build: `bun run build` (`next build`; on Vercel the build command is `bunx convex deploy --cmd 'bun run build'`)
- browser tests: `bun run test:e2e` (Playwright)

## Structure
- `AGENTS.md`: entry point for non-Claude agents; it defers to this file, so keep project instructions here.
- `issues/`: frozen archive of the planning tickets from before 2026-10-21. The live tracker is GitHub Issues; see `docs/agents/issue-tracker.md` for how it works.
- `.github/`: issue and PR templates. Ideas and stretch goals go in the Ideas discussions, not issues.
- `docs/adr/`: numbered ADRs for settled tradeoffs.
- `docs/design/`: one design doc per planning ticket (first brief, Assistant behaviour, Vendors, Inspirations, roles), with worked examples that become tests.
- `docs/plans/`: `build-slices.md`, every build issue drafted from `IMPLEMENTATION_PLAN.md`.
- `docs/agents/`: docs for agents working in this repo.
- `docs/setup/`: step-by-step guides for Sah-Nikhil's account setup (Google Cloud).

## Conventions
- Use the vocabulary in `CONTEXT.md` exactly. In particular: Member (plans) vs Guest (attends); Listed price vs Estimate vs Quote, never blended; Vendor with Venue as one category; never "pin" or "board".
- `.private/` is gitignored and holds plans that must stay out of the public repo. Never copy, quote or summarize its contents into committed files, issues, PRs or commit messages.
- Planning phase: map tickets produce decisions, not product code. Prototypes are throwaway and live on `prototype/<slug>` branches; research lives on `research/<slug>` branches. Neither is merged.

## Docs & context
Keep these in the repo and update them in the same session a decision is made:
- `CONTEXT.md`: domain language.
- `ROADMAP.md`: phases with exit criteria; tick items when done.
- `IMPLEMENTATION_PLAN.md`: canonical scope, data model and architecture. Written by the final map ticket; amend it, never contradict it silently.
- `docs/adr/`: don't re-derive a settled decision. If the docs have a gap, flag it instead of improvising.

## Gotchas
- The repo will be public for judging. Secrets go in `.env.local` (gitignored) and platform dashboards only.
- Challenge rules (PromptWars Virtual): any AI tool may be used to build; submission is code, a live preview and a LinkedIn build-in-public post.

## Orchestration

@orchestration.md

Apply this project orchestration policy throughout the session. Send delegation
prompts in Homonid ultra. Every subagent invokes Homonid max, using the embedded
rules when the Homonid skill is unavailable.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
