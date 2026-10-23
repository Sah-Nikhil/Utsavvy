import { describe, expect, it } from "vitest";
import { formatDay, formatTime, splitTimeline } from "./format";

describe("formatTime", () => {
  it("reads 24-hour run sheet times the Indian way", () => {
    expect(formatTime("19:30")).toBe("7:30 pm");
    expect(formatTime("05:30")).toBe("5:30 am");
    expect(formatTime("00:00")).toBe("12:00 am");
    expect(formatTime("12:15")).toBe("12:15 pm");
  });
});

describe("formatDay", () => {
  it("writes a day as 19 Dec 2026, or without the year when asked", () => {
    expect(formatDay("2026-12-19")).toBe("19 Dec 2026");
    expect(formatDay("2027-02-05", { year: false })).toBe("5 Feb");
  });
});

describe("splitTimeline", () => {
  const e = (
    id: string,
    fields: { date: string | null; time: string | null },
    functionKey: string | null = null,
  ) => ({ _id: id, functionKey, fields });

  it("puts deadlines in date order, undated last, and groups run sheets per Function by time", () => {
    const { deadlines, runSheets } = splitTimeline(
      [
        e("undated", { date: null, time: null }),
        e("dec", { date: "2026-12-19", time: null }),
        e("nov", { date: "2026-11-13", time: null }),
        e("dinner", { date: null, time: "20:30" }, "sangeet"),
        e("arrive", { date: null, time: "19:00" }, "sangeet"),
        e("vidaai", { date: null, time: "01:00" }, "wedding"),
        e("bride", { date: null, time: "17:30" }, "wedding"),
      ],
      ["wedding", "sangeet"],
    );
    expect(deadlines.map((d) => d._id)).toEqual(["nov", "dec", "undated"]);
    expect(runSheets.map((r) => r.functionKey)).toEqual(["wedding", "sangeet"]);
    expect(runSheets[0]!.entries.map((x) => x._id)).toEqual([
      "bride",
      "vidaai",
    ]);
    expect(runSheets[1]!.entries.map((x) => x._id)).toEqual([
      "arrive",
      "dinner",
    ]);
  });
});
