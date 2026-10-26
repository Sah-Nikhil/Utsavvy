"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

// X11 (grouped "Undo all") owns this file.

export type UndoAllButtonProps = {
  /** The history group to undo: a run or a Proposal. */
  groupKey: string;
  /** What the group is, for screen readers ("Utsavvy for Meera: Plan the sangeet (8 changes)"). */
  label?: string;
  /**
   * Shows the result somewhere else, such as the history panel's own status
   * line. Without it, the result shows beside the button.
   */
  onDone?: (message: string, tone: "done" | "problem") => void;
};

function problemOf(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string };
    if (data.kind === "AccessDenied")
      return "Only Members can undo. Ask a Member to do it.";
    if (data.kind === "HistoryRefused")
      return "Those changes aren't in the history any more.";
  }
  return "Undo all didn't work. Try again.";
}

/**
 * Whether this group is a redo: an Undo all's history group is
 * `undo:<tap>:<the group it undid>`, so an odd number of those prefixes means
 * pressing the button puts the reply back.
 */
function isRedo(groupKey: string): boolean {
  const prefixes = /^(?:undo:[^:]+:)+/.exec(groupKey)?.[0] ?? "";
  return (prefixes.match(/undo:/g)?.length ?? 0) % 2 === 1;
}

/**
 * Undo all (assistant-behavior.md rule 18), under an Assistant reply in the
 * Chat and on its group in the history. It puts back everything the reply
 * changed as new changes, skips anything someone edited since, and says so
 * ("Undid 7 of 8; Rohan has since edited Sangeet DJ"). Nothing shows for a
 * reply that changed nothing, and Viewers never see the button.
 */
export function UndoAllButton({ groupKey, label, onDone }: UndoAllButtonProps) {
  const status = useQuery(api.history.groupStatus, { groupKey });
  const undoGroup = useMutation(api.history.undoGroup);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tone: "done" | "problem";
    text: string;
  } | null>(null);

  if (!status?.canUndo) return null;
  const redo = isRedo(groupKey);

  async function onUndo() {
    setBusy(true);
    setResult(null);
    let next: { tone: "done" | "problem"; text: string };
    try {
      const { message } = await undoGroup({ groupKey });
      next = { tone: "done", text: `${message}.` };
    } catch (error) {
      next = { tone: "problem", text: problemOf(error) };
    } finally {
      setBusy(false);
    }
    if (onDone) onDone(next.text, next.tone);
    else setResult(next);
  }

  const inline = (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "text-caption empty:hidden",
        result?.tone === "problem" ? "text-warn" : "text-ink-2",
      )}
    >
      {result?.text ?? ""}
    </span>
  );

  if (status.left === 0) {
    return (
      <span className="inline-flex shrink-0 flex-wrap items-center gap-x-2">
        {result ? null : (
          <span className="flex h-8 items-center gap-1 px-2 text-caption text-ink-3">
            <Undo2 aria-hidden className="size-3.5" />
            {redo ? "Redone" : "Undone"}
          </span>
        )}
        {inline}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-x-2">
      <Button
        variant="text"
        size="sm"
        disabled={busy}
        onClick={onUndo}
        data-undo-all={groupKey}
      >
        <Undo2 />
        {busy ? (redo ? "Redoing…" : "Undoing…") : redo ? "Redo" : "Undo all"}
        {label ? <VisuallyHidden>: {label}</VisuallyHidden> : null}
      </Button>
      {inline}
    </span>
  );
}
