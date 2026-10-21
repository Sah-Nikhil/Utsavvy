# The Assistant's changes are version-checked, and risky ones are Proposals

Members' own edits to the Canvas are last write wins ([ADR 0007](0007-freeform-canvas-is-the-main-desktop-view.md)), but the Assistant's are not. Every Assistant write states the version of the Item or Entry it read and is refused if a Member saved in between; the Assistant then re-reads and retries once, or asks. Small changes a Member asked for apply at once. Deletions, Budget total changes, shifts of more than 10% of the total, changes touching more than 5 Entries or Items, and anything no Member asked for arrive as a Proposal that any Member must Accept, all or nothing, within 24 hours and only while nothing it touches has changed. Decided in [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12); the full rules are in [assistant-behavior.md](../design/assistant-behavior.md).

The difference exists because the Assistant can change many things in one reply from a request made seconds or minutes earlier, while the Member it would overwrite may be typing right now. A Member's careful edit silently lost to the Assistant is the failure Members would trust least. Proposals also keep the prompt-injection boundary from the LLM research: a fooled model still can't delete or rebudget without a person's Accept.

## Considered options

- **Everything applies directly, last write wins, undo from history.** Fastest and the same rule as Members, but the Assistant could quietly undo a Member's edit, and risky changes would rely on someone noticing in history.
- **Everything is a Proposal.** Safest, but every simple request ("add a ₹15,000 line") needs an extra tap.
- **Lock Items while the Assistant works.** No conflicts, but Members get blocked and the Assistant can't know in advance what it will touch.

## Consequences

- Every Item and Entry carries a version, and every Assistant mutation is idempotent (run ID plus tool-call ID) and checks it.
- Proposals are stored as data (the changes, the versions they were based on, who accepted) separately from the changes they apply.
- History groups an Assistant reply's changes, with Undo all that skips anything a Member edited afterwards.
- The thresholds (10%, 5 Entries or Items, 24 hours) are settings, tuned with the scripted test cases.
