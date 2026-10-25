"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { mentionsAssistant } from "./text";
import type { CommentViewTarget } from "./threads";

/** Why Utsavvy can't take a Comment's question, in the Member's terms. */
export function askProblemText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: unknown; max?: unknown } | null;
    if (data?.kind === "TooManyQueued")
      return `Your Comment is posted, but you already have ${String(data.max)} questions waiting for Utsavvy. Ask again when one is answered.`;
  }
  return "Your Comment is posted, but Utsavvy couldn't take the question. Try again in a moment.";
}

/** Said to a Viewer who mentions @Utsavvy: the Comment stands, no run starts. */
export const VIEWER_ASK_NOTICE =
  "Your Comment is posted. Only Members can ask Utsavvy, so it won't answer this one.";

/**
 * Adds a Comment and, when it mentions @Utsavvy, asks the Assistant from its
 * thread (S17). Resolves to a notice for the composer when the question
 * couldn't be asked, or null.
 */
export function useAddComment() {
  const add = useMutation(api.comments.add);
  const ask = useMutation(api.commentAsks.ask);
  return useCallback(
    async (args: {
      target: CommentViewTarget;
      body: string;
      rootId: Id<"comments"> | null;
    }): Promise<string | null> => {
      const commentId = await add(args);
      if (!mentionsAssistant(args.body)) return null;
      try {
        const runId = await ask({ commentId });
        return runId === null ? VIEWER_ASK_NOTICE : null;
      } catch (error) {
        return askProblemText(error);
      }
    },
    [add, ask],
  );
}
