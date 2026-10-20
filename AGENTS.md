# AGENTS.md

`CLAUDE.md` at the repo root holds this project's instructions and is the source of truth. Read it in full before doing anything, and follow it as if it were written here. This file only adds what agents other than Claude Code need, so the two can't drift apart.

## Read at session start

1. `CLAUDE.md`: what the project is, its status, stack, commands, structure, conventions and gotchas.
2. `CONTEXT.md`: the domain vocabulary. Use its terms exactly.
3. The wayfinder map, [Map: Utsavvy v1](https://github.com/Sah-Nikhil/Utsavvy/issues/6) (`gh issue view 6 -R Sah-Nikhil/Utsavvy`): what is decided and what is still open. How the GitHub tracker works is in `docs/agents/issue-tracker.md`.
4. `docs/adr/`: settled decisions. Don't re-derive them; if the docs have a gap, flag it instead of improvising.

`CLAUDE.md` pulls in `orchestration.md` with an `@orchestration.md` import line. That syntax only works in Claude Code, so read `orchestration.md` directly.

## Orchestration

At session startup, read `orchestration.md` relative to this instruction file
and apply it throughout the session. Use this project copy as the orchestration
policy. Send delegation prompts in Homonid ultra. Every subagent invokes
Homonid max, using the embedded rules when the Homonid skill is unavailable.
