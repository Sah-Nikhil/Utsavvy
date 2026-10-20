# Issue tracker: GitHub Issues

All tracked work lives in GitHub Issues on [Sah-Nikhil/Utsavvy](https://github.com/Sah-Nikhil/Utsavvy/issues). Use the `gh` CLI (signed in as `Sah-Nikhil`) for every operation below; `R=Sah-Nikhil/Utsavvy`.

Until 2026-10-21 planning used a local-markdown tracker in `issues/`. Those files are now a frozen archive: each one points to its GitHub issue at the top. Don't edit them.

## Two kinds of issue

- **Planning tickets** (label `planning` plus one `wayfinder:*` label): decisions on the way to the spec. They hang off the map, [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6).
- **Build issues** (labels `contract`, `slice`, `contract-change` or `bug`): created from the build plan once the map closes. How they work is in [build-workflow.md](build-workflow.md).

Ideas and stretch goals are not issues. They live in the [Ideas discussions](https://github.com/Sah-Nikhil/Utsavvy/discussions/categories/ideas).

## Conventions

- Refer to issues by **title**, with the number or URL riding inside the link: `[Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15)`. Never a bare list of numbers.
- Assets created while resolving an issue (research reports, prototypes) are linked from the issue, never pasted in.
- Research findings are committed to a throwaway `research/<slug>` branch that is never merged, and linked as `research/<slug>:research/<slug>.md`.

## Wayfinding operations

- **Load the map**: `gh issue view 6 -R $R`. It's the open issue labelled `wayfinder:map`: `gh issue list -R $R --label wayfinder:map`.
- **Child tickets**: the map's sub-issues: `gh api repos/$R/issues/6/sub_issues --jq '.[] | "#\(.number) \(.state) \(.title)"'`.
- **Blocking**: GitHub's native "blocked by" links. Read them with `gh api repos/$R/issues/<n>/dependencies/blocked_by --jq '.[].number'`; add them with `gh issue edit <n> -R $R --add-blocked-by <m>`.
- **Frontier**: open sub-issues of the map with no assignee whose "blocked by" issues are all closed. GitHub marks blocked issues on the issues page, so the frontier is visible there too.
- **Claim**: assign it to yourself before any work: `gh issue edit <n> -R $R --add-assignee Sah-Nikhil`. Check first with `gh issue view <n> -R $R --json assignees`; if someone is assigned, another session has it.
- **Create a ticket**: `gh issue create -R $R --title "<question>" --label planning,wayfinder:<type> --parent 6 --body-file <file>` with a `## Question` body. Create all new tickets first, then add "blocked by" links in a second pass.
- **Resolve**: post the answer as a comment starting with `**<YYYY-MM-DD> Sah-Nikhil (resolution)**`, close the issue (`gh issue close <n> -R $R --reason completed`), and add one line to the map's "Decisions so far": `- [<title>](<issue URL>): <one-line gist>` (edit the map body with `gh issue edit 6 -R $R --body-file <file>`).
- **Rule out of scope**: close with `--reason "not planned"`, comment why, and add one line under the map's "Out of scope". It does not go in "Decisions so far".
