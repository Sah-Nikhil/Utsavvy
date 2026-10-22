"use client";

import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

// S6 (edit history and Restore) owns this folder.

export type HistoryPanelProps = { eventId: string };

export function HistoryPanel(_props: HistoryPanelProps) {
  return <MountPlaceholder title="Edit history and Restore" slice="S6" />;
}
