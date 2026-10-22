import type { Metadata } from "next";
import { JoinEvent } from "@/components/people/JoinEvent";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Join an Event" };

// S1 owns this page: join with the link's role, or the full, removed or
// already-in messages from docs/design/roles.md.

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SiteChrome>
      <h1 className="mb-4 font-display text-headline font-semibold text-ink">
        Join an Event
      </h1>
      <JoinEvent token={token} />
    </SiteChrome>
  );
}
