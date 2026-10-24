"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowUp, Crosshair, X } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSelection, useSetSelection } from "@/components/shell/selection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describePointing } from "./ChatMessages";
import { composerMode } from "./composerMode";

/** Same limit as `convex/chat.ts`. */
const MAX_MESSAGE_LENGTH = 4000;

const DONT_REPLY_TIP =
  "Utsavvy still reads this message as background. It just won't answer it.";

function errorText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string; max?: number };
    if (data.kind === "MessageTooLong")
      return `That message is too long. Keep it under ${data.max ?? MAX_MESSAGE_LENGTH} characters.`;
    if (data.kind === "TooManyQueued")
      return `You already have ${data.max ?? 3} messages waiting for Utsavvy. Send this once one is answered, or turn on Don't reply.`;
    if (data.kind === "TooManyPointed")
      return `Point at ${data.max ?? 5} things or fewer in one message.`;
    if (data.kind === "QuoteTooLong")
      return `Select a shorter passage, up to ${data.max ?? 500} characters.`;
    if (data.kind === "AccessDenied")
      return "You can't post in this Chat anymore.";
  }
  return "That message didn't send. Check your connection and try again.";
}

/**
 * The Chat's composer: the message, the Don't reply toggle beside Send (it
 * resets after every message) and, when something is selected on the Canvas,
 * the pointing it attaches.
 */
export function Composer({ eventId }: { eventId: Id<"events"> }) {
  const send = useMutation(api.chat.send);
  const selection = useSelection();
  const setSelection = useSetSelection();
  const [text, setText] = useState("");
  const [dontReply, setDontReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const errorId = useId();

  const pointing = selection ? [selection] : [];
  const mode = composerMode(selection !== null, dontReply);
  const canSend = text.trim().length > 0 && !sending;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await send({ eventId, text, dontReply: mode.dontReply, pointing });
      setText("");
      setDontReply(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSending(false);
      textarea.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="m-3 mt-1 flex flex-col gap-2 rounded-xl bg-surface p-2.5 shadow-item transition-shadow duration-(--dur-feedback) ease-standard focus-within:shadow-[0_0_0_2px_var(--action)]"
      aria-label="Message the Chat"
    >
      {selection ? (
        <div className="flex items-center gap-1.5 self-start rounded-full bg-selected py-0.5 pr-0.5 pl-2.5 text-caption font-medium text-on-selected">
          <Crosshair aria-hidden className="size-3" />
          <span>Asking about {describePointing(pointing)}</span>
          <Button
            variant="text"
            size="sm"
            icon
            className="size-6 text-on-selected"
            aria-label="Don't attach the selection"
            onClick={() => setSelection(null)}
          >
            <X />
          </Button>
        </div>
      ) : null}
      <label htmlFor={inputId} className="sr-only">
        Message
      </label>
      <textarea
        id={inputId}
        ref={textarea}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={mode.placeholder}
        aria-describedby={error ? errorId : undefined}
        className="max-h-40 min-h-[3.25rem] w-full resize-none [field-sizing:content] rounded-md bg-transparent px-1.5 py-1 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none"
      />
      {error ? (
        <p id={errorId} className="text-caption text-warn">
          {error}
        </p>
      ) : null}
      {mode.note ? (
        <p className="text-caption text-ink-3" data-dont-reply-note>
          {mode.note}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3 pl-1.5">
        <Tooltip content={mode.note ?? DONT_REPLY_TIP}>
          <span className="inline-flex" data-dont-reply>
            <Switch
              label="Don't reply"
              checked={mode.dontReply}
              disabled={mode.dontReplyDisabled}
              onCheckedChange={setDontReply}
              aria-description={mode.note ?? DONT_REPLY_TIP}
            />
          </span>
        </Tooltip>
        <Button type="submit" disabled={!canSend} aria-label="Send">
          Send
          <ArrowUp aria-hidden />
        </Button>
      </div>
    </form>
  );
}
