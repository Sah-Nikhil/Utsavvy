"use client";

import { SectionFrame } from "@/components/shell/SectionOrnament";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

// S2 (the freeform Canvas) owns this folder and replaces this mount point with
// the React Flow Canvas (ADR 0010). Until then it shows the four starting Sections.

export type CanvasViewProps = { eventId: string };

const STARTING_SECTIONS = [
  "Money and dates",
  "Vendors",
  "Inspirations",
  "Notes",
];

export function CanvasView(_props: CanvasViewProps) {
  return (
    <div className="grid gap-6 p-6 md:grid-cols-2">
      {STARTING_SECTIONS.map((name) => (
        <SectionFrame key={name} label={name}>
          <MountPlaceholder
            title="No Items yet"
            slice="S2 and the plan slices"
          />
        </SectionFrame>
      ))}
    </div>
  );
}
