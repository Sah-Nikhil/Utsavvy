"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { noticeAction } from "@/lib/chat/notices";
import { CityRepriceRetry } from "./CityRepriceRetry";

/**
 * What a system notice offers under its text, from the kind of record its
 * card ID names. A notice with no ID, or one of a kind this Chat doesn't
 * know, stays a plain notice.
 */
export function SystemNoticeAction({
  eventId,
  cardId,
}: {
  eventId: Id<"events">;
  cardId: string | null;
}) {
  const action = noticeAction(cardId);
  if (action?.kind === "cityReprice")
    return (
      <CityRepriceRetry
        eventId={eventId}
        proposalId={action.proposalId as Id<"proposals">}
      />
    );
  return null;
}
