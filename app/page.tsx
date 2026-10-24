import { Show } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { LandingReply } from "@/components/shell/LandingReply";
import { PointingRing } from "@/components/shell/PointingRing";
import { OrnamentRule, Rangoli } from "@/components/shell/Rangoli";
import { SectionOrnament } from "@/components/shell/SectionOrnament";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  FunctionMarker,
  functionBand,
  type FunctionIndex,
} from "@/components/ui/function-marker";
import { Money } from "@/components/ui/money";
import { PriceBadge } from "@/components/ui/price-badge";
import { cn } from "@/lib/utils";

// S1 owns this page's purpose: what Utsavvy is in two lines, sign in, and "Open
// the demo Event" for the judge accounts (IMPLEMENTATION_PLAN.md section 4.2).
// D3 (#103) gave it Look D: the page is laid out like a piece of the Canvas, on
// the sand ground, with an example plan in a Section frame.

export default function LandingPage() {
  return (
    <SiteChrome bleed>
      <Hero />
      <ExamplePlan />
      <HowItPlans />
    </SiteChrome>
  );
}

function Hero() {
  return (
    <section className="relative overflow-x-clip">
      <Rangoli
        draw
        className="absolute -top-40 -right-44 size-[20rem] opacity-45 sm:-top-24 sm:-right-28 sm:size-[32rem] sm:opacity-100 lg:-top-12 lg:right-[calc(50vw-46rem)] lg:size-[36rem]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-6 px-4 pt-8 pb-14 sm:px-6 sm:pt-16 lg:pb-20">
        <p
          lang="hi"
          className="font-display-hi text-[clamp(1.75rem,4vw,2.5rem)] text-motif"
        >
          उत्सव की योजना, साथ मिलकर
        </p>
        <h1 className="max-w-[17ch] font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] font-semibold tracking-[-0.028em] text-ink">
          Plan your wedding, birthday or community festival{" "}
          <span className="text-motif-2">together.</span>
        </h1>
        <p className="max-w-[56ch] text-[1.0625rem] leading-relaxed text-ink-2">
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
            variant="tonal"
            nativeButton={false}
            render={<Link href="/events?open=demo" />}
          >
            Open the demo Event
          </Button>
        </div>
        <p className="max-w-[60ch] text-label text-ink-2">
          Judges: sign in with a judge account to open the demo Event, or create
          an account and start your own.{" "}
          <Link
            href="/terms"
            className="font-semibold text-ink underline underline-offset-4"
          >
            Terms and privacy
          </Link>
        </p>
      </div>
    </section>
  );
}

type Line = {
  fn: FunctionIndex;
  functionName: string;
  label: ReactNode;
  price: ReactNode;
  amount: ReactNode;
  pointed?: boolean;
};

// Illustrative lines for the Jaipur example (IMPLEMENTATION_PLAN.md section 8's
// worked example gives the catering line); the figure caption says so.
const LINES: Line[] = [
  {
    fn: 1,
    functionName: "Haldi",
    label: "Haldi decor",
    price: <PriceBadge kind="quote" detail="none" />,
    amount: <Money amount={45000} />,
  },
  {
    fn: 2,
    functionName: "Mehendi",
    label: "Mehendi artist",
    price: (
      <PriceBadge
        kind="listed"
        source="the artist's site"
        seenOn="Oct 2026"
        detail="none"
      />
    ),
    amount: <span className="num">₹500 per hand</span>,
  },
  {
    fn: 3,
    functionName: "Sangeet",
    label: "Rajasthani folk musicians",
    price: <PriceBadge kind="estimate" detail="none" />,
    amount: <Money amount={32000} />,
  },
  {
    fn: 4,
    functionName: "Wedding",
    label: (
      <>
        Catering, <span className="num">300 × ₹1,210</span>
      </>
    ),
    price: <PriceBadge kind="estimate" detail="none" />,
    amount: <Money amount={363000} />,
    pointed: true,
  },
];

function ExamplePlan() {
  return (
    <section
      aria-labelledby="example-plan"
      className="mx-auto max-w-6xl px-4 pb-16 sm:px-6"
    >
      <figure className="relative rounded-xl bg-surface/45 p-4 sm:p-6 lg:p-8">
        <SectionOrnament />
        <figcaption className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-10 ornaments-off:pl-0">
          <h2
            id="example-plan"
            className="font-display text-title font-semibold text-ink"
          >
            An example plan
          </h2>
          <span className="text-label text-ink-2">
            Illustrative: a Jaipur wedding for 300 Guests, budget{" "}
            <Money amount={2500000} />
          </span>
        </figcaption>
        <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
          <BudgetCard />
          <ChatExcerpt />
        </div>
      </figure>
    </section>
  );
}

function BudgetCard() {
  return (
    <div className="rounded-lg bg-surface-raised p-4 shadow-item sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-title font-semibold text-ink">
          Budget
        </h3>
        <p className="text-caption text-ink-3">
          Prices are labelled, never added into one total
        </p>
      </div>
      <ul className="grid gap-2">
        {LINES.map((line) => {
          // Phones: Function and amount on top, the line and its price
          // label under them. Wider: one row of four columns.
          const row = (
            <div
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 sm:grid-cols-[7rem_1fr_auto_auto]",
                functionBand[line.fn],
              )}
            >
              <span className="col-start-1 row-start-1 flex items-center gap-2 text-label font-semibold text-ink">
                <FunctionMarker index={line.fn} />
                {line.functionName}
              </span>
              <span className="col-start-1 row-start-2 text-label text-ink-2 sm:col-start-2 sm:row-start-1">
                {line.label}
              </span>
              <span className="col-start-2 row-start-2 justify-self-end sm:col-start-3 sm:row-start-1">
                {line.price}
              </span>
              <span className="col-start-2 row-start-1 justify-self-end text-body font-semibold whitespace-nowrap text-ink sm:col-start-4">
                {line.amount}
              </span>
            </div>
          );
          return (
            <li key={line.functionName}>
              {line.pointed ? (
                <PointingRing
                  tint
                  radiusClassName="rounded-md"
                  labelAlign="end"
                >
                  {row}
                </PointingRing>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChatExcerpt() {
  return (
    <div className="grid gap-4 rounded-xl bg-surface-low p-4 sm:p-5">
      <div className="flex gap-3 pr-6">
        <Avatar name="Aditi Sharma" size="sm" className="mt-5" />
        <div className="grid min-w-0 gap-1">
          <p className="text-caption font-medium text-ink-3">Aditi</p>
          <p className="rounded-xl rounded-tl-xs bg-surface-raised px-3.5 py-2 text-body text-ink">
            Wedding mein catering kitna aayega?{" "}
            <span lang="hi">300 लोग होंगे।</span>
          </p>
        </div>
      </div>
      <LandingReply text="Catering for the wedding comes to about ₹3,63,000: ₹1,210 a plate for 300 Guests. It stays an Estimate until a caterer sends you a Quote. I've pointed at the line in the Budget." />
    </div>
  );
}

const STEPS = [
  {
    title: "Tell it about the Event",
    text: "The Event type, city, date, Guest count and budget, in English, Hindi or both. Whatever you leave out, the Assistant fills in as Assumptions you can change.",
  },
  {
    title: "It drafts the plan",
    text: "A Budget split across your Functions, a Timeline of deadlines and a Vendor checklist, with every price labelled as an Estimate, a Listed price or a Quote.",
  },
  {
    title: "Plan it together",
    text: "Your family shares one Canvas and Chat. Ask about anything on the Canvas, and the Assistant keeps every number up to date as plans change.",
  },
];

function HowItPlans() {
  return (
    <section
      aria-labelledby="how-it-plans"
      className="mx-auto max-w-6xl px-4 pb-20 sm:px-6"
    >
      <OrnamentRule className="mb-10" />
      <h2
        id="how-it-plans"
        className="mb-8 font-display text-headline font-semibold text-ink"
      >
        How a plan comes together
      </h2>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-rule">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="grid content-start gap-2 md:px-8 md:first:pl-0 md:last:pr-0"
          >
            <span className="font-display text-[2.5rem] leading-none font-medium text-motif num">
              {i + 1}
            </span>
            <h3 className="font-display text-title font-semibold text-ink">
              {step.title}
            </h3>
            <p className="max-w-[38ch] text-body text-ink-2">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
