"use client";

import type { ComponentType } from "react";
import { ProposalChatCard } from "@/components/chat/cards/proposal/ProposalChatCard";
import type { Doc } from "@/convex/_generated/dataModel";
import { BriefChipsCard } from "./brief/BriefChipsCard";
import { BriefSummaryCard } from "./brief/BriefSummaryCard";

/** The card kinds a Chat message can carry (`chatAnnotations.card.kind`). */
export type ChatCardKind = NonNullable<Doc<"chatAnnotations">["card"]>["kind"];

export type ChatCardProps = {
  eventId: Doc<"events">["_id"];
  /** The card's own record ID, such as a Proposal ID, when it has one. */
  cardId: string | null;
  annotation: Doc<"chatAnnotations">;
};
export type ChatCardComponent = ComponentType<ChatCardProps>;

/** A placeholder until the card's slice replaces it in `components/chat/cards/<kind>/`. */
function placeholder(label: string, slice: string): ChatCardComponent {
  function NotBuiltYetCard() {
    return (
      <div className="rounded-md border border-dashed border-rule-strong px-3 py-2 text-label text-ink-3">
        {label} arrives with {slice}.
      </div>
    );
  }
  NotBuiltYetCard.displayName = `ChatCardPlaceholder(${label})`;
  return NotBuiltYetCard;
}

/** Card kind to component (shared registry). */
export const CHAT_CARDS: Record<ChatCardKind, ChatCardComponent> = {
  proposal: ProposalChatCard,
  stockStrip: placeholder("Stock photo strip", "S13"),
  vendorCards: placeholder("Vendor cards", "S9"),
  nudge: placeholder("Nudge", "S17"),
  briefChips: BriefChipsCard,
  briefSummary: BriefSummaryCard,
  planProgress: placeholder("Plan progress", "S14"),
  citations: placeholder("Citations", "S7"),
  system: placeholder("System line", "S5"),
};
