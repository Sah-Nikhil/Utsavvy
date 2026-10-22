import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your Events" };

// S1 owns this page: the person's Events, newest first, and "New Event".

export default function EventsPage() {
  return (
    <SiteChrome>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-headline font-semibold text-ink">
              Your Events
            </h1>
            <p className="text-body text-ink-2">
              Every Event you plan or follow, newest first.
            </p>
          </div>
          <Button disabled>New Event</Button>
        </div>
        <MountPlaceholder title="Your Events list and New Event" slice="S1" />
      </div>
    </SiteChrome>
  );
}
