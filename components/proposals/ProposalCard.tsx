"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowRight,
  Check,
  Clock,
  RefreshCw,
  Repeat2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ProposalCardView } from "@/convex/proposals";
import { cn } from "@/lib/utils";
import { seenAt, useExpiryClock } from "./expiry";

/*
 * A Proposal (S10, assistant-behavior.md rules 10 to 13, 16 and 19): the
 * changes the Assistant prepared, each in plain words with its before and
 * after, and Accept and Reject for Members. Viewers see the same card live,
 * without buttons. A closed card stays where it was, greyed, with its reason.
 *
 * Used in the Chat (`components/chat/cards/proposal/`) and in Comment threads
 * (S17). The server decides everything shown here (`api.proposals.get`): the
 * card only renders it and sends the Member's tap.
 */

type Action = "accept" | "reject" | "askAgain";
type Pending = { action: Action } | null;

function failureMessage(error: unknown): string {
  const data =
    error instanceof ConvexError
      ? (error.data as { kind?: string; message?: string })
      : null;
  if (data?.kind === "AccessDenied")
    return "Only Members can decide on a Proposal.";
  if (data?.kind === "TooManyQueued")
    return "You already have messages waiting for Utsavvy. Try again once one is answered.";
  if (typeof data?.message === "string") return data.message;
  return "That didn't go through. Try again.";
}

/** "Decor ₹3,00,000 → ₹2,20,000": the part before the last arrow and the part after it. */
function splitLine(line: string): { before: string; after: string | null } {
  const at = line.lastIndexOf(" → ");
  if (at === -1) return { before: line, after: null };
  return { before: line.slice(0, at), after: line.slice(at + 3) };
}

const STATUS_ICON: Record<ProposalCardView["status"]["kind"], ReactNode> = {
  open: null,
  accepted: <Check aria-hidden className="size-3.5 text-booked" />,
  rejected: <X aria-hidden className="size-3.5" />,
  replaced: <Repeat2 aria-hidden className="size-3.5" />,
  expired: <Clock aria-hidden className="size-3.5" />,
  outOfDate: <TriangleAlert aria-hidden className="size-3.5 text-warn" />,
};

export function ProposalCard({
  eventId,
  proposalId,
  showSummary = true,
}: {
  eventId: Id<"events">;
  proposalId: Id<"proposals">;
  /** False where the line above the card already shows the summary (the Chat). */
  showSummary?: boolean;
}) {
  const live = useQuery(api.proposals.get, { eventId, proposalId });
  const now = useExpiryClock(live?.expiresAt);
  const accept = useMutation(api.proposals.accept);
  const reject = useMutation(api.proposals.reject);
  const askAgain = useMutation(api.proposals.askAgain);
  const [pending, setPending] = useState<Pending>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [askedAgain, setAskedAgain] = useState(false);
  const headingId = useId();

  if (live === undefined) {
    return (
      <div
        className="h-28 animate-pulse rounded-md bg-surface-sunk motion-reduce:animate-none"
        aria-hidden
        data-proposal-loading
      />
    );
  }

  async function run(action: Action) {
    setPending({ action });
    setProblem(null);
    try {
      if (action === "askAgain") {
        await askAgain({ eventId, proposalId });
        setAskedAgain(true);
      } else {
        const result = await (action === "accept" ? accept : reject)({
          eventId,
          proposalId,
        });
        if (!result.ok) setProblem(result.message);
      }
    } catch (error) {
      setProblem(failureMessage(error));
    } finally {
      setPending(null);
    }
  }

  // Past its 24 hours, an open card reads as expired before the job runs.
  const view = seenAt(live, now);
  const { status } = view;
  const open = status.kind === "open";
  const busy = pending !== null;

  return (
    <section
      aria-labelledby={headingId}
      data-proposal={proposalId}
      data-proposal-status={status.kind}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-md text-body transition-colors duration-300",
        open
          ? "bg-surface-raised shadow-item"
          : "border border-rule bg-surface-sunk text-ink-2",
      )}
    >
      <header className="flex items-start gap-2.5 px-3.5 pt-3">
        <Seal muted={!open} />
        <div className="flex min-w-0 flex-col">
          <h3
            id={headingId}
            className={cn(
              "font-display text-title leading-tight",
              open ? "text-ink" : "text-ink-2",
            )}
          >
            Proposal
          </h3>
          <p className="text-caption text-ink-3">
            For {view.requestedByName}.
            {open ? " Nothing changes until a Member accepts." : null}
          </p>
        </div>
      </header>

      {showSummary ? (
        <p className="px-3.5 pt-2 font-text text-body break-words">
          {view.summary}
        </p>
      ) : null}

      <ul
        aria-label="Changes"
        className="mx-3.5 mt-2.5 flex flex-col divide-y divide-rule border-y border-rule"
      >
        {view.lines.map((line, index) => {
          const { before, after } = splitLine(line);
          return (
            <li
              key={index}
              className="flex min-w-0 items-baseline gap-2 py-1.5 text-label"
              data-proposal-line
            >
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rotate-45 rounded-[1px]",
                  open ? "bg-motif" : "bg-ink-3",
                )}
              />
              <span className="num min-w-0 break-words">
                {after === null ? (
                  before
                ) : (
                  <>
                    <span className={open ? "text-ink-2" : undefined}>
                      {before}
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="mx-1 inline size-3 align-[-1px] text-ink-3"
                    />
                    <span className="sr-only"> to </span>
                    <span className={cn("font-semibold", open && "text-ink")}>
                      {after}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        {open ? (
          view.canDecide ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => run("accept")}
                disabled={busy}
                data-proposal-accept
              >
                <Check aria-hidden />
                {pending?.action === "accept" ? "Accepting…" : "Accept"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run("reject")}
                disabled={busy}
              >
                {pending?.action === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-ink-3">{status.text}</p>
          )
        ) : (
          <>
            <p
              className={cn(
                "inline-flex items-center gap-1.5 text-label font-semibold",
                status.kind === "outOfDate" ? "text-warn" : "text-ink-2",
              )}
              data-proposal-reason
            >
              {STATUS_ICON[status.kind]}
              {status.text}
            </p>
            {view.canAskAgain && !askedAgain ? (
              <Button
                size="sm"
                variant="tonal"
                onClick={() => run("askAgain")}
                disabled={busy}
                className="ml-auto"
              >
                <RefreshCw aria-hidden />
                {pending?.action === "askAgain" ? "Asking…" : "Ask again"}
              </Button>
            ) : null}
          </>
        )}
      </footer>

      <p aria-live="polite" className="px-3.5 pb-2.5 text-caption empty:hidden">
        {problem ? (
          <span className="text-warn">{problem}</span>
        ) : askedAgain ? (
          <span className="text-ink-2">
            Asked again. Utsavvy will propose from the current Canvas.
          </span>
        ) : null}
      </p>
    </section>
  );
}

/**
 * The card's mark: a small rangoli-style eight-point seal in the Ornaments'
 * terracotta, quiet grey once the Proposal is closed. Decorative only.
 */
function Seal({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn(
        "mt-0.5 size-6 shrink-0 transition-colors duration-300",
        muted ? "text-ink-3" : "text-motif",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="1.5"
        transform="rotate(45 12 12)"
      />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
