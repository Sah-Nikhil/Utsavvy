"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAsk, type PendingAsk } from "./useAddComment";

/**
 * What happened to a Comment's question for Utsavvy, with "Ask Utsavvy
 * again" when the question can be sent once more (S17).
 */
export function AskNoticeLine({
  pending,
  onChange,
  className,
}: {
  pending: PendingAsk;
  /** The next notice, or null once the question is queued. */
  onChange: (next: PendingAsk | null) => void;
  className?: string;
}) {
  const ask = useAsk();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    const notice = await ask(pending.commentId);
    setBusy(false);
    onChange(notice === null ? null : { ...pending, notice });
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2",
        className,
      )}
    >
      <span>{pending.notice.text}</span>
      {pending.notice.retry ? (
        <Button
          variant="text"
          size="sm"
          onClick={retry}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          <RotateCcw aria-hidden />
          Ask Utsavvy again
        </Button>
      ) : null}
    </div>
  );
}
