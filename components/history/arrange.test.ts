import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { HistoryRow } from "@/convex/history";
import { arrange } from "./arrange";

// How the history panel lays out its rows (S6, #90): by day, with an
// Assistant reply's changes under one header.

const NOW = new Date(2026, 9, 25, 18, 0);
const at = (hour: number, minute = 0) =>
  new Date(2026, 9, 25, hour, minute).getTime();

function row(
  id: string,
  time: number,
  group: { key: string; title: string } | null,
): HistoryRow {
  return {
    changeId: id as Id<"changes">,
    at: time,
    kind: "canvas",
    op: "update",
    byAssistant: group !== null,
    who: group ? "Utsavvy for Meera" : "Aditi",
    summary: `Change ${id}`,
    groupKey: group?.key ?? null,
    groupTitle: group?.title ?? null,
    target: null,
    canRestore: false,
  };
}

const RUN = {
  key: "run:1",
  title: "Utsavvy for Meera: Plan the sangeet (3 changes)",
};

describe("arrange", () => {
  it("keeps one header for a run when a Member edits in the middle of it (review of #90)", () => {
    // Newest first: the run's last change, Aditi's edit, then the run's first two.
    const days = arrange(
      [
        row("c4", at(17, 3), RUN),
        row("c3", at(17, 2), null),
        row("c2", at(17, 1), RUN),
        row("c1", at(17, 0), RUN),
      ],
      NOW,
    );
    expect(days).toHaveLength(1);
    expect(days[0]!.blocks.map((b) => b.kind)).toEqual(["group", "single"]);
    const group = days[0]!.blocks[0]!;
    if (group.kind !== "group") throw new Error("not a group");
    expect(group.title).toBe(RUN.title);
    expect(group.rows.map((r) => r.changeId)).toEqual(["c4", "c2", "c1"]);
  });

  it("still splits the same run across two days", () => {
    const days = arrange(
      [
        row("c2", new Date(2026, 9, 25, 0, 1).getTime(), RUN),
        row("c1", new Date(2026, 9, 24, 23, 59).getTime(), RUN),
      ],
      NOW,
    );
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday"]);
    expect(days.map((d) => d.blocks.length)).toEqual([1, 1]);
  });

  it("keeps two runs apart, and Member edits as their own rows", () => {
    const other = { key: "run:2", title: "Utsavvy for Rohan (1 change)" };
    const days = arrange(
      [
        row("c3", at(12), other),
        row("c2", at(11), null),
        row("c1", at(10), RUN),
      ],
      NOW,
    );
    expect(
      days[0]!.blocks.map((b) => (b.kind === "group" ? b.key : b.row.changeId)),
    ).toEqual(["run:2", "c2", "run:1"]);
  });
});
