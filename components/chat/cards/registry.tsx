"use client";

import type { ComponentType } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { BriefChipsCard } from "./brief/BriefChipsCard";
import { BriefSummaryCard } from "./brief/BriefSummaryCard";
import { NudgeCard } from "./nudge/NudgeCard";
import { PlanProgressCard } from "./plan-progress/PlanProgressCard";
import { ProposalChatCard } from "./proposal/ProposalChatCard";
import { StockStrip } from "./stock-strip/StockStrip";
import { VendorCardsCard } from "./vendor-cards/VendorCardsCard";

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
  stockStrip: StockStrip,
  vendorCards: VendorCardsCard,
  nudge: NudgeCard,
  briefChips: BriefChipsCard,
  briefSummary: BriefSummaryCard,
  planProgress: PlanProgressCard,
  citations: placeholder("Citations", "S7"),
  system: placeholder("System line", "S5"),
};
