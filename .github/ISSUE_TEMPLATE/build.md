---
name: Build task
about: An agent-sized slice of the build plan (see docs/agents/build-workflow.md)
labels: slice
---

## Goal
One or two sentences: what a Member can do after this merges, in CONTEXT.md terms.

## Phase
Parent: #<phase issue>. Blocked by: #<n>, #<m>.

## Owned paths
Files and folders this issue may create or change.

## Must not touch
Shared files (see docs/agents/build-workflow.md) and other slices' owned paths.

## Interfaces
- Uses: functions, types, routes and components from the contract or earlier slices.
- Provides: what later slices will rely on, with names and signatures.

## Test seams
The public entry points to test with /tdd, each with its expected behavior and a worked example.

## Acceptance criteria
- [ ] Concrete, checkable outcomes.

## Checks
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:e2e

## Done means
Checks pass locally, the PR is open with the template filled in, and the PR URL and head commit are reported to the orchestrator.
