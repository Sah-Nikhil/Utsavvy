import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Terms and privacy" };

// S1 owns this page: what each outside service receives (IMPLEMENTATION_PLAN.md section 4.15).

const SERVICES: readonly { name: string; receives: ReactNode }[] = [
  {
    name: "Vercel",
    receives:
      "Hosts the site, so it receives every request as part of serving it: your IP address, browser details and the pages you visit.",
  },
  {
    name: "Clerk",
    receives:
      "Signs you in and holds your name, email address and profile photo.",
  },
  {
    name: "Convex",
    receives:
      "Stores your Events, the Chat, Comments and the images you upload.",
  },
  {
    name: "Anthropic",
    receives: (
      <>
        Receives Chat messages and the parts of the Canvas the Assistant needs
        to answer, on the <code className="num">claude-sonnet-5-5</code> model.
      </>
    ),
  },
  {
    name: "Google Gemini",
    receives:
      "When the fallback model answers, receives the same. On Gemini's free tier, Google may use those prompts and replies to improve its products.",
  },
  {
    name: "Web research for Estimates",
    receives:
      "Sends only a category, a unit, an Event type and a city, never names, budgets or anything from your Brief.",
  },
  {
    name: "Geoapify",
    receives:
      "Receives city names and Vendors' published addresses, to place them on the map.",
  },
  {
    name: "Google Maps",
    receives: "Receives what a Member searches for in the Google places sheet.",
  },
  {
    name: "Pinterest and Instagram",
    receives:
      "Receive the usual browser data when their boards, Pins or posts load inside an Event.",
  },
];

export default function TermsPage() {
  const reportEmail = process.env.NEXT_PUBLIC_REPORT_EMAIL;
  return (
    <SiteChrome>
      <article className="grid max-w-2xl gap-8">
        <header className="grid gap-3">
          <h1 className="font-display text-headline font-semibold text-ink">
            Terms and privacy
          </h1>
          <p className="text-body text-ink-2">
            Utsavvy is a non-commercial hackathon prototype, built for
            PromptWars. It comes with no warranty: use it to try planning an
            Event, not as the only record of one.
          </p>
        </header>

        <section aria-labelledby="services" className="grid gap-3">
          <h2
            id="services"
            className="font-display text-title font-semibold text-ink"
          >
            What each outside service receives
          </h2>
          <dl className="grid divide-y divide-rule rounded-lg border border-item-line bg-surface-raised">
            {SERVICES.map((service) => (
              <div
                key={service.name}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6"
              >
                <dt className="text-label font-semibold text-ink">
                  {service.name}
                </dt>
                <dd className="text-body text-ink-2">{service.receives}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="content" className="grid gap-3">
          <h2
            id="content"
            className="font-display text-title font-semibold text-ink"
          >
            Photos and the demo Event
          </h2>
          <p className="text-body text-ink-2">
            Stock photos are credited to their Pexels photographers. The demo
            Event&apos;s people, Quotes and Comments are made up.
          </p>
        </section>

        <section aria-labelledby="report" className="grid gap-3">
          <h2
            id="report"
            className="font-display text-title font-semibold text-ink"
          >
            Asking for something to be taken down
          </h2>
          <p className="text-body text-ink-2">
            {reportEmail ? (
              <>
                Write to{" "}
                <a
                  href={`mailto:${reportEmail}`}
                  className="text-action underline underline-offset-2"
                >
                  {reportEmail}
                </a>
                , the Report content address in the footer of every page.
              </>
            ) : (
              "Use the Report content address in the footer of every page."
            )}
          </p>
        </section>
      </article>
    </SiteChrome>
  );
}
