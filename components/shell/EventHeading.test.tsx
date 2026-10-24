import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Brief } from "@/lib/types/brief";
import { EventHeading, eventSubtitle, type HeadingEvent } from "./EventHeading";

// The workspace header names the Event and says what and when it is, from the
// Event's own data; before the Brief has a date it says so honestly.

function brief(date: Brief["extraction"]["date"], city: string | null): Brief {
  return {
    extraction: {
      eventType: null,
      city,
      date,
      guests: null,
      budget: null,
      tradition: null,
      honoree: null,
      communityKind: null,
      households: null,
      notes: [],
    },
    assumptions: [],
  };
}

const jaipur = { name: "Jaipur", tier: "X" as const, centre: null };

describe("eventSubtitle", () => {
  it("joins the Event type, the city and a day from the Brief", () => {
    const event: HeadingEvent = {
      name: "Ananya & Rohan",
      eventType: "wedding",
      city: jaipur,
      brief: brief({ kind: "day", value: "2027-02-15" }, "Jaipur"),
    };
    expect(eventSubtitle(event)).toBe("Wedding · Jaipur · 15 Feb 2027");
  });

  it("shows a month when the Brief only names a month", () => {
    const event: HeadingEvent = {
      name: "Aarav turns 5",
      eventType: "birthday",
      city: null,
      brief: brief({ kind: "month", value: "2026-12" }, "Pune"),
    };
    expect(eventSubtitle(event)).toBe("Birthday · Pune · December 2026");
  });

  it("says the dates aren't set yet before the Brief", () => {
    const event: HeadingEvent = {
      name: "Ganesh utsav",
      eventType: "community",
      city: null,
      brief: null,
    };
    expect(eventSubtitle(event)).toBe("Community event · Dates not set yet");
  });
});

describe("EventHeading", () => {
  it("renders the Event's name as the heading with its subtitle", () => {
    const html = renderToStaticMarkup(
      <EventHeading
        event={{
          name: "Ananya & Rohan",
          eventType: "wedding",
          city: jaipur,
          brief: null,
        }}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>Ananya &amp; Rohan<\/h1>/);
    expect(html).toContain("Wedding · Jaipur · Dates not set yet");
    expect(html).not.toContain("S1");
  });

  it("shows a blank skeleton, not placeholder words, while loading", () => {
    const html = renderToStaticMarkup(<EventHeading event={undefined} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/Your Event|arrive with/);
    expect(html.replace(/<[^>]+>/g, "")).toBe("");
  });
});
