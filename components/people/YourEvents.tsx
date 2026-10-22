"use client";

import { useQuery } from "convex/react";
import { CalendarHeart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { EVENT_TYPE_LABELS, roleLabel } from "./labels";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The signed-in person's Events, newest first (`api.events.listMine`). With
 * `?open=demo`, from the landing's "Open the demo Event", it goes straight to
 * the seeded demo Event when the person is in it.
 */
export function YourEvents() {
  const router = useRouter();
  const openDemo = useSearchParams().get("open") === "demo";
  // listMine refuses a caller whose `users` row isn't made yet; wait for it.
  const account = useQuery(api.users.me);
  const events = useQuery(api.events.listMine, account ? {} : "skip");
  const demo = events?.find((e) => e.isDemo);

  useEffect(() => {
    if (openDemo && demo) router.replace(`/events/${demo.eventId}`);
  }, [openDemo, demo, router]);

  if (events === undefined) {
    return (
      <p className="text-label text-ink-3" aria-live="polite">
        Loading your Events…
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {openDemo && !demo ? (
        <p
          role="status"
          className="rounded-md border border-rule bg-surface-sunk px-4 py-3 text-label text-ink-2"
        >
          The demo Event opens for the judge accounts. This account isn&apos;t
          in it, so start an Event of your own instead.
        </p>
      ) : null}
      {events.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-lg border border-dashed border-rule-strong px-6 py-8">
          <CalendarHeart aria-hidden className="size-6 text-ink-3" />
          <p className="font-display text-title font-semibold text-ink">
            No Events yet
          </p>
          <p className="max-w-md text-body text-ink-2">
            Start one with New Event, or open an invite link someone sent you.
          </p>
        </div>
      ) : (
        <ul aria-label="Your Events" className="grid gap-3 sm:grid-cols-2">
          {events.map((event) => (
            <li key={event.eventId}>
              <Link
                href={`/events/${event.eventId}`}
                className="state-layer grid gap-2 rounded-lg border border-item-line bg-surface-raised px-5 py-4 text-ink no-underline shadow-item transition-[border-radius] duration-(--dur-feedback) ease-standard active:rounded-md"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-display text-title font-semibold">
                    {event.name}
                  </span>
                  <Badge tone={event.role === "viewer" ? "neutral" : "action"}>
                    {roleLabel(event.role, event.ownerLabel)}
                  </Badge>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
                  <span>{EVENT_TYPE_LABELS[event.eventType]}</span>
                  <span aria-hidden>·</span>
                  <span>Started {dateFormat.format(event.createdAt)}</span>
                  {event.isDemo ? <Badge tone="outline">Demo</Badge> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
