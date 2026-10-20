---
id: 14
title: How do parallel agents take build work from GitHub and merge it back cleanly?
labels: [wayfinder:grilling]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/19. Edit it there; this file is no longer updated.

## Question

Once the map closes, the repo is published from GitHub Desktop and the build plan becomes GitHub work items, so several agents can build at once in separate worktrees and merge into `main`. How does that work without merge pain?

- What goes in Issues and what goes in Discussions. t3code keeps feature ideas in an "Ideas" Discussions category and actionable work in Issues. Are build phases parent issues (or milestones) with agent-sized sub-issues, and do stretch goals live in Discussions?
- What an agent-ready issue contains: the files and folders it owns, the interfaces it consumes and provides, acceptance criteria, and the exact checks to run.
- How slices avoid conflicts: a contract-first slice (schema, shared types, design tokens, routes) merged before the parallel ones; one owner for shared files (lockfile, schema, env example); a line-ending policy (`.gitattributes`, since this machine converts LF to CRLF); the merge order.
- Branch and worktree naming, a PR template, the CI checks that must pass before merging (typecheck, lint, tests), and who reviews and merges.
- Labels, and the GitHub setup steps after publishing (the `gh` CLI is installed and signed in as `Sah-Nikhil`, so issues can be created from the terminal).

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Decided in a grilling session; the conventions build agents follow are in [docs/agents/build-workflow.md](../docs/agents/build-workflow.md), with sources.

- **Issues and Discussions, t3code style**: build work is GitHub Issues; stretch goals and not-yet-specified items go to an "Ideas" Discussions category. The closed planning tickets are also copied to GitHub as closed `planning` issues; `issues/` stays the planning record.
- **Phases**: each phase is a parent issue (context, sub-issues, native "blocked by" links) and a milestone of the same name with its due date. No issue types (organization-only).
- **Public from day one**, so the `main` ruleset is enforceable on the free plan and Actions minutes are free.
- **Slicing**: a contract slice first (schema, shared types, tokens, routes, all known packages, `.env.example`, CI, templates, `.gitattributes`), then waves of up to 3 build agents with non-overlapping owned paths. Only the orchestrator changes shared files afterwards, through small contract-change PRs.
- **Worktrees**: T3 `delegate_task` with `isolation: "worktree"`, branch `build/<n>-<short-name>`, one local Convex backend per worktree (depends on 010; port 3210 clash to check). Assigning an issue lets that agent commit, push its own branch and open a PR, nothing more.
- **Testing**: `/tdd` on the seams listed in each issue (approved once in ticket 013) plus Ponytail for minimal code; TDD wins on the listed seams.
- **CI gates**: typecheck, lint, test, build and a Playwright smoke test against each PR's Vercel preview. Fallback if Convex previews aren't free: local e2e before the PR and on `main` after merge, with revert on red.
- **Merging**: Codex reviews every PR; the orchestrator posts a TLDR and verdict, then squash-merges once CI is green and the branch is up to date with `main`, without waiting. Only the contract PR waits for the human's go.
- **Line endings**: LF everywhere via `* text=auto eol=lf`, as t3code does.

No ADR: these conventions are cheap to change later. No new CONTEXT.md terms: build tooling isn't domain language. Setup steps are listed in the doc's hand-off checklist; nothing has been created on GitHub yet.
