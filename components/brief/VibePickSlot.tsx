"use client";

import type { Id } from "@/convex/_generated/dataModel";

/**
 * Where the vibe pick sits on the Brief summary, under the Theme. S18 fills it
 * from `components/brief/vibe-pick/`; until then it renders nothing.
 */
export function VibePickSlot({ eventId }: { eventId: Id<"events"> }) {
  void eventId;
  return <div data-mount="vibe-pick" className="contents" />;
}
