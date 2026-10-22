"use client";

import { AssistantOrb } from "@/components/shell/AssistantOrb";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

// S5 (the Chat) owns this folder (except cards/registry.tsx) and replaces this
// mount point with the streamed Chat, the run queue and Stop.

export type ChatPanelProps = { eventId: string };

export function ChatPanel(_props: ChatPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <AssistantOrb palette={[]} state="idle" size={36} />
        <div>
          <p className="font-display text-title text-ink">Utsavvy</p>
          <p className="text-caption text-ink-3">claude-sonnet-5-5</p>
        </div>
      </div>
      <MountPlaceholder title="Chat" slice="S5" className="flex-1" />
    </div>
  );
}
