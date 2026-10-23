"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import {
  CircleAlert,
  CircleStop,
  Clock,
  Crosshair,
  MessageCircleOff,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Citations,
  type CitationSource,
} from "@/components/chat/cards/citations/Citations";
import { CHAT_CARDS } from "@/components/chat/cards/registry";
import { UndoAllButton } from "@/components/history/UndoAllButton";
import { AssistantOrb } from "@/components/shell/AssistantOrb";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { runNotice, type RunNotice, type RunSummary } from "./runState";
import { hasText, type TimelineRow } from "./timeline";

type Pointing = Doc<"chatAnnotations">["pointing"];

export function ChatRow({
  row,
  eventId,
  myMembershipId,
  palette,
}: {
  row: TimelineRow;
  eventId: Id<"events">;
  myMembershipId: string;
  palette: string[];
}) {
  switch (row.kind) {
    case "member":
      return (
        <MemberMessage
          row={row}
          mine={row.annotation?.authorMembershipId === myMembershipId}
        />
      );
    case "reply":
      return <Reply row={row} eventId={eventId} palette={palette} />;
    case "system":
      return <SystemMessage row={row} eventId={eventId} palette={palette} />;
  }
}

function MemberMessage({
  row,
  mine,
}: {
  row: Extract<TimelineRow, { kind: "member" }>;
  mine: boolean;
}) {
  const author = row.annotation?.authorName ?? "A Member";
  const dontReply =
    row.annotation?.dontReply === true &&
    (row.annotation?.pointing.length ?? 0) === 0;
  const notice =
    row.run && !row.hasReply ? runNotice(row.run, row.ahead, false) : null;

  return (
    <li
      className={cn(
        "flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-(--dur-arrival) ease-emphasized motion-reduce:animate-none",
        mine ? "flex-row-reverse pl-8" : "pr-8",
      )}
      data-chat-row="member"
    >
      {mine ? null : <Avatar name={author} size="sm" className="mt-5" />}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          mine ? "items-end" : "items-start",
        )}
      >
        <p className="px-1 text-caption font-medium text-ink-3">
          {mine ? "You" : author}
        </p>
        <div
          className={cn(
            "max-w-full rounded-lg px-3 py-2 text-body break-words whitespace-pre-wrap",
            mine
              ? "rounded-tr-xs bg-action-tonal text-on-action-tonal"
              : "rounded-tl-xs border border-rule bg-surface-raised text-ink",
            dontReply &&
              "border border-dashed border-rule-strong bg-surface-sunk text-ink-2",
          )}
        >
          {row.message.text}
        </div>
        {dontReply ? (
          <p className="flex items-center gap-1 px-1 text-caption text-ink-3">
            <MessageCircleOff aria-hidden className="size-3" />
            For the Members. Utsavvy read it and stayed quiet.
          </p>
        ) : null}
        {row.annotation && row.annotation.pointing.length > 0 ? (
          <PointingNote pointing={row.annotation.pointing} />
        ) : null}
        {notice && row.run ? (
          <RunLine notice={notice} run={row.run} mine={mine} />
        ) : null}
      </div>
    </li>
  );
}

function PointingNote({ pointing }: { pointing: Pointing }) {
  return (
    <p className="flex items-center gap-1 px-1 text-caption text-ink-3">
      <Crosshair aria-hidden className="size-3" />
      Asked about {describePointing(pointing)}
    </p>
  );
}

/** "the selected Item", "an Entry" or the quoted passage. */
export function describePointing(pointing: Pointing): string {
  const first = pointing[0];
  if (first === undefined) return "nothing";
  const what =
    first.kind === "item"
      ? "an Item"
      : first.kind === "entry"
        ? "an Entry"
        : `“${first.quote.length > 48 ? `${first.quote.slice(0, 47)}…` : first.quote}”`;
  return pointing.length > 1 ? `${what} and ${pointing.length - 1} more` : what;
}

const noticeIcon: Record<RunNotice["tone"], ReactNode> = {
  queued: <Clock aria-hidden className="size-3.5" />,
  stopped: <CircleStop aria-hidden className="size-3.5" />,
  problem: <CircleAlert aria-hidden className="size-3.5" />,
  muted: null,
};

function RunLine({
  notice,
  run,
  mine,
}: {
  notice: RunNotice;
  run: RunSummary;
  mine: boolean;
}) {
  const cancel = useMutation(api.runs.cancelQueued);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function onCancel() {
    setCancelError(null);
    try {
      await cancel({ runId: run._id });
    } catch (caught) {
      const kind =
        caught instanceof ConvexError
          ? (caught.data as { kind?: string }).kind
          : undefined;
      setCancelError(
        kind === "RunNotQueued"
          ? "Utsavvy already started on this."
          : "Couldn't cancel it. Try again.",
      );
    }
  }

  return (
    <>
      <p
        data-run-notice={notice.tone}
        className={cn(
          "flex items-center gap-1.5 px-1 text-caption font-medium",
          notice.tone === "queued" && "text-action",
          notice.tone === "stopped" && "text-ink-2",
          notice.tone === "problem" && "text-warn",
          notice.tone === "muted" && "text-ink-3",
        )}
      >
        {noticeIcon[notice.tone]}
        <span>{notice.text}</span>
        {notice.tone === "queued" && mine ? (
          <Button
            variant="text"
            size="sm"
            className="-my-1 h-6 px-1.5 text-caption"
            onClick={() => void onCancel()}
          >
            Cancel
          </Button>
        ) : null}
      </p>
      {cancelError ? (
        <p role="status" className="px-1 text-caption text-warn">
          {cancelError}
        </p>
      ) : null}
    </>
  );
}

function Reply({
  row,
  eventId,
  palette,
}: {
  row: Extract<TimelineRow, { kind: "reply" }>;
  eventId: Id<"events">;
  palette: string[];
}) {
  const { message, run } = row;
  const streaming =
    message.status === "streaming" || message.status === "pending";
  const [visible] = useSmoothText(message.text, {
    startStreaming: streaming,
  });
  const notice = run ? runNotice(run, 0, hasText(message)) : null;
  const sources = sourcesOf(message);
  const waiting = streaming && visible.length === 0;

  return (
    <li
      className="flex gap-2.5 pr-4 animate-in fade-in-0 duration-(--dur-arrival) ease-emphasized motion-reduce:animate-none"
      data-chat-row="reply"
      data-status={message.status}
    >
      <AssistantOrb
        palette={palette}
        size={24}
        state={waiting ? "thinking" : streaming ? "streaming" : "idle"}
        className="mt-5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-caption font-medium text-ink-3">
          Utsavvy{run ? ` for ${run.requestedByName}` : ""}
        </p>
        <div className="text-body break-words whitespace-pre-wrap text-ink">
          {waiting ? (
            <span
              className="inline-flex items-center gap-1 py-1.5"
              aria-label="Utsavvy is thinking"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3 motion-reduce:animate-none" />
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:150ms] motion-reduce:animate-none" />
              <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:300ms] motion-reduce:animate-none" />
            </span>
          ) : (
            visible
          )}
          {streaming && !waiting ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse bg-action motion-reduce:animate-none"
            />
          ) : null}
        </div>
        {sources.length > 0 ? (
          <Citations
            eventId={eventId}
            messageId={message.id}
            sources={sources}
            ready={!streaming}
          />
        ) : null}
        {(notice && run) || (run && !streaming) ? (
          <div className="flex items-center gap-2 empty:hidden">
            {notice && run ? (
              <RunLine notice={notice} run={run} mine={false} />
            ) : null}
            {run && !streaming ? <UndoAllButton groupKey={run._id} /> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function sourcesOf(message: UIMessage): CitationSource[] {
  const seen = new Set<string>();
  const sources: CitationSource[] = [];
  for (const part of message.parts) {
    if (part.type !== "source-url" || seen.has(part.url)) continue;
    seen.add(part.url);
    sources.push({ url: part.url, title: part.title });
  }
  return sources;
}

function SystemMessage({
  row,
  eventId,
  palette,
}: {
  row: Extract<TimelineRow, { kind: "system" }>;
  eventId: Id<"events">;
  palette: string[];
}) {
  const card = row.annotation.card!;
  const Card = card.kind === "system" ? null : CHAT_CARDS[card.kind];
  return (
    <li className="flex gap-2.5 pr-4" data-chat-row="system">
      <AssistantOrb palette={palette} size={24} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {hasText(row.message) ? (
          <p className="text-body break-words whitespace-pre-wrap text-ink-2">
            {row.message.text}
          </p>
        ) : null}
        {Card ? (
          <Card
            eventId={eventId}
            cardId={card.id}
            annotation={row.annotation}
          />
        ) : null}
      </div>
    </li>
  );
}
