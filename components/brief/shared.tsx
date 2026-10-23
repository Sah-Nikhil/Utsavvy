"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { cn } from "@/lib/utils";

/** What `api.brief.summary` returns for a Member or Viewer. */
export type BriefSummaryData = NonNullable<
  FunctionReturnType<typeof api.brief.summary>
>;

const MESSAGES: Record<string, string> = {
  QuestionNotAsked:
    "Someone already answered that. The next question is below.",
  BriefAlreadyGiven: "The Brief has already been given.",
  EmptyBrief: "Write a line or two about what you're planning.",
  BriefTooLong: "That's a bit long. Keep it under 2,000 characters.",
  AccessDenied: "Only Members can change the Brief.",
  NotBuiltYet: "That arrives with the first plan.",
};

/** The words to show for a refused Brief call. */
export function briefError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: unknown; message?: unknown } | null;
    if (data && typeof data.message === "string") return data.message;
    if (data && typeof data.kind === "string" && MESSAGES[data.kind])
      return MESSAGES[data.kind]!;
  }
  return "That didn't go through. Try again in a moment.";
}

/** Runs a Brief mutation with a busy flag and the refusal's words. */
export function useBriefCall<A extends unknown[]>(
  call: (...args: A) => Promise<unknown>,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (...args: A): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await call(...args);
      return true;
    } catch (caught) {
      setError(briefError(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, setError };
}

export function useEditField(eventId: Id<"events">) {
  const edit = useMutation(api.brief.editField);
  return useBriefCall((change: Parameters<typeof edit>[0]["change"]) =>
    edit({ eventId, change }),
  );
}

/** A refusal shown under the control that caused it. */
export function BriefError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-caption text-warn">
      {children}
    </p>
  );
}

/**
 * A one-tap answer chip. Single-answer questions answer on tap, so this is a
 * button, not a toggle; Q7's Functions use the toggle `Chip` instead.
 */
export function AnswerChip({
  children,
  onClick,
  disabled,
  emphasis = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** The proposed answer, such as the festival's dates. */
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "state-layer inline-flex min-h-8 items-center rounded-sm border px-3 py-1 text-left text-label font-medium",
        "transition-[background-color,border-color,color,border-radius] duration-(--dur-feedback) ease-standard active:rounded-xs",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-40",
        emphasis
          ? "border-transparent bg-action-tonal text-on-action-tonal"
          : "border-rule-strong text-ink-2 hover:border-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
