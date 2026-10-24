"use client";

import { useQuery } from "convex/react";
import { BriefSummary } from "@/components/brief/BriefSummary";
import { useIndiaToday } from "@/components/brief/shared";
import { api } from "@/convex/_generated/api";
import type { ChatCardProps } from "../registry";

/** The Brief summary in the Chat, live: every Member sees edits as they land. */
export function BriefSummaryCard({ eventId }: ChatCardProps) {
  const today = useIndiaToday();
  const brief = useQuery(api.brief.summary, { eventId, today });
  if (!brief) {
    return (
      <div
        aria-busy="true"
        className="h-48 animate-pulse rounded-lg bg-surface-sunk motion-reduce:animate-none"
      />
    );
  }
  return <BriefSummary eventId={eventId} brief={brief} />;
}
