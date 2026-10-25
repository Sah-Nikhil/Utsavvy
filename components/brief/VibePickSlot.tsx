"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { VibePick } from "./vibe-pick/VibePick";

/**
 * Where the vibe pick sits on the Brief summary, under the Theme. S18 fills it
 * from `components/brief/vibe-pick/`.
 */
export function VibePickSlot({ eventId }: { eventId: Id<"events"> }) {
  return (
    <div data-mount="vibe-pick" className="contents">
      <VibePick eventId={eventId} />
    </div>
  );
}
