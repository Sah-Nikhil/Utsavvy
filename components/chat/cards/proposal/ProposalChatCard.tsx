"use client";

import type { ChatCardProps } from "@/components/chat/cards/registry";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The Proposal card in the Chat (S10). The notice line above it already
 * shows the summary, so the card shows the changes and the buttons.
 */
export function ProposalChatCard({ eventId, cardId }: ChatCardProps) {
  if (cardId === null) return null;
  return (
    <ProposalCard
      eventId={eventId}
      proposalId={cardId as Id<"proposals">}
      showSummary={false}
    />
  );
}
