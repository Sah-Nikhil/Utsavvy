"use client";

import { useQuery } from "convex/react";
import { ChipQuestion } from "@/components/brief/ChipQuestion";
import { OpeningBox } from "@/components/brief/OpeningBox";
import { api } from "@/convex/_generated/api";
import type { ChatCardProps } from "../registry";

/**
 * A Brief question in the Chat. The opening card holds the box for the
 * Member's own words; every other card is one chip question. A card is live
 * only while its question is the one being asked; after that the Member's
 * answer follows it in the Chat, so it shows nothing more.
 */
export function BriefChipsCard({ eventId, cardId }: ChatCardProps) {
  const brief = useQuery(api.brief.summary, { eventId });
  if (!brief || cardId === null) return null;
  const live =
    brief.pendingQuestion === (cardId === "opening" ? "text" : cardId);
  if (!live) return null;
  if (!brief.canEdit) {
    return (
      <p className="text-caption text-ink-3">Waiting for a Member to answer.</p>
    );
  }
  if (cardId === "opening") return <OpeningBox eventId={eventId} />;
  if (!brief.question) return null;
  return <ChipQuestion eventId={eventId} question={brief.question} />;
}
