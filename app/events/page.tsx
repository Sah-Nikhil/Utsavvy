import type { Metadata } from "next";
import { Suspense } from "react";
import { NewEventDialog } from "@/components/people/NewEventDialog";
import { YourEvents } from "@/components/people/YourEvents";
import { SignedInAs } from "@/components/providers/SignedInAs";
import { SiteChrome } from "@/components/shell/SiteChrome";

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
            <SignedInAs />
          </div>
          <NewEventDialog />
        </div>
        {/* useSearchParams needs a Suspense boundary for the static build. */}
        <Suspense>
          <YourEvents />
        </Suspense>
      </div>
    </SiteChrome>
  );
}
