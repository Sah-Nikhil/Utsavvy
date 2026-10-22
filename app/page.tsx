import { Show } from "@clerk/nextjs";
import Link from "next/link";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { Button } from "@/components/ui/button";

// S1 owns this page: what Utsavvy is in two lines, sign in, and "Open the demo
// Event" for the judge accounts (IMPLEMENTATION_PLAN.md section 4.2).

export default function LandingPage() {
  return (
    <SiteChrome>
      <section className="grid max-w-2xl gap-5 py-10">
        <p lang="hi" className="font-display-hi text-headline text-ink-2">
          उत्सव की योजना, साथ मिलकर
        </p>
        <h1 className="font-display text-display font-semibold tracking-[-0.015em] text-ink">
          Plan your wedding, birthday or community festival together.
        </h1>
        <p className="text-body text-ink-2">
          Utsavvy is a planning Assistant for events in India: tell it about the
          Event and it drafts the budget, timeline and Vendor checklist. Your
          family plans on one shared Canvas and Chat, and the Assistant keeps
          every number up to date as plans change.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Show when="signed-out">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/sign-in" />}
            >
              Sign in
            </Button>
          </Show>
          <Show when="signed-in">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/events" />}
            >
              Go to your Events
            </Button>
          </Show>
          {/* Signed out, the proxy sends this through sign-in and back. */}
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/events?open=demo" />}
          >
            Open the demo Event
          </Button>
        </div>
        <p className="text-label text-ink-3">
          Judges: sign in with a judge account to open the demo Event, or create
          an account and start your own.{" "}
          <Link
            href="/terms"
            className="text-ink-2 underline underline-offset-2"
          >
            Terms and privacy
          </Link>
        </p>
      </section>
    </SiteChrome>
  );
}
