import type { Metadata } from "next";
import { JoinEvent } from "@/components/people/JoinEvent";
import { SectionOrnament } from "@/components/shell/SectionOrnament";
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
      <div className="relative mx-auto grid max-w-2xl gap-6 rounded-xl bg-surface-raised p-6 shadow-lift sm:p-10">
        <SectionOrnament />
        <div className="relative grid gap-1">
          <p lang="hi" className="font-display-hi text-[1.75rem] text-motif">
            आपका स्वागत है
          </p>
          <h1 className="font-display text-headline font-semibold text-ink">
            Join an Event
          </h1>
        </div>
        <div className="relative">
          <JoinEvent token={token} />
        </div>
      </div>
    </SiteChrome>
  );
}
