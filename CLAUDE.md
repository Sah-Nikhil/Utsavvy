# Utsavvy

Utsavvy (utsav, "festival", + savvy) is a GenAI planning Assistant that helps people in India organize weddings, birthdays and community events with budgets, timelines, vendor checklists and personalized ideas. Built solo for PromptWars Virtual, with submission due about 2026-10-28.

Status: **planning**. The wayfinder map in `issues/` is being worked through. There is no app code, no tests and no locked stack yet. Don't scaffold anything before the map ticket "Which stack do we build on?" (`issues/010-stack-choice.md`) closes.

## Stack (not locked yet)
- Package manager: **bun**: `bun install`, `bun add`, `bun run <script>`, `bunx`. Never npm/npx/yarn/pnpm; translate `npx` in third-party docs to `bunx`.
- Everything else (framework, backend and real-time layer, sign-in, LLM and agent framework, map library, hosting) is decided by `issues/010-stack-choice.md` and recorded as ADRs in `docs/adr/`.

## Commands
None yet.

## Structure
- `AGENTS.md`: entry point for non-Claude agents; it defers to this file, so keep project instructions here.
- `issues/`: local-markdown issue tracker. The map is `issues/001-map-events-planning-assistant-v1.md`; see `docs/agents/issue-tracker.md` for how it works.
- `docs/adr/`: numbered ADRs for settled tradeoffs.
- `docs/agents/`: docs for agents working in this repo.

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
