"use client";

import { MountPlaceholder } from "@/components/shell/MountPlaceholder";
import { PinterestIdeasButton } from "@/components/pinterest-ideas/PinterestIdeasSheet";
import { PasteLinkForm } from "@/components/references/PasteLinkForm";

// S13 (Inspirations) owns this folder: Search the stock library and Upload.
// "Paste a link" is X2's and "Browse ideas on Pinterest" is S21's.

export type AddInspirationPanelProps = { eventId: string };

export function AddInspirationPanel({ eventId }: AddInspirationPanelProps) {
  return (
    <div className="grid gap-3">
      <MountPlaceholder
        title="Search the stock library and Upload"
        slice="S13"
      />
      <PasteLinkForm eventId={eventId} />
      <PinterestIdeasButton />
    </div>
  );
}
