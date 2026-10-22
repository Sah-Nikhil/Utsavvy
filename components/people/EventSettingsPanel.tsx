"use client";

import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

// S1 owns this file: the Event's name, the Owner or Host label, upload rights and defaults.

export type EventSettingsPanelProps = { eventId: string };

export function EventSettingsPanel(_props: EventSettingsPanelProps) {
  return <MountPlaceholder title="Event settings" slice="S1" />;
}
