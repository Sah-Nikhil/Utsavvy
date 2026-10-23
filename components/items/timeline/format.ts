/*
 * How the Timeline writes its dates and times, and how it splits its Entries
 * into deadlines and per-Function run sheets. Pure, no React.
 */

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

/** "19:30" → "7:30 pm". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "2026-12-19" → "19 Dec 2026", or "19 Dec" with `year: false`. */
export function formatDay(day: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return opts.year === false ? base : `${base} ${y}`;
}

/**
 * Minutes into a Function's evening: times before 5 am count as after
 * midnight, so a wedding's 1:00 am vidaai sorts after its 10:30 pm pheras.
 */
function runSheetMinutes(time: string | null): number {
  if (time === null) return 0;
  const [h, m] = time.split(":").map(Number) as [number, number];
  return (h < 5 ? h + 24 : h) * 60 + m;
}

type TimelineRow = {
  _id: string;
  functionKey: string | null;
  fields: { date: string | null; time: string | null };
};

/**
 * Deadlines (Entries with no time) by date, undated last; run sheet Entries
 * (with a time) grouped per Function in the Event's Function order, each by
 * time. A run sheet Entry with no Function joins the deadlines.
 */
export function splitTimeline<E extends TimelineRow>(
  entries: readonly E[],
  functionOrder: readonly string[],
): {
  deadlines: E[];
  runSheets: { functionKey: string; entries: E[] }[];
} {
  const deadlines: E[] = [];
  const sheets = new Map<string, E[]>();
  for (const entry of entries) {
    if (entry.fields.time !== null && entry.functionKey !== null) {
      const list = sheets.get(entry.functionKey) ?? [];
      list.push(entry);
      sheets.set(entry.functionKey, list);
    } else {
      deadlines.push(entry);
    }
  }
  deadlines.sort((a, b) => {
    const x = a.fields.date;
    const y = b.fields.date;
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  });
  const rank = (key: string) => {
    const i = functionOrder.indexOf(key);
    return i === -1 ? functionOrder.length : i;
  };
  const runSheets = [...sheets.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([functionKey, list]) => ({
      functionKey,
      entries: list.sort(
        (a, b) =>
          runSheetMinutes(a.fields.time) - runSheetMinutes(b.fields.time),
      ),
    }));
  return { deadlines, runSheets };
}
