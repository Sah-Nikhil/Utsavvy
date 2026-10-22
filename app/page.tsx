import { Show } from "@clerk/nextjs";
import Link from "next/link";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { Button } from "@/components/ui/button";

// S1 owns this page: the landing, sign-in and "Open the demo Event" for judge
// accounts. Contract stub with the three fonts in use.

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
          Utsavvy is a planning Assistant for events in India. It drafts your
          budget, timeline and Vendor checklist, and keeps them up to date as
          your family plans on one shared Canvas. For example: Mehendi के लिए
          ₹2,40,000.
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
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/sign-up" />}
            >
              Create an account
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
        </div>
      </section>
    </SiteChrome>
  );
}
