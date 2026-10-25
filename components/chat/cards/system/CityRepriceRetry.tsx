"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Try again on the notice of a failed city re-price (issue #102, review of
 * #114 L3). The notice carries the accepted city Proposal in its card ID
 * (`lib/chat/notices.ts`); the button shows only while that re-price hasn't
 * landed, and only to Members, while the Member who asked still can.
 */
export function CityRepriceRetry({
  eventId,
  proposalId,
}: {
  eventId: Id<"events">;
  proposalId: Id<"proposals">;
}) {
  const status = useQuery(api.plan.cityRepriceStatus, { eventId, proposalId });
  const retry = useMutation(api.plan.retryCityReprice);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!status) return null;
  if (status.state === "landed")
    return (
      <p
        className="flex items-center gap-1.5 text-label text-ink-3"
        data-city-reprice="landed"
      >
        <Check aria-hidden className="size-3.5 text-booked" />
        Re-priced for {status.city}.
      </p>
    );
  if (!status.canRetry) return null;

  const busy = sending || status.state === "retrying";
  const tryAgain = async () => {
    setSending(true);
    setMessage(null);
    try {
      const result = await retry({ eventId, proposalId });
      if (!result.ok) setMessage(result.message);
    } catch {
      setMessage("That didn't go through. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-city-reprice={status.state}
    >
      <Button
        size="sm"
        variant="tonal"
        onClick={tryAgain}
        disabled={busy}
        data-city-reprice-retry
      >
        <RotateCw aria-hidden className={busy ? "animate-spin" : undefined} />
        {busy ? `Re-pricing for ${status.city}…` : "Try again"}
      </Button>
      {message ? (
        <p className="text-label text-ink-3" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
