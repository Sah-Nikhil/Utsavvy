"use client";

import { useQuery } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { ChipQuestion } from "@/components/brief/ChipQuestion";
import { OpeningBox } from "@/components/brief/OpeningBox";
import { useIndiaToday } from "@/components/brief/shared";
import { api } from "@/convex/_generated/api";
import type { ChatCardProps } from "../registry";

/**
 * A Brief question in the Chat. The opening card holds the box for the
 * Member's own words, then shows the Brief being read to every Member; every
 * other card is one chip question. A card is live only while its question is
 * the one being asked; after that the Member's answer follows it in the Chat,
 * so it shows nothing more.
 */
export function BriefChipsCard({ eventId, cardId }: ChatCardProps) {
  const today = useIndiaToday();
  const brief = useQuery(api.brief.summary, { eventId, today });
  if (!brief || cardId === null) return null;
  if (cardId === "opening" && brief.pendingQuestion === "reading") {
    return (
      <p
        className="flex items-center gap-2 text-label text-ink-2"
        role="status"
      >
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin text-action motion-reduce:animate-none"
        />
        Reading the Brief…
      </p>
    );
  }
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
