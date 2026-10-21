# The Canvas runs on React Flow, and the UI on shadcn/ui's Base UI variant, restyled

The freeform Canvas ([ADR 0007](0007-freeform-canvas-is-the-main-desktop-view.md)) is built on React Flow (`@xyflow/react` 12, MIT), even though React Flow is known as a node-graph library. Each Item is a custom React Flow node holding ordinary HTML, so the Budget table, selectable Hindi passages, Comments and platform embeds work as they would anywhere else on the page. Sections are React Flow group nodes, and its camera API pans only the asking Member's view when the Assistant points. The rest of the UI uses Tailwind CSS 4 with shadcn/ui's Base UI variant, copied into the repo and restyled from the tokens up, with our own design for every Item, so Utsavvy doesn't look like a stock shadcn app. Fonts are Anek Devanagari for text (Latin and Devanagari in one family, because the Assistant replies in Hindi), Fraunces for English display headings and Tiro Devanagari Hindi for Hindi headings, all self-hosted through `next/font`. Decided by Sah-Nikhil on 2026-10-21 in [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18), after a research pass that compared 8 component kits and 6 canvas options.

## Considered options

- **tldraw**: the most canvas-like SDK, but its licence says the SDK "requires a license key to work in production", and the free hobby key is discretionary and adds a "made with tldraw" watermark. A public judged app can't depend on that.
- **Konva or Excalidraw**: they draw to a pixel canvas, so tables, real text selection and iframes would need a second HTML layer, and screen readers get nothing.
- **Our own canvas with CSS transforms**, as the throwaway prototype did: no dependency and full control, but dragging, zooming, group containment, camera moves and keyboard support all become our code, about half a slice more in the largest slice. It stays the fallback.
- **Mantine, Chakra, HeroUI or Radix Themes**: complete kits, but each brings either a second styling system next to Tailwind or a recognisable look that needs heavy restyling.
- **shadcn/ui's Radix variant**: more years of use, and a safe fallback for any single control Base UI handles badly. Base UI became shadcn's default in July 2026.

## Consequences

- The canvas slice starts with an acceptance check: one rich Budget Item, a selectable Entry, a selected Hindi passage, an embed, Section containment, a camera pan for one Member only, and 150 mixed Items. If React Flow fails it, the slice falls back to our own canvas and this ADR is amended.
- Item content is marked `nodrag`, `nopan` and `nowheel` where needed, and Items move by an explicit handle, so text selection and form inputs keep working.
- Positions are stored in Convex; zoom and pan stay per Member in the browser. Final drag positions are saved, not every pointer move.
- Compact mode renders the same Item components in a semantic list, and is the keyboard and screen-reader route to the Canvas.
- Motion is CSS first, with the `motion` package only for a few Chat, Proposal and pointing moments, and all of it respects `prefers-reduced-motion`. Compact reordering uses `@dnd-kit/react` with visible move actions as the non-drag alternative.
- No chart library: the Budget is a real table with labelled bars.

## Sources

Checked 2026-10-21 by a research subagent: npm registry metadata for every package named; [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes), [sub flows](https://reactflow.dev/learn/layouting/sub-flows), [accessibility](https://reactflow.dev/learn/advanced-use/accessibility) and [SSR](https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration); [tldraw licence key](https://tldraw.dev/sdk-features/license-key) and [licence](https://github.com/tldraw/tldraw/blob/main/LICENSE.md); [shadcn Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default); [Base UI accessibility](https://base-ui.com/react/overview/accessibility); [Konva accessibility](https://konvajs.org/docs/sandbox/Canvas_Editor.html); [dnd kit](https://dndkit.com/react/quickstart/); [Motion for React](https://motion.dev/docs/react-installation); Google Fonts metadata for [Anek Devanagari](https://github.com/google/fonts/blob/main/ofl/anekdevanagari/METADATA.pb), [Fraunces](https://github.com/google/fonts/blob/main/ofl/fraunces/METADATA.pb) and [Tiro Devanagari Hindi](https://github.com/google/fonts/blob/main/ofl/tirodevanagarihindi/METADATA.pb).
