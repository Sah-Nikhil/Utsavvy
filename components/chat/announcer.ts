import type { UIMessage } from "@convex-dev/agent/react";
import { hasText } from "./timeline";

/** What the reply announcer remembers between renders; null before it starts. */
export type AnnouncerState = Set<string> | null;

/**
 * The reply to announce on this render, if any. The ChatPanel's live region
 * reads it out once.
 */
export function announce(
  state: AnnouncerState,
  messages: readonly UIMessage[],
  // Not used yet.
  _loading: boolean,
): { state: AnnouncerState; latest: UIMessage | null } {
  const finished = messages.filter(
    (message) =>
      message.role === "assistant" &&
      message.status !== "streaming" &&
      message.status !== "pending" &&
      hasText(message),
  );
  if (state === null) {
    // Replies already in the Chat when it opens aren't news.
    return {
      state: new Set(finished.map((message) => message.key)),
      latest: null,
    };
  }
  const fresh = finished.filter((message) => !state.has(message.key));
  if (fresh.length === 0) return { state, latest: null };
  const next = new Set(state);
  for (const message of fresh) next.add(message.key);
  return { state: next, latest: fresh.at(-1)! };
}
