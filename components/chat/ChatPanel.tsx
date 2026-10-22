"use client";

import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Square } from "lucide-react";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AssistantOrb } from "@/components/shell/AssistantOrb";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatRow } from "./ChatMessages";
import { Composer } from "./Composer";
import {
  modelCaption,
  stopState,
  type ChatDetails,
  type RunSummary,
} from "./runState";
import { buildTimeline, hasText } from "./timeline";

export type ChatPanelProps = { eventId: string };

/**
 * The Event's Chat (S5): every Member sees the same messages and the
 * Assistant's reply as it streams, the run queue, Stop, and the composer
 * with its Don't reply toggle.
 */
export function ChatPanel({ eventId }: ChatPanelProps) {
  return (
    <ChatErrorBoundary key={eventId}>
      <Chat eventId={eventId} />
    </ChatErrorBoundary>
  );
}

function Chat({ eventId }: { eventId: string }) {
  const details = useQuery(api.chat.details, { eventId });
  const active = details?.runs.find(
    (run) => run.status === "running" || run.status === "stopping",
  );

  return (
    <section
      aria-labelledby="chat-heading"
      className="flex h-full min-h-0 flex-col"
      data-chat
    >
      <ChatHeader details={details} active={active} />
      {details === undefined ? (
        <ChatLoading />
      ) : details === null ? (
        <p className="m-4 rounded-md border border-dashed border-rule-strong p-4 text-label text-ink-2">
          This Chat isn&apos;t open to you. Ask the Event&apos;s Owner for an
          invite link.
        </p>
      ) : (
        <ChatBody
          eventId={eventId as Id<"events">}
          details={details}
          active={active}
        />
      )}
    </section>
  );
}

function ChatHeader({
  details,
  active,
}: {
  details: ChatDetails | null | undefined;
  active: RunSummary | undefined;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-rule px-4 py-3">
      <AssistantOrb
        palette={[]}
        state={active ? "streaming" : "idle"}
        size={36}
      />
      <div className="min-w-0">
        <h2
          id="chat-heading"
          className="font-display text-title font-semibold text-ink"
        >
          Utsavvy
        </h2>
        <p
          className="truncate text-caption text-ink-3"
          data-chat-model
          title="The model that answered the latest reply"
        >
          {details ? modelCaption(details.latestModel) : " "}
        </p>
      </div>
    </header>
  );
}

function ChatLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
      <span className="sr-only">Loading the Chat</span>
      {[0.7, 0.5, 0.8].map((width) => (
        <div
          key={width}
          className="h-10 animate-pulse rounded-lg bg-surface-sunk motion-reduce:animate-none"
          style={{ width: `${width * 100}%` }}
        />
      ))}
    </div>
  );
}

const PAGE = 30;

function ChatBody({
  eventId,
  details,
  active,
}: {
  eventId: Id<"events">;
  details: ChatDetails;
  active: RunSummary | undefined;
}) {
  const threadId = details.threadId;
  const { results, status, loadMore } = useUIMessages(
    api.chat.list,
    threadId ? { eventId, threadId } : "skip",
    { initialNumItems: PAGE, stream: true },
  );
  const messages = useMemo(
    () => (threadId ? results : []),
    [threadId, results],
  );
  const rows = useMemo(
    () => buildTimeline(messages, details),
    [messages, details],
  );

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const last = rows.at(-1);
  const lastSize = last ? `${last.key}:${last.message.text.length}` : "";
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [lastSize, rows.length]);

  return (
    <>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            48;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"
      >
        {status === "CanLoadMore" ? (
          <div className="mb-3 flex justify-center">
            <Button variant="text" size="sm" onClick={() => loadMore(PAGE)}>
              Show earlier messages
            </Button>
          </div>
        ) : null}
        {rows.length === 0 && status !== "LoadingFirstPage" ? (
          <EmptyChat canPost={details.me.canPost} />
        ) : (
          <ol className="flex flex-col gap-4" aria-label="Chat messages">
            {rows.map((row) => (
              <ChatRow
                key={row.key}
                row={row}
                eventId={eventId}
                myMembershipId={details.me.membershipId}
                palette={[]}
              />
            ))}
          </ol>
        )}
      </div>
      <ReplyAnnouncer messages={messages} details={details} />
      {active ? (
        <ReplyingBar run={active} myMembershipId={details.me.membershipId} />
      ) : null}
      {details.me.canPost ? (
        <Composer eventId={eventId} />
      ) : (
        <p className="border-t border-rule px-4 py-3 text-label text-ink-2">
          Viewers can read the Chat. Only Members can post or ask Utsavvy.
        </p>
      )}
    </>
  );
}

function EmptyChat({ canPost }: { canPost: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-display text-title text-ink">Plan out loud here</p>
      <p className="max-w-64 text-label text-ink-2">
        {canPost
          ? "Ask Utsavvy to plan, or leave a note for the other Members. Everyone in the Event sees this Chat."
          : "Messages between the Members and Utsavvy appear here."}
      </p>
    </div>
  );
}

/** Re-renders every second while `enabled`, for countdowns. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

/** "Utsavvy is replying to Rohan" with Stop (rules 20 and 21). */
function ReplyingBar({
  run,
  myMembershipId,
}: {
  run: RunSummary;
  myMembershipId: string;
}) {
  const stop = useMutation(api.runs.stop);
  const [error, setError] = useState<string | null>(null);
  const stopping = run.status === "stopping";
  const mine = run.requestedBy === myMembershipId;
  const now = useNow(!stopping && !mine);
  const { allowed, secondsLeft } = stopState(run, myMembershipId, now);

  async function onStop() {
    setError(null);
    try {
      await stop({ runId: run._id });
    } catch (caught) {
      const data =
        caught instanceof ConvexError
          ? (caught.data as { kind?: string })
          : null;
      setError(
        data?.kind === "StopTooEarly"
          ? `Only ${run.requestedByName} can stop it yet.`
          : "Couldn't stop the reply. Try again.",
      );
    }
  }

  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={!allowed || stopping}
      onClick={() => void onStop()}
      aria-label={stopping ? "Stopping the reply" : "Stop the reply"}
    >
      <Square aria-hidden className="fill-current" />
      {stopping ? "Stopping" : "Stop"}
    </Button>
  );

  return (
    <div
      className="flex shrink-0 items-center gap-2.5 border-t border-rule bg-surface-header px-4 py-2"
      data-replying
    >
      <AssistantOrb palette={[]} size={20} state="streaming" />
      <p className="min-w-0 flex-1 truncate text-label text-ink-2">
        {stopping
          ? "Stopping…"
          : `Utsavvy is replying to ${mine ? "you" : run.requestedByName}`}
        {error ? (
          <span className="block text-caption text-warn">{error}</span>
        ) : null}
      </p>
      {allowed || stopping ? (
        button
      ) : (
        <Tooltip
          content={`${run.requestedByName} can stop it now. Anyone can in ${secondsLeft} s.`}
        >
          <span tabIndex={0} className="rounded-sm">
            {button}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Announces each finished reply through a polite live region, once, so screen
 * reader users hear replies without the stream being read token by token.
 */
function ReplyAnnouncer({
  messages,
  details,
}: {
  messages: UIMessage[];
  details: ChatDetails;
}) {
  const seen = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cardMessages = useMemo(
    () =>
      new Set(
        details.annotations
          .filter((annotation) => annotation.card)
          .map((annotation) => annotation.messageId),
      ),
    [details.annotations],
  );

  useEffect(() => {
    const finished = messages.filter(
      (message) =>
        message.role === "assistant" &&
        message.status !== "streaming" &&
        message.status !== "pending" &&
        hasText(message),
    );
    if (seen.current === null) {
      // Replies already in the Chat when it opens aren't news.
      seen.current = new Set(finished.map((message) => message.key));
      return;
    }
    const fresh = finished.filter((message) => !seen.current!.has(message.key));
    if (fresh.length === 0) return;
    for (const message of fresh) seen.current.add(message.key);
    const latest = fresh.at(-1)!;
    setAnnouncement(
      cardMessages.has(latest.id)
        ? `Utsavvy: ${latest.text}`
        : `Utsavvy replied: ${latest.text}`,
    );
  }, [messages, cardMessages]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-chat-announcer
    >
      {announcement}
    </div>
  );
}

class ChatErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-start gap-2 p-4">
        <p className="text-label text-ink-2">The Chat couldn&apos;t load.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </Button>
      </div>
    );
  }
}
