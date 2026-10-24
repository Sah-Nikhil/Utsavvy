import type { Doc } from "@/convex/_generated/dataModel";
import { EVENT_TYPE_LABELS } from "@/components/people/labels";
import type { BriefDate } from "@/lib/types/brief";

/** The parts of an Event the workspace header shows. */
export type HeadingEvent = Pick<
  Doc<"events">,
  "name" | "eventType" | "city" | "brief"
>;

// Brief dates are calendar days, not instants: format them in UTC so the day
// never shifts with the viewer's time zone.
const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatBriefDate(date: BriefDate): string {
  if (date.kind === "day") return dayFormat.format(new Date(date.value));
  return monthFormat.format(new Date(`${date.value}-01`));
}

/**
 * The line under the Event's name: its type, its city and when it is, for
 * example "Wedding · Jaipur · 15 Feb 2027". Before the Brief names a date it
 * says "Dates not set yet" rather than guessing.
 */
export function eventSubtitle(event: HeadingEvent): string {
  const parts: string[] = [EVENT_TYPE_LABELS[event.eventType]];
  const city = event.city?.name ?? event.brief?.extraction.city ?? null;
  if (city) parts.push(city);
  const date = event.brief?.extraction.date ?? null;
  parts.push(date ? formatBriefDate(date) : "Dates not set yet");
  return parts.join(" · ");
}

/**
 * The Event's name and subtitle in the workspace header. `undefined` while the
 * Event loads, which shows blank bars instead of placeholder words; `null`
 * (no access) shows nothing, since the Canvas explains the refusal.
 */
export function EventHeading({
  event,
}: {
  event: HeadingEvent | null | undefined;
}) {
  if (event === null) return null;
  if (event === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-1.5">
        <span className="h-5 w-40 animate-pulse rounded-sm bg-surface-sunk motion-reduce:animate-none" />
        <span className="h-3 w-56 max-w-full animate-pulse rounded-sm bg-surface-sunk motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <>
      <h1 className="truncate font-display text-title font-semibold tracking-[-0.01em]">
        {event.name}
      </h1>
      <p className="truncate text-caption text-ink-3">{eventSubtitle(event)}</p>
    </>
  );
}
