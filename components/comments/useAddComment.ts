"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { askNotice, type AskNotice } from "./askNotice";
import { mentionsAssistant } from "./text";
import type { CommentViewTarget } from "./threads";

/** A posted Comment whose question needs saying something about. */
export type PendingAsk = { commentId: Id<"comments">; notice: AskNotice };

/** Asks Utsavvy with a posted Comment; resolves to its notice, or null when queued. */
export function useAsk() {
  const ask = useMutation(api.commentAsks.ask);
  return useCallback(
    async (commentId: Id<"comments">): Promise<AskNotice | null> => {
      try {
        return askNotice({ runId: await ask({ commentId }) });
      } catch (error) {
        return askNotice({ error });
      }
    },
    [ask],
  );
}

/**
 * Adds a Comment and, when it mentions @Utsavvy, asks the Assistant from its
 * thread (S17). Resolves to what the composer should say when the question
 * wasn't queued, or null. Asking again with the same Comment is safe: one
 * Comment queues at most one run.
 */
export function useAddComment() {
  const add = useMutation(api.comments.add);
  const ask = useAsk();
  return useCallback(
    async (args: {
      target: CommentViewTarget;
      body: string;
      rootId: Id<"comments"> | null;
    }): Promise<PendingAsk | null> => {
      const commentId = await add(args);
      if (!mentionsAssistant(args.body)) return null;
      const notice = await ask(commentId);
      return notice === null ? null : { commentId, notice };
    },
    [add, ask],
  );
}
