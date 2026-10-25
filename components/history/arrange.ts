import type { HistoryRow } from "@/convex/history";

// How the history panel lays out its rows. Pure, so it is tested on its own.

/** A run of rows shown together: one Member change, or one Assistant group. */
export type Block =
  | { kind: "single"; row: HistoryRow }
  | { kind: "group"; key: string; title: string; rows: HistoryRow[] };

export type Day = { label: string; blocks: Block[] };

function dayLabel(at: number, now: Date): string {
  const day = new Date(at);
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Rows by day, with the rows of one run or Proposal folded into one group per
 * day. A Member's edit made while the run was still going sits after the
 * run's group instead of splitting it into two headers, each with the run's
 * full count (review of #90).
 */
export function arrange(rows: HistoryRow[], now: Date): Day[] {
  const days: Day[] = [];
  let groups = new Map<string, Extract<Block, { kind: "group" }>>();
  for (const row of rows) {
    const label = dayLabel(row.at, now);
    let day = days.at(-1);
    if (day?.label !== label) {
      day = { label, blocks: [] };
      days.push(day);
      groups = new Map();
    }
    if (row.groupKey === null || row.groupTitle === null) {
      day.blocks.push({ kind: "single", row });
      continue;
    }
    const group = groups.get(row.groupKey);
    if (group) {
      group.rows.push(row);
      continue;
    }
    const block = {
      kind: "group" as const,
      key: row.groupKey,
      title: row.groupTitle,
      rows: [row],
    };
    groups.set(row.groupKey, block);
    day.blocks.push(block);
  }
  return days;
}
