import type { UIMessage } from "@convex-dev/agent/react";
import { hasText } from "./timeline";

/**
 * What the reply announcer remembers between renders: the replies already
 * known, and the newest place in the thread when the Chat opened. Null until
 * the first page has loaded.
 */
export type AnnouncerState = { seen: Set<string>; floor: number } | null;

function isFinishedReply(message: UIMessage): boolean {
  return (
    message.role === "assistant" &&
    message.status !== "streaming" &&
    message.status !== "pending" &&
    hasText(message)
  );
}

/**
 * The reply to announce on this render, if any; the ChatPanel's live region
 * reads it out once. Replies already in the Chat when it opens aren't news,
 * and neither are older ones that "Show earlier messages" loads: only a reply
 * at or after the newest place in the thread at opening is announced, once it
 * has finished.
 */
export function announce(
  state: AnnouncerState,
  messages: readonly UIMessage[],
  loading: boolean,
): { state: AnnouncerState; latest: UIMessage | null } {
  if (state === null) {
    // `useUIMessages` has no messages yet while the first page loads.
    if (loading) return { state: null, latest: null };
    return {
      state: {
        seen: new Set(
          messages.filter(isFinishedReply).map((message) => message.key),
        ),
        floor: Math.max(
          Number.NEGATIVE_INFINITY,
          ...messages.map((message) => message.order),
        ),
      },
      latest: null,
    };
  }
  const fresh = messages.filter(
    (message) =>
      isFinishedReply(message) &&
      message.order >= state.floor &&
      !state.seen.has(message.key),
  );
  if (fresh.length === 0) return { state, latest: null };
  const seen = new Set(state.seen);
  for (const message of fresh) seen.add(message.key);
  return { state: { ...state, seen }, latest: fresh.at(-1)! };
}
