"use client";

import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

// S1 (Events, invite links and the four roles) owns this folder.

export type PeoplePanelProps = { eventId: string };

export function PeoplePanel(_props: PeoplePanelProps) {
  return <MountPlaceholder title="People, invite links and roles" slice="S1" />;
}
