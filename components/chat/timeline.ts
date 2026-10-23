import type { UIMessage } from "@convex-dev/agent/react";
import type { ChatDetails, RunSummary } from "./runState";

type Annotation = ChatDetails["annotations"][number];

/** One row of the Chat, in the order it is shown. */
export type TimelineRow =
  | {
      kind: "member";
      key: string;
      message: UIMessage;
      annotation: Annotation | undefined;
      run: RunSummary | undefined;
      /** Queued messages before this one, for its "Queued" line. */
      ahead: number;
      /** Whether the Assistant's reply to it has any text yet. */
      hasReply: boolean;
    }
  | {
      kind: "reply";
      key: string;
      message: UIMessage;
      run: RunSummary | undefined;
    }
  | {
      kind: "system";
      key: string;
      message: UIMessage;
      annotation: Annotation;
    };

/** Whether an Assistant message has anything to show. */
export function hasText(message: UIMessage): boolean {
  return message.text.trim().length > 0;
}

/**
 * Joins the thread's messages with their annotations and runs. A run belongs
 * to the Member message it answers (`run.messageId`), and the Assistant's
 * reply to that message sits at the same `order` in the thread.
 */
export function buildTimeline(
  messages: readonly UIMessage[],
  details: ChatDetails,
): TimelineRow[] {
  const annotations = new Map(
    details.annotations.map((annotation) => [annotation.messageId, annotation]),
  );
  const runsByMessage = new Map<string, RunSummary>();
  for (const run of details.runs) {
    if (run.messageId !== null) runsByMessage.set(run.messageId, run);
  }
  const queued = details.runs
    .filter((run) => run.status === "queued")
    .map((run) => run._id);

  const runsByOrder = new Map<number, RunSummary>();
  const repliedOrders = new Set<number>();
  for (const message of messages) {
    if (message.role === "user") {
      const run = runsByMessage.get(message.id);
      if (run) runsByOrder.set(message.order, run);
    } else if (
      message.role === "assistant" &&
      hasText(message) &&
      !annotations.get(message.id)?.card
    ) {
      repliedOrders.add(message.order);
    }
  }

  const rows: TimelineRow[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const run = runsByMessage.get(message.id);
      rows.push({
        kind: "member",
        key: message.key,
        message,
        annotation: annotations.get(message.id),
        run,
        ahead: run ? Math.max(0, queued.indexOf(run._id)) : 0,
        hasReply: repliedOrders.has(message.order),
      });
      continue;
    }
    if (message.role !== "assistant") continue;
    const annotation = annotations.get(message.id);
    if (annotation?.card) {
      rows.push({ kind: "system", key: message.key, message, annotation });
      continue;
    }
    const streaming =
      message.status === "streaming" || message.status === "pending";
    // A reply that failed before its first token has nothing to show; the
    // Member message's notice says what happened instead.
    if (!hasText(message) && !streaming) continue;
    rows.push({
      kind: "reply",
      key: message.key,
      message,
      run: runsByOrder.get(message.order),
    });
  }
  return rows;
}
