import { ConvexError } from "convex/values";

/*
 * What the composer says after a Comment that mentions @Utsavvy, once the
 * Comment is posted and the question has been asked (S17). Pure, so it is
 * tested without React.
 */

export type AskNotice = {
  text: string;
  /** Whether "Ask Utsavvy again" can send the same Comment's question once more. */
  retry: boolean;
};

/** The notice for an ask's outcome, or null when the question is queued. */
export function askNotice(
  outcome: { runId: string | null } | { error: unknown },
): AskNotice | null {
  if ("runId" in outcome) {
    if (outcome.runId !== null) return null;
    return {
      text: "Your Comment is posted. Only Members can ask Utsavvy, so it won't answer this one.",
      retry: false,
    };
  }
  const { error } = outcome;
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: unknown; max?: unknown } | null;
    if (data?.kind === "TooManyQueued")
      return {
        text: `Your Comment is posted, but you already have ${String(data.max)} questions waiting for Utsavvy. Try again when one is answered.`,
        retry: true,
      };
  }
  return {
    text: "Your Comment is posted, but Utsavvy didn't get the question.",
    retry: true,
  };
}
