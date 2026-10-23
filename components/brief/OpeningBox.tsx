"use client";

import { useMutation } from "convex/react";
import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { BriefError, useBriefCall } from "./shared";

const MAX = 2000;

/**
 * The box under the opening line, where the Member describes the Event in
 * their own words, in any language (first-brief.md decision 1). Enter sends;
 * Shift+Enter makes a new line.
 */
export function OpeningBox({ eventId }: { eventId: Id<"events"> }) {
  const id = useId();
  const submitText = useMutation(api.brief.submitText);
  const { run, busy, error } = useBriefCall((text: string) =>
    submitText({ eventId, text }),
  );
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    if (await run(text)) setSent(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  };

  if (sent) {
    return (
      <p
        className="flex items-center gap-2 text-label text-ink-2"
        role="status"
      >
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin text-action motion-reduce:animate-none"
        />
        Reading your Brief…
      </p>
    );
  }

  return (
    <form
      onSubmit={send}
      className="flex flex-col gap-2 rounded-lg border border-rule-strong bg-surface p-2 focus-within:border-action"
      data-brief-opening
    >
      <label htmlFor={id} className="sr-only">
        Describe what you&apos;re planning
      </label>
      <textarea
        id={id}
        rows={3}
        value={text}
        maxLength={MAX}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder="For example: my sister's wedding in Jaipur next February, around 300 people, budget 25 lakh"
        className={cn(
          "w-full resize-none bg-transparent px-1.5 py-1 text-body text-ink placeholder:text-ink-3",
          "focus-visible:outline-none",
        )}
      />
      <div className="flex items-center justify-between gap-2 pl-1.5">
        <p className="text-caption text-ink-3">
          English, Hindi or Hinglish, as you&apos;d say it.
        </p>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          <SendHorizontal />
          Start planning
        </Button>
      </div>
      <BriefError>{error}</BriefError>
    </form>
  );
}
