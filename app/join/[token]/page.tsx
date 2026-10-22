import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

export const metadata: Metadata = { title: "Join an Event" };

// S1 owns this page: join with the link's role, or the full, removed or
// already-in messages from docs/design/roles.md.

export default function JoinPage() {
  return (
    <SiteChrome>
      <h1 className="mb-4 font-display text-headline font-semibold text-ink">
        Join an Event
      </h1>
      <MountPlaceholder title="Joining by invite link" slice="S1" />
    </SiteChrome>
  );
}
