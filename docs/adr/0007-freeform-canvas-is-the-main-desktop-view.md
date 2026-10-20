# The freeform canvas is the main desktop view

On desktop the Canvas is a freeform infinite canvas: Items sit at positions on a pannable, zoomable surface, and the layout is shared by every Member of the Event and updated live. Compact mode is the alternative view. It shows the same Items in collapsible Sections, and the mobile Canvas tab uses it too. We chose freeform as the main view because Members wanted to arrange the plan spatially, as in Play with Putty, and not only scroll a fixed page. This came out of reacting to the prototype on branch `prototype/canvas`.

## Considered options

- **Structured sections only.** A scrolling page with fixed sections. It was cheaper to build, always readable, and mapped one-to-one to mobile. Rejected as the main view, but kept as Compact mode.
- **Personal layouts.** Each Member arranges their own freeform canvas. Rejected: "look at the Vendors on the left" has to mean the same thing to everyone.

## Consequences

- Every Item stores a position. Moving an Item is a change like any other: it syncs live (last write wins) and shows in the edit history.
- New Items must never land on top of others. They go into free space in their starting Section, so placement logic is part of the build.
- Two desktop views (freeform and Compact) have to show the same Items and stay in sync.
