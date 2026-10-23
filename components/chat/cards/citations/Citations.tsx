"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, Link as LinkIcon, StickyNote } from "lucide-react";
import { useState } from "react";
import { sourceLabel } from "@/components/chat/timeline";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** One web page Utsavvy's answer cites (a `source-url` part of the reply). */
export type CitationSource = { url: string; title: string | undefined };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string };

/** The page's host without "www.", for the line under its title. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function failureMessage(error: unknown): string {
  const kind =
    error instanceof ConvexError
      ? (error.data as { kind?: string }).kind
      : undefined;
  if (kind === "AccessDenied") return "Only Members can add to the Canvas.";
  return "Couldn't save it. Try again.";
}

/**
 * The sources under a web search answer (S5's Chat web search), numbered in
 * the order Utsavvy cited them, with "Save as Note" for Members: the server
 * copies the stored answer and its sources into a Note in the Notes Section,
 * so the citations stay with it on the Canvas. Viewers see the sources only.
 */
export function Citations({
  eventId,
  messageId,
  sources,
  ready = true,
}: {
  eventId: Id<"events">;
  /** The Agent message ID of the reply. */
  messageId: string;
  sources: readonly CitationSource[];
  /** False while the reply still streams; the answer can be saved once it ends. */
  ready?: boolean;
}) {
  const details = useQuery(api.chat.details, { eventId });
  const save = useMutation(api.assistant.tools.core.saveAnswerAsNote);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const canSave = ready && details?.me.canPost === true;

  async function onSave() {
    setState({ kind: "saving" });
    try {
      await save({ eventId, messageId });
      setState({ kind: "saved" });
    } catch (error) {
      setState({ kind: "failed", message: failureMessage(error) });
    }
  }

  return (
    <section
      aria-label="Sources"
      className="mt-1 flex flex-col gap-1.5 border-t border-rule pt-2"
      data-chat-citations
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-caption font-semibold text-ink-2">
          Sources
          <span className="ml-1.5 font-normal tabular-nums text-ink-3">
            {sources.length}
          </span>
        </p>
        {canSave ? (
          state.kind === "saved" ? (
            <span className="inline-flex h-8 items-center gap-1.5 px-2 text-label font-semibold text-ink-2">
              <Check aria-hidden className="size-3.5 text-booked" />
              Saved to Notes
            </span>
          ) : (
            <Button
              variant="text"
              size="sm"
              onClick={onSave}
              disabled={state.kind === "saving"}
            >
              <StickyNote aria-hidden />
              {state.kind === "saving" ? "Saving…" : "Save as Note"}
            </Button>
          )
        ) : null}
      </div>
      <ol className="flex flex-col gap-1">
        {sources.map((source, index) => (
          <li key={source.url} className="flex min-w-0 gap-2 text-caption">
            <span className="w-4 shrink-0 text-right tabular-nums text-ink-3">
              {index + 1}.
            </span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex min-w-0 flex-col rounded-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="inline-flex min-w-0 items-center gap-1 text-action underline-offset-2 group-hover:underline">
                <LinkIcon aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{sourceLabel(source)}</span>
              </span>
              {source.title ? (
                <span className="truncate pl-4 text-ink-3">
                  {hostOf(source.url)}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="text-caption empty:hidden">
        {state.kind === "saved" ? (
          <span className="sr-only">
            Saved as a Note with its sources, in the Notes Section.
          </span>
        ) : state.kind === "failed" ? (
          <span className="text-warn">{state.message}</span>
        ) : null}
      </p>
    </section>
  );
}
