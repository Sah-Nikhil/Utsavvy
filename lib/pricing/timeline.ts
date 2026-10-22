/**
 * Timeline deadlines from lead times (docs/design/first-brief.md "Lead times").
 * Code, not the model, works out every date: the model only names a `leadKey`.
 */

export type Priority = "P1" | "P2" | "P3";

type Lead = { months?: number; weeks?: number; priority: Priority };

/**
 * Ideal lead before the Function a deadline serves, and its priority if late.
 * Where first-brief.md gives a span (Venues 9-12 months, party hall 6-8 weeks,
 * idol 4-6 months), the ideal is the longer lead: the birthday example marks the
 * party hall late at 52 days because its ideal is 8 weeks. Birthday and community
 * priorities aren't in first-brief.md; they follow the wedding table's logic
 * (the scarcest bookings first).
 */
export const LEAD_TIMES = {
  // Weddings
  book_venues: { months: 12, priority: "P1" },
  book_caterer: { months: 9, priority: "P1" },
  book_photographer: { months: 12, priority: "P1" },
  book_decorator: { months: 9, priority: "P2" },
  book_makeup_mehendi: { months: 9, priority: "P2" },
  book_baraat_band: { months: 6, priority: "P2" },
  order_outfits: { months: 6, priority: "P2" },
  book_dj: { months: 6, priority: "P3" },
  book_transport: { months: 3, priority: "P3" },
  send_invitations: { weeks: 8, priority: "P1" },
  makeup_trial: { months: 1, priority: "P2" },
  share_run_sheets: { months: 1, priority: "P2" },
  // Birthdays
  book_party_hall: { weeks: 8, priority: "P1" },
  book_entertainer: { weeks: 4, priority: "P2" },
  book_party_photographer: { weeks: 4, priority: "P2" },
  send_party_invitations: { weeks: 3, priority: "P1" },
  order_party_decor: { weeks: 2, priority: "P3" },
  order_return_gifts: { weeks: 2, priority: "P3" },
  order_cake: { weeks: 1, priority: "P3" },
  // Community festivals
  committee_budget: { months: 3, priority: "P1" },
  book_idol: { months: 6, priority: "P1" },
  book_dhol_tasha: { months: 3, priority: "P2" },
  book_pandal_decor: { months: 2, priority: "P2" },
  check_permissions: { weeks: 6, priority: "P1" },
  book_sound: { weeks: 4, priority: "P3" },
} as const satisfies Record<string, Lead>;

export type LeadKey = keyof typeof LEAD_TIMES;

export function isLeadKey(key: string): key is LeadKey {
  return Object.hasOwn(LEAD_TIMES, key);
}

/** A late deadline is pulled to this many days from today. */
const LATE_WITHIN_DAYS: Record<Priority, number> = { P1: 7, P2: 14, P3: 21 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2027-02-13" or "2027-02" (a month-only date is the 15th) as a UTC midnight. */
function parseDay(value: string): Date {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`Not an ISO day or month: "${value}"`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? 15)));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Months back, kept on the same day of the month or the month's last day. */
function monthsBefore(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/**
 * A deadline's date from its lead key and the date of the Function it serves.
 * A deadline whose ideal date is before today is late and moves to within 7, 14
 * or 21 days of today by its priority. Dates are ISO days.
 */
export function deadlineDate(
  leadKey: string,
  functionDate: string,
  today: string,
): { date: string; late: boolean; priority: Priority | null } {
  if (!isLeadKey(leadKey)) throw new Error(`Unknown leadKey "${leadKey}"`);
  const lead: Lead = LEAD_TIMES[leadKey];
  const due = parseDay(functionDate);
  const ideal = lead.months
    ? monthsBefore(due, lead.months)
    : new Date(due.getTime() - (lead.weeks ?? 0) * 7 * DAY_MS);
  const now = parseDay(today);
  if (ideal.getTime() >= now.getTime()) {
    return { date: formatDay(ideal), late: false, priority: null };
  }
  const pulled = new Date(
    now.getTime() + LATE_WITHIN_DAYS[lead.priority] * DAY_MS,
  );
  return { date: formatDay(pulled), late: true, priority: lead.priority };
}
