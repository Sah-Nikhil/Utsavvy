"use client";

import { ConvexError } from "convex/values";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { countCharacters } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";

import { COMMENT_MAX, MAX_COMMENTS_PER_ITEM, isBlankComment } from "./text";

export { COMMENT_MAX };
/** The counter shows once this few characters are left. */
const COUNTER_FROM = 200;

const PROBLEMS: Record<string, string> = {
  empty: "Write something first.",
  tooLong: `A Comment can be up to ${COMMENT_MAX.toLocaleString("en-IN")} characters.`,
  noTarget: "This was deleted, so it can't take Comments any more.",
  badReply: "That thread can't take replies. Start a new Comment instead.",
  notYours: "Only the person who wrote a Comment can change it.",
  notFound: "That Comment is gone.",
  tooMany: `This Item has reached its limit of ${MAX_COMMENTS_PER_ITEM} Comments.`,
  passage: "Comments on a highlighted passage aren't here yet.",
};

/** What went wrong with a Comment, in words for the person. */
export function commentErrorText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string; problem?: string };
    if (data.kind === "CommentRefused" && data.problem)
      return PROBLEMS[data.problem] ?? "That Comment couldn't be saved.";
    if (data.kind === "AccessDenied")
      return "You can't comment in this Event any more.";
  }
  return "That didn't go through. Check your connection and try again.";
}

/**
 * A text box with its send button: a new Comment, a reply or an edit. Enter
 * adds a line; Ctrl+Enter (or ⌘+Enter) sends.
 */
export function CommentComposer({
  label,
  placeholder,
  submitLabel,
  initial = "",
  autoFocus = false,
  compact = false,
  onSubmit,
  onCancel,
}: {
  /** The text box's accessible name, e.g. "Add a Comment" or "Reply to Papa". */
  label: string;
  placeholder?: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  /** Smaller, for replies and edits inside a thread. */
  compact?: boolean;
  /** Throws to keep the text and show the problem. */
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const counterId = useId();

  const length = countCharacters(body.trim());
  const left = COMMENT_MAX - length;
  const empty = isBlankComment(body);
  const over = left < 0;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (empty || over || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = body;
      await onSubmit(sent);
      // Keep anything typed while it was sending.
      setBody((current) => (current === sent ? "" : current));
    } catch (err) {
      setError(commentErrorText(err));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  const describedBy =
    [error ? errorId : null, left <= COUNTER_FROM ? counterId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form onSubmit={send} className="grid gap-2">
      <textarea
        aria-label={label}
        aria-invalid={over || error !== null || undefined}
        aria-describedby={describedBy}
        value={body}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        // The composer opens on purpose (Reply, Edit), so focus follows.
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full min-w-0 resize-y rounded-sm border border-rule-strong bg-surface px-3 py-2 text-body leading-normal text-ink",
          "transition-[border-color,box-shadow] duration-(--dur-feedback) ease-standard",
          "placeholder:text-ink-3 hover:border-ink-2",
          "focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
          "aria-invalid:border-warn aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--warn)]",
          compact ? "min-h-16" : "min-h-20",
        )}
      />
      <div className="flex min-h-8 items-center gap-2">
        <div className="min-w-0 flex-1 text-caption">
          {error ? (
            <p id={errorId} role="alert" className="text-warn">
              {error}
            </p>
          ) : left <= COUNTER_FROM ? (
            <p
              id={counterId}
              className={cn("num", over ? "text-warn" : "text-ink-3")}
            >
              {over
                ? `${(-left).toLocaleString("en-IN")} characters too many`
                : `${left.toLocaleString("en-IN")} characters left`}
            </p>
          ) : (
            <p className="hidden text-ink-3 sm:block">Ctrl+Enter to send</p>
          )}
        </div>
        {onCancel ? (
          <Button type="button" variant="text" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          variant={compact ? "tonal" : "filled"}
          disabled={empty || over || sending}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
