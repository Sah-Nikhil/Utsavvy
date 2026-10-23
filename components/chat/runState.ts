import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

/** What `api.chat.details` returns when the caller can read the Chat. */
export type ChatDetails = NonNullable<
  FunctionReturnType<typeof api.chat.details>
>;
export type RunSummary = ChatDetails["runs"][number];

/** Same rule as `convex/runs.ts`: any Member may stop a reply after 30 seconds. */
export const STOP_ANYONE_AFTER_MS = 30_000;

export type RunNotice = {
  tone: "queued" | "stopped" | "problem" | "muted";
  text: string;
};

/**
 * The line the Chat shows for a run, or null when the reply speaks for
 * itself. `ahead` counts the queued messages before this one; `hasReply`
 * says whether any reply text streamed.
 */
export function runNotice(
  run: RunSummary,
  ahead: number,
  hasReply: boolean,
): RunNotice | null {
  switch (run.status) {
    case "queued":
      return {
        tone: "queued",
        text:
          ahead === 0
            ? "Queued: Utsavvy answers this next"
            : `Queued: ${ahead} ${ahead === 1 ? "message" : "messages"} ahead`,
      };
    case "stopping":
    case "stopped":
      return {
        tone: "stopped",
        text: `Stopped by ${run.stoppedByName ?? "a Member"}`,
      };
    case "failed":
      return {
        tone: "problem",
        text: hasReply
          ? "Utsavvy stopped partway. Ask again for the full answer."
          : "Utsavvy couldn't answer this time. Try asking again in a moment.",
      };
    case "cancelled":
      return { tone: "muted", text: "Cancelled before Utsavvy answered" };
    case "running":
    case "done":
      return null;
  }
}

/**
 * Stop for the person looking at a running reply: Viewers get no Stop at all
 * (the server refuses them), the asker may stop at once and other Members
 * after 30 seconds. `secondsLeft` is how long they still wait.
 */
export function stopState(
  run: RunSummary,
  me: { membershipId: string; canPost: boolean },
  now: number,
): { visible: boolean; allowed: boolean; secondsLeft: number } {
  if (!me.canPost) return { visible: false, allowed: false, secondsLeft: 0 };
  if (run.requestedBy === me.membershipId)
    return { visible: true, allowed: true, secondsLeft: 0 };
  const ranFor = now - (run.startedAt ?? now);
  if (ranFor >= STOP_ANYONE_AFTER_MS)
    return { visible: true, allowed: true, secondsLeft: 0 };
  return {
    visible: true,
    allowed: false,
    secondsLeft: Math.ceil((STOP_ANYONE_AFTER_MS - ranFor) / 1000),
  };
}

/** The Chat header's model line: the model that answered the latest reply. */
export function modelCaption(latest: ChatDetails["latestModel"]): string {
  if (latest === null) return "No replies yet";
  return latest.fallback
    ? `${latest.model}, standing in for Claude`
    : latest.model;
}
