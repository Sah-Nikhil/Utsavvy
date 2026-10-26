"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ChevronRight, Crosshair, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useMembership } from "@/components/people/useMembership";
import { AssistantOrb } from "@/components/shell/AssistantOrb";
import { useShowItem } from "@/components/shell/showItem";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { HistoryProblem, HistoryRow } from "@/convex/history";
import { cn } from "@/lib/utils";
import { UndoAllButton } from "./UndoAllButton";
import { arrange, type Block } from "./arrange";

// S6 (edit history and Restore) owns this folder.

export type HistoryPanelProps = { eventId: string };

const PAGE_SIZE = 30;

/**
 * The edit history (roles.md "History and attribution"): every change,
 * newest first, with who made it. An Assistant reply's changes sit together
 * under one group ("Utsavvy for Meera: Plan the sangeet (8 changes)") that
 * opens into its changes. Everyone sees it; Members can Restore a change, and
 * clicking a change shows its Item on the Canvas.
 */
export function HistoryPanel({ eventId }: HistoryPanelProps) {
  const me = useMembership(eventId);
  if (me === undefined) {
    return <p className="text-label text-ink-3">Loading history…</p>;
  }
  if (me.status === "denied") {
    return (
      <p className="text-label text-ink-2">
        You&apos;re not in this Event, so its history isn&apos;t shown.
      </p>
    );
  }
  return <History eventId={me.eventId} />;
}

const PROBLEMS: Record<HistoryProblem, string> = {
  notFound: "That change isn't in the history any more.",
  notRestorable: "That change can't be restored.",
  useDelete:
    "Restoring that would delete it again. Delete it from the Canvas instead.",
  gone: "What that change touched no longer exists.",
  functionGone: "That Function was skipped, so this stays for the whole Event.",
  sectionDeleted:
    "Its Section was deleted. Restore the Section first, then this.",
  itemDeleted: "Its Item was deleted. Restore the Item first, then this.",
  tooManySections:
    "The Canvas already has 30 custom Sections. Delete one, then restore this.",
  sectionNotEmpty:
    "That Section still holds Items, so it stays. Move or delete them first.",
  markerMovedSince:
    "That Marker has been moved since, perhaps from another Event, so it stays where it is now.",
};

function restoreProblem(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string; problem?: HistoryProblem };
    if (data.kind === "HistoryRefused" && data.problem)
      return PROBLEMS[data.problem];
    if (data.kind === "AccessDenied")
      return "You can't restore that change. Only Members can restore, and some settings only the Owner and Co-owners can.";
  }
  return "Restore didn't work. Try again.";
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function History({ eventId }: { eventId: Id<"events"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.list,
    { eventId },
    { initialNumItems: PAGE_SIZE },
  );
  const restore = useMutation(api.history.restore);
  const [notice, setNotice] = useState<{
    tone: "done" | "problem";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState<Id<"changes"> | null>(null);

  async function onRestore(row: HistoryRow) {
    setBusy(row.changeId);
    setNotice(null);
    try {
      const { changed } = await restore({ changeId: row.changeId });
      setNotice({
        tone: "done",
        text: changed
          ? "Restored. The Restore is now the newest change, so you can undo it the same way."
          : "That's already how it is now, so nothing changed.",
      });
    } catch (error) {
      setNotice({ tone: "problem", text: restoreProblem(error) });
    } finally {
      setBusy(null);
    }
  }

  if (status === "LoadingFirstPage") {
    return <p className="text-label text-ink-3">Loading history…</p>;
  }
  if (results.length === 0) {
    return (
      <div className="grid gap-1 py-6 text-center">
        <p className="font-display text-title font-semibold text-ink">
          Nothing has changed yet
        </p>
        <p className="text-label text-ink-3">
          Every edit to the Canvas, and every change to who is in the Event,
          shows up here with who made it.
        </p>
      </div>
    );
  }

  const days = arrange(results, new Date());
  const rowProps = {
    busy,
    onRestore,
    onUndone: (text: string, tone: "done" | "problem") =>
      setNotice({ tone, text }),
  };
  return (
    <div className="grid gap-5" data-history>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-label empty:hidden",
          notice?.tone === "problem" ? "text-warn" : "text-ink-2",
        )}
      >
        {notice?.text ?? ""}
      </p>
      {days.map((day) => (
        <section
          key={day.label}
          aria-label={day.label}
          className="grid gap-1.5"
        >
          <h3 className="text-caption font-semibold tracking-[0.02em] text-ink-3 uppercase">
            {day.label}
          </h3>
          <ul className="grid">
            {day.blocks.map((block) =>
              block.kind === "single" ? (
                <ChangeRow
                  key={block.row.changeId}
                  row={block.row}
                  {...rowProps}
                />
              ) : (
                <GroupRow
                  key={`${block.key}:${block.rows[0]!.changeId}`}
                  block={block}
                  {...rowProps}
                />
              ),
            )}
          </ul>
        </section>
      ))}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-center"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Show earlier changes"}
        </Button>
      ) : null}
    </div>
  );
}

type RowActions = {
  busy: Id<"changes"> | null;
  onRestore: (row: HistoryRow) => void;
  onUndone: (text: string, tone: "done" | "problem") => void;
};

/**
 * One Assistant reply, accepted Proposal or Undo all, closed to its title
 * until opened.
 */
function GroupRow({
  block,
  busy,
  onRestore,
  onUndone,
}: { block: Extract<Block, { kind: "group" }> } & RowActions) {
  const first = block.rows[0]!;
  const [open, setOpen] = useState(false);
  const listId = `history-group-${block.rows[0]!.changeId}`;
  return (
    <li className="border-b border-rule py-1.5 last:border-b-0">
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {first.byAssistant ? (
            <AssistantOrb palette={[]} size={28} className="mt-0.5 shrink-0" />
          ) : (
            // An Undo all is the Member's own; the title already names them.
            <span aria-hidden className="shrink-0">
              <Avatar name={first.who.replace(/ \(left\)$/, "")} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-body text-ink">{block.title}</span>
            <span className="block text-caption text-ink-3 num">
              {timeLabel(block.rows.at(-1)!.at)}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              "mt-1 size-4 shrink-0 text-ink-3 transition-transform duration-(--dur-feedback) ease-standard",
              open && "rotate-90",
            )}
          />
        </button>
        <span className="mt-1.5">
          <UndoAllButton
            groupKey={block.key}
            label={block.title}
            onDone={onUndone}
          />
        </span>
      </div>
      <ul
        id={listId}
        hidden={!open}
        aria-label={block.title}
        className="ml-[1.375rem] grid border-l border-rule pl-4"
      >
        {block.rows.map((row) => (
          <ChangeRow
            key={row.changeId}
            row={row}
            busy={busy}
            onRestore={onRestore}
            inGroup
          />
        ))}
      </ul>
    </li>
  );
}

function ChangeRow({
  row,
  busy,
  onRestore,
  inGroup = false,
}: { row: HistoryRow; inGroup?: boolean } & Omit<RowActions, "onUndone">) {
  const setSelection = useShowItem();
  const meta = inGroup
    ? timeLabel(row.at)
    : `${row.who} · ${timeLabel(row.at)}`;
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block text-body text-ink">{row.summary}</span>
      <span className="block text-caption text-ink-3 num">{meta}</span>
    </span>
  );
  const who = inGroup ? null : row.byAssistant ? (
    <AssistantOrb palette={[]} size={28} className="mt-0.5 shrink-0" />
  ) : (
    // The row's text already names who; the avatar is decoration.
    <span aria-hidden className="shrink-0">
      <Avatar name={row.who.replace(/ \(left\)$/, "")} />
    </span>
  );

  return (
    <li
      data-change={row.changeId}
      className={cn(
        "flex items-start gap-1",
        inGroup ? "py-0.5" : "border-b border-rule py-1.5 last:border-b-0",
      )}
    >
      {row.target ? (
        <SheetClose
          render={<button type="button" />}
          onClick={() => setSelection(row.target)}
          className="group flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {who}
          {text}
          <VisuallyHidden>, show on the Canvas</VisuallyHidden>
          <Crosshair
            aria-hidden
            className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity duration-(--dur-feedback) group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </SheetClose>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-start gap-3 px-1 py-1.5">
          {who}
          {text}
        </div>
      )}
      {row.canRestore ? (
        <Button
          variant="text"
          size="sm"
          className="mt-1.5 shrink-0"
          disabled={busy !== null}
          onClick={() => onRestore(row)}
        >
          <RotateCcw />
          {busy === row.changeId ? "Restoring…" : "Restore"}
          <VisuallyHidden>: {row.summary}</VisuallyHidden>
        </Button>
      ) : null}
    </li>
  );
}
