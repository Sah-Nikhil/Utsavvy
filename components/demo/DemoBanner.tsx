"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// S19a (the demo Event) owns this folder.

export type DemoBannerProps = {
  eventId: string;
};

/** The banner's words (IMPLEMENTATION_PLAN.md section 3, item 5). */
export const DEMO_BANNER_TEXT =
  "the people, Quotes and Comments here are made up. Vendor facts come from each Vendor's own website, or for a few, its public Instagram profile, checked by hand.";

/**
 * The strip above the workspace header on the seeded demo Event only: its
 * people, Quotes and Comments are made up, but its Vendors are real Jaipur
 * businesses (section 3, item 5). A tonal surface with a motif diamond, so it
 * reads as part of the page rather than a warning. Renders nothing on any
 * other Event, and while the answer loads.
 */
export function DemoBanner({ eventId }: DemoBannerProps) {
  const { isAuthenticated } = useConvexAuth();
  const isDemo = useQuery(
    api.demo.isDemo,
    isAuthenticated ? { eventId } : "skip",
  );
  if (isDemo !== true) return null;
  return (
    <aside
      aria-label="Demo Event"
      data-demo-banner
      className="flex items-start gap-2.5 border-b border-rule bg-surface-container px-3 py-2 text-caption text-ink-2 sm:items-center sm:px-4 sm:text-label"
    >
      <span
        aria-hidden
        className="mt-1.5 inline-block size-2 shrink-0 rotate-45 rounded-[1.5px] bg-motif sm:mt-0"
      />
      <p>
        <strong className="font-semibold text-ink">Demo Event:</strong>{" "}
        {DEMO_BANNER_TEXT}
      </p>
    </aside>
  );
}
