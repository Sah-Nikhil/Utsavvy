"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Crosshair, X } from "lucide-react";
import { useState } from "react";
import { KIND_NAMES } from "@/components/compact/CompactItem";
import { useMembership } from "@/components/people/useMembership";
import { api } from "@/convex/_generated/api";
import type { PhoneTarget } from "./phoneView";

/*
 * On a phone the Canvas is a tab away, so when Utsavvy points at something for
 * this person, the Chat shows a reference to tap: "Utsavvy pointed at the
 * Budget · Show". Tapping it follows their mobile pointing (S16). Only
 * pointing that arrives while the Chat is open shows; it stays until it is
 * tapped, dismissed or replaced, so a reply read slowly still leads somewhere.
 */

export function PointingChip({
  eventId,
  onShow,
}: {
  eventId: string;
  onShow: (target: PhoneTarget) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const me = useMembership(eventId);
  const data = useQuery(
    api.canvas.get,
    isAuthenticated && me?.status === "active"
      ? { eventId: me.eventId }
      : "skip",
  );
  // Pointing from before the page opened is history, not a reference.
  const [openedAt] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  if (!data) return null;

  const latest = data.highlights.find(
    (h) =>
      h.forMembershipId === data.me.membershipId &&
      h.expiresAt > openedAt &&
      !dismissed.has(h._id),
  );
  const target = latest?.targets[0];
  const item = target && data.items.find((i) => i._id === target.itemId);
  if (!latest || !target || !item) return null;

  const what = KIND_NAMES[item.kind];
  const more = latest.targets.length - 1;
  const label = `Utsavvy pointed at the ${what}${more > 0 ? ` and ${more} more` : ""}`;
  const dismiss = () => setDismissed((prev) => new Set([...prev, latest._id]));

  return (
    <div className="shrink-0 px-3 pt-3" data-pointing-reference>
      <div className="flex items-center gap-1 rounded-full bg-point-field py-1 pr-1 pl-3 text-on-point shadow-item">
        <Crosshair aria-hidden className="size-4 shrink-0 text-point" />
        <button
          type="button"
          onClick={() => {
            dismiss();
            onShow({ kind: "item", itemId: target.itemId });
          }}
          className="state-layer min-w-0 flex-1 truncate rounded-full px-1.5 py-1.5 text-left text-label font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {label}
          <span className="font-normal"> · Show</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="state-layer flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
