"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CalendarClock, Check, Palette, Scissors } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ChatCardProps } from "@/components/chat/cards/registry";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

/*
 * A Nudge's one button (S17, assistant-behavior.md rules 6 to 8). The line
 * above it is the Nudge itself; the button sends its ready-made request as
 * the Member who taps it, and from then on the card says who asked. A Nudge
 * never changes the Canvas. Viewers see the line without the button.
 */

const ICONS: Record<Doc<"nudges">["trigger"], ReactNode> = {
  budgetOver: <Scissors aria-hidden />,
  dueSoon: <CalendarClock aria-hidden />,
  newInspiration: <Palette aria-hidden />,
};

function problemText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: unknown; max?: unknown } | null;
    if (data?.kind === "TooManyQueued")
      return `You already have ${String(data.max)} messages waiting for Utsavvy. Try again when one is answered.`;
    if (data?.kind === "AccessDenied") return "Only Members can ask Utsavvy.";
  }
  return "Couldn't send that. Try again.";
}

export function NudgeCard({ cardId }: ChatCardProps) {
  const nudgeId = cardId as Id<"nudges"> | null;
  const card = useQuery(
    api.nudges.card,
    nudgeId === null ? "skip" : { nudgeId },
  );
  const act = useMutation(api.nudges.act);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (nudgeId === null || !card) return null;

  async function tap() {
    if (nudgeId === null) return;
    setSending(true);
    setProblem(null);
    try {
      await act({ nudgeId });
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-1.5" data-nudge={card.trigger}>
      {card.askedBy !== null ? (
        <p className="inline-flex items-center gap-1.5 text-label text-ink-2">
          <Check aria-hidden className="size-3.5 text-booked" />
          {card.askedBy} asked Utsavvy: {card.button}
        </p>
      ) : card.canAct ? (
        <Button
          variant="tonal"
          size="sm"
          onClick={tap}
          disabled={sending}
          aria-busy={sending || undefined}
        >
          {ICONS[card.trigger]}
          {card.button}
        </Button>
      ) : null}
      <p aria-live="polite" className="text-caption text-warn empty:hidden">
        {problem}
      </p>
    </div>
  );
}
