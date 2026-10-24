import type { BriefDate, FunctionDate } from "../types";

/**
 * Calendar arithmetic on ISO days ("2027-02-15"), in UTC so a day never
 * shifts with the server's timezone. The Brief's dates are days, not times.
 */

function parse(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/** Days from the first to the last, counting both. */
export function daysInRange(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 864e5) + 1;
}

/** The 15th of a month ("2027-02") or of the month `months` after a day. */
export function fifteenth(month: string): string {
  return `${month.slice(0, 7)}-15`;
}

export function monthsAfter(day: string, months: number): string {
  const date = parse(day);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return iso(date).slice(0, 7);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "13 Feb 2027". */
export function formatDay(day: string): string {
  const date = parse(day);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "February 2027". */
export function formatMonth(month: string): string {
  const date = parse(`${month.slice(0, 7)}-01`);
  return `${LONG_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "4 to 14 Sep 2027", or "28 Sep to 2 Oct 2027", or with both years when they differ. */
export function formatRange(from: string, to: string): string {
  const a = parse(from);
  const b = parse(to);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${formatDay(from)} to ${formatDay(to)}`;
  }
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} to ${formatDay(to)}`;
  }
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} to ${formatDay(to)}`;
}

export function formatBriefDate(date: BriefDate): string {
  return date.kind === "day" ? formatDay(date.value) : formatMonth(date.value);
}

export function formatFunctionDate(date: FunctionDate): string {
  return date.kind === "day"
    ? formatDay(date.value)
    : formatRange(date.from, date.to);
}

/** Whether a string is a real ISO day. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return iso(parse(value)) === value;
}

/** Whether a string is an ISO month. */
export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
