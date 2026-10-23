import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

/** One Comment as `api.comments.listForItem` returns it. */
export type CommentView = FunctionReturnType<
  typeof api.comments.listForItem
>[number];
export type CommentViewTarget = CommentView["target"];

/** A thread: its first Comment and its replies, oldest first. */
export type Thread = { root: CommentView; replies: CommentView[] };

/** Whether a Comment sits on the target: the Item itself, or one Entry. */
export function isOn(comment: CommentView, target: CommentViewTarget): boolean {
  if (comment.target.kind !== target.kind) return false;
  if (comment.target.kind === "entry" && target.kind === "entry")
    return comment.target.entryId === target.entryId;
  return true;
}

/**
 * Groups Comments into threads in the order they started. Replies whose first
 * Comment isn't in the list are left out.
 */
export function threadsOf(comments: readonly CommentView[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const comment of comments) {
    if (comment.rootId === null)
      threads.set(comment._id, { root: comment, replies: [] });
  }
  for (const comment of comments) {
    if (comment.rootId !== null)
      threads.get(comment.rootId)?.replies.push(comment);
  }
  return [...threads.values()];
}

/**
 * The count an Item or Entry shows: Comments in threads that aren't resolved.
 * With no target, every open Comment on the Item and its Entries.
 */
export function openCount(
  comments: readonly CommentView[],
  target?: CommentViewTarget,
): number {
  let count = 0;
  for (const thread of threadsOf(comments)) {
    if (thread.root.resolved) continue;
    if (target && !isOn(thread.root, target)) continue;
    count += 1 + thread.replies.length;
  }
  return count;
}
