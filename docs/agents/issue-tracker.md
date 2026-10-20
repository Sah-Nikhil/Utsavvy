# Issue tracker: local markdown

Issues for this repo live as markdown files in `issues/`, one file per issue. There is no remote tracker yet. When the repo moves to GitHub, these can be migrated to GitHub Issues (sub-issues for the map's children, native "blocked by" for blocking) and this doc updated to match.

## Issue files

- Path: `issues/NNN-<slug>.md`. `NNN` is the issue id, zero-padded; a new issue takes the highest existing id plus one.
- The title is the issue's name. Refer to issues by name, with the file linked: `[Which stack do we build on?](./010-stack-choice.md)`.
- Frontmatter:

  ```yaml
  ---
  id: 10
  title: Which stack do we build on?
  labels: [wayfinder:grilling]
  status: open        # open | closed
  assignee:           # empty means unclaimed
  parent: 1           # id of the parent issue (the map), if any
  blocked_by: [4, 5]  # ids of issues that must be closed first
  ---
  ```

- The body follows the frontmatter.
- Comments are appended under a `## Comments` heading at the end of the file, each as `### <YYYY-MM-DD> <author>` followed by the text. The resolution comment uses `### <YYYY-MM-DD> <author> (resolution)`.
- Assets created while resolving an issue (research reports, prototypes) are linked from the issue, never pasted in.

## Wayfinding operations

- **Find the map**: the issue labelled `wayfinder:map`.

  ```sh
  grep -l "wayfinder:map" issues/*.md
  ```

- **Child tickets**: issues whose `parent:` is the map's id.
- **Blocking**: this tracker has no native dependency support, so blocking uses the `blocked_by:` frontmatter list. Create all issues first, then wire `blocked_by:` in a second pass once every id exists.
- **Claim**: set `assignee:` to the handle of the dev driving the map (`Sah-Nikhil`) and save the file before doing any work. Re-read the file right before claiming; if `assignee:` is already set, another session has it, so pick a different ticket.
- **Frontier**: open child tickets with an empty `assignee:` whose every `blocked_by` id has `status: closed`. To see every ticket's state at once:

  ```sh
  grep -H -E "^(title|status|assignee|blocked_by):" issues/*.md
  ```

- **Resolve**: append the resolution comment, set `status: closed`, and append one line to the map's "Decisions so far": `- [<title>](./NNN-slug.md): <one-line gist>`.
- **Rule out of scope**: set `status: closed`, add a comment saying why, and add one line to the map's "Out of scope" section linking the closed ticket. It does not go in "Decisions so far".
- **Research findings**: committed to a throwaway `research/<slug>` branch that is never merged. The ticket links the branch and file, e.g. `research/realtime-backend:research/realtime-backend.md`. Read it with `git show research/<slug>:research/<slug>.md`.
