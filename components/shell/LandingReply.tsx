"use client";

import { useEffect, useState } from "react";
import { AssistantOrb } from "./AssistantOrb";

/*
 * The landing's demo reply: it arrives word by word, as a reply streams in the
 * Chat, with the orb working while it does and settling when it ends. It plays
 * once. The whole text is in the DOM from the start (only a clip moves), so
 * screen readers and reduced motion get the finished reply at once.
 */

const WORD_MS = 55;

export function LandingReply({ text }: { text: string }) {
  const words = text.split(" ");
  const [state, setState] = useState<"streaming" | "idle">("streaming");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = setTimeout(() => setState("idle"), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(
      () => setState("idle"),
      900 + words.length * WORD_MS + 400,
    );
    return () => clearTimeout(timer);
  }, [words.length]);

  return (
    <div className="flex gap-3">
      <AssistantOrb palette={[]} size={28} state={state} className="mt-0.5" />
      <div className="grid min-w-0 gap-1">
        <p className="text-caption font-medium text-ink-3">Utsavvy for Aditi</p>
        <p className="text-body text-ink">
          {words.map((word, i) => (
            <span
              key={i}
              className="animate-[word-in_260ms_var(--ease-standard)_both] motion-reduce:animate-none"
              style={{ animationDelay: `${900 + i * WORD_MS}ms` }}
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
