"use client";

import { useMutation, useQuery } from "convex/react";
import {
  CircleCheck,
  CornerDownRight,
  LoaderCircle,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { AssistantOrb } from "@/components/shell/AssistantOrb";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { CommentComposer, commentErrorText } from "./CommentComposer";
import { useCommentList } from "./ItemComments";
import { threadsOf, type CommentView } from "./threads";
import { AskNoticeLine } from "./AskNoticeLine";
import { useAddComment, type PendingAsk } from "./useAddComment";

/*
 * One Comment thread: its first Comment, the replies under it, and a reply
 * box. Reads the Item's Comments with `api.comments.listForItem` (the same
 * query the Item's count uses, so Convex shares one subscription). A reply
 * that mentions @Utsavvy asks the Assistant from the thread (S17): its answer
 * arrives as Utsavvy's reply, any Proposal it makes shows its card here, and
 * the thread says while Utsavvy is replying.
 */

const time = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayAndTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "10:12" today, "21 Oct, 10:12" before. */
function when(at: number): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString();
  return (sameDay ? time : dayAndTime).format(at);
}

export function CommentThread({
  itemId,
  rootId,
  label,
}: {
  itemId: Id<"items">;
  rootId: Id<"comments">;
  /** What the thread is on, when the list mixes targets: "On this Item", "On an Entry". */
  label?: ReactNode;
}) {
  const { comments } = useCommentList(itemId);
  const add = useAddComment();
  const resolve = useMutation(api.comments.resolve);
  const state = useQuery(api.commentAsks.threadState, { rootId });
  const [replying, setReplying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);

  const thread = comments
    ? threadsOf(comments).find((t) => t.root._id === rootId)
    : undefined;
  if (!thread) return null;
  const { root, replies } = thread;

  async function toggleResolved() {
    setProblem(null);
    try {
      await resolve({ commentId: root._id, resolved: !root.resolved });
    } catch (error) {
      setProblem(commentErrorText(error));
    }
  }

  return (
    <section
      aria-label={`Thread started by ${root.byYou ? "you" : root.authorName}`}
      data-comment-thread={root._id}
      data-resolved={root.resolved ? "" : undefined}
      className={cn(
        "grid gap-3 rounded-md border border-rule bg-surface p-3",
        root.resolved && "bg-surface-sunk",
      )}
    >
      {label || root.resolved ? (
        <div className="flex items-center gap-2 text-caption text-ink-3">
          {label ? (
            <span className="min-w-0 flex-1 truncate">{label}</span>
          ) : null}
          {root.resolved ? (
            <Badge tone="booked" className={label ? undefined : "ml-auto"}>
              <CircleCheck aria-hidden />
              Resolved
            </Badge>
          ) : null}
        </div>
      ) : null}

      <CommentRow comment={root} palette={state?.palette} />

      {replies.length > 0 ? (
        <ol className="ml-3.5 grid gap-3 border-l border-rule pl-4">
          {replies.map((reply) => (
            <li key={reply._id}>
              <CommentRow comment={reply} palette={state?.palette} />
            </li>
          ))}
        </ol>
      ) : null}

      {state && state.proposals.length > 0 ? (
        <div className="ml-3.5 grid gap-2 border-l border-rule pl-4">
          {state.proposals.map((proposalId) => (
            <ProposalCard
              key={proposalId}
              eventId={state.eventId}
              proposalId={proposalId}
            />
          ))}
        </div>
      ) : null}

      {pendingAsk ? (
        <AskNoticeLine
          pending={pendingAsk}
          onChange={setPendingAsk}
          className="ml-3.5 border-l border-rule pl-4"
        />
      ) : null}

      {state?.run ? (
        <p
          role="status"
          className="ml-3.5 flex items-center gap-2 border-l border-rule pl-4 text-caption text-ink-2"
        >
          <AssistantOrb
            palette={state.palette}
            size={20}
            state={state.run.status === "running" ? "thinking" : "idle"}
          />
          {state.run.status === "running"
            ? `Utsavvy is replying to ${state.run.askerName}…`
            : `Queued: Utsavvy answers ${state.run.askerName} next`}
          {state.run.status === "running" ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 animate-spin text-ink-3 motion-reduce:animate-none"
            />
          ) : null}
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="text-caption text-warn">
          {problem}
        </p>
      ) : null}

      {replying && !root.resolved ? (
        <div className="ml-3.5 border-l border-rule pl-4">
          <CommentComposer
            compact
            autoFocus
            label={`Reply to ${root.byYou ? "your Comment" : root.authorName}`}
            placeholder={
              state?.canAsk ? "Write a reply, or ask @Utsavvy" : "Write a reply"
            }
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const notice = await add({
                target: root.target,
                body,
                rootId: root._id,
              });
              setPendingAsk(notice);
              setReplying(false);
            }}
          />
        </div>
      ) : (
        <div className="-mb-1 flex flex-wrap items-center gap-1">
          {!root.resolved ? (
            <Button
              variant="text"
              size="sm"
              onClick={() => setReplying(true)}
              aria-label={`Reply to ${root.byYou ? "your Comment" : root.authorName}`}
            >
              <CornerDownRight aria-hidden />
              Reply
            </Button>
          ) : null}
          {root.canResolve ? (
            <Button variant="text" size="sm" onClick={toggleResolved}>
              {root.resolved ? (
                <>
                  <RotateCcw aria-hidden />
                  Reopen
                </>
              ) : (
                <>
                  <CircleCheck aria-hidden />
                  Resolve
                </>
              )}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  palette,
}: {
  comment: CommentView;
  /** The Event's Theme colours, for Utsavvy's orb. */
  palette: string[] | undefined;
}) {
  const edit = useMutation(api.comments.edit);
  const [editing, setEditing] = useState(false);
  const name = comment.byYou ? "You" : comment.authorName;

  return (
    <article
      data-comment={comment._id}
      aria-label={`Comment by ${name}`}
      className="flex gap-2.5"
    >
      {comment.byAssistant ? (
        <AssistantOrb palette={palette ?? []} size={28} className="mt-0.5" />
      ) : (
        <Avatar
          name={comment.authorName}
          src={comment.authorImageUrl ?? undefined}
          size="sm"
          className="mt-0.5"
        />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-caption">
          <span
            className={cn(
              "truncate font-semibold text-ink",
              scriptClass(comment.authorName),
            )}
          >
            {name}
          </span>
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            className="num text-ink-3"
          >
            {when(comment.createdAt)}
          </time>
          {comment.editedAt !== null ? (
            <span className="text-ink-3">(edited)</span>
          ) : null}
          {comment.canEdit && !editing ? (
            <Button
              variant="text"
              size="sm"
              icon
              className="-my-1.5 ml-auto size-7"
              aria-label="Edit your Comment"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </p>
        {editing ? (
          <CommentComposer
            compact
            autoFocus
            label="Edit your Comment"
            submitLabel="Save"
            initial={comment.body}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await edit({ commentId: comment._id, body });
              setEditing(false);
            }}
          />
        ) : (
          <p
            className={cn(
              "text-body break-words whitespace-pre-wrap text-ink",
              scriptClass(comment.body),
            )}
          >
            {comment.body}
          </p>
        )}
      </div>
    </article>
  );
}
