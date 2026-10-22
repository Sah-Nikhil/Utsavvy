/**
 * India Standard Time helpers. IST is UTC+05:30 all year (no daylight saving),
 * so a fixed offset is exact. Nudges are counted per IST day (section 5.4) and
 * the daily crons run on IST clock times (section 4.7).
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The IST calendar day of a timestamp, as "YYYY-MM-DD". */
export function istDay(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST wall-clock time of a timestamp, as "HH:MM". */
export function istTime(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * The current moment in IST. Call it only in mutations and actions: queries
 * must not read the clock (convex/_generated/ai/guidelines.md).
 */
export function istNow(): { timestamp: number; day: string; time: string } {
  const timestamp = Date.now();
  return { timestamp, day: istDay(timestamp), time: istTime(timestamp) };
}
