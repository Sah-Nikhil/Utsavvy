# Roadmap

Target: PromptWars Virtual submission (code, live preview and a LinkedIn build-in-public post) by about 2026-10-28.

## Phase 0: Wayfinding

Decide everything the build needs. Progress is tracked on the map, [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6).

- [x] Destination, scope and vocabulary settled (`CONTEXT.md`, ADR 0001)
- [ ] All map tickets closed
- [ ] `IMPLEMENTATION_PLAN.md` written by "What is in v1, what is the demo, and what is the build plan?"

Exit: nothing left to decide before building.

## Phase 1: Build v1

Follow [docs/agents/build-workflow.md](docs/agents/build-workflow.md); its setup checklist has the exact steps.

- [x] Commit the planning docs, check no secrets are tracked, then publish the repo from GitHub Desktop as **public** (File > Add local repository > Publish repository, "Keep this code private" unticked)
- [ ] Install Ponytail in Claude Code and Codex
- [x] GitHub basics (2026-10-21): merge settings, labels, Discussions with Ideas, issue and PR templates, planning tickets moved to GitHub
- [ ] Set up the rest of GitHub after the human's go (repo settings, labels, Discussions "Ideas" category, planning tickets copied as closed `planning` issues, phase parent issues and milestones, build issues from `IMPLEMENTATION_PLAN.md`)
- [ ] Connect Vercel and check Convex preview deployments on the free plan, which decides whether the browser test runs on each PR's preview
- [ ] Contract slice built and merged after the human's go; ruleset on `main` turned on with the required checks
- [ ] Build the remaining slices in waves of up to 3 worktree agents and merge into `main`

The rest is filled in by the final map ticket.

## Phase 2: Submit

- [ ] Live preview deployed
- [ ] Code public on GitHub
- [ ] LinkedIn build-in-public post published
