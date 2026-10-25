import { describe, expect, it } from "vitest";
import { deadlineDate } from "./timeline";

// Today is 2026-10-21 in all three first-brief.md worked examples.
const TODAY = "2026-10-21";

describe("deadlineDate: the Jaipur wedding (first Function 13 Feb 2027)", () => {
  const FIRST = "2027-02-13";

  it("pulls late P1 bookings to within 7 days", () => {
    for (const key of ["book_venues", "book_caterer", "book_photographer"]) {
      expect(deadlineDate(key, FIRST, TODAY)).toEqual({
        date: "2026-10-28",
        late: true,
        priority: "P1",
      });
    }
  });

  it("pulls late P2 bookings to within 14 days", () => {
    for (const key of [
      "book_decorator",
      "book_makeup_mehendi",
      "book_baraat_band",
      "order_outfits",
    ]) {
      expect(deadlineDate(key, FIRST, TODAY)).toEqual({
        date: "2026-11-04",
        late: true,
        priority: "P2",
      });
    }
  });

  it("pulls the late DJ booking (P3) to within 21 days", () => {
    expect(deadlineDate("book_dj", FIRST, TODAY)).toEqual({
      date: "2026-11-11",
      late: true,
      priority: "P3",
    });
  });

  it("keeps transport on time, due 13 Nov 2026", () => {
    expect(deadlineDate("book_transport", FIRST, TODAY)).toEqual({
      date: "2026-11-13",
      late: false,
      priority: null,
    });
  });

  it("sends invitations by 19 Dec 2026 and trials by mid-January", () => {
    expect(deadlineDate("send_invitations", FIRST, TODAY).date).toBe(
      "2026-12-19",
    );
    expect(deadlineDate("makeup_trial", FIRST, TODAY).date).toBe("2027-01-13");
    expect(deadlineDate("share_run_sheets", FIRST, TODAY).date).toBe(
      "2027-01-13",
    );
  });
});

describe("deadlineDate: a month-only date is the 15th", () => {
  it("counts back from the 15th of the month", () => {
    expect(deadlineDate("book_transport", "2027-02", TODAY)).toEqual({
      date: "2026-11-15",
      late: false,
      priority: null,
    });
  });
});

describe("deadlineDate: Aarav's birthday on 12 Dec 2026", () => {
  const PARTY = "2026-12-12";

  it("marks the party hall late (ideal 8 weeks) and P1", () => {
    expect(deadlineDate("book_party_hall", PARTY, TODAY)).toEqual({
      date: "2026-10-28",
      late: true,
      priority: "P1",
    });
  });

  it("dates the rest as in first-brief.md", () => {
    expect(deadlineDate("book_entertainer", PARTY, TODAY).date).toBe(
      "2026-11-14",
    );
    expect(deadlineDate("book_party_photographer", PARTY, TODAY).date).toBe(
      "2026-11-14",
    );
    expect(deadlineDate("send_party_invitations", PARTY, TODAY).date).toBe(
      "2026-11-21",
    );
    expect(deadlineDate("order_party_decor", PARTY, TODAY).date).toBe(
      "2026-11-28",
    );
    expect(deadlineDate("order_return_gifts", PARTY, TODAY).date).toBe(
      "2026-11-28",
    );
    expect(deadlineDate("order_cake", PARTY, TODAY).date).toBe("2026-12-05");
  });
});

describe("deadlineDate: the Pune Ganesh utsav from 4 Sep 2027", () => {
  const START = "2027-09-04";

  it("is never late, 318 days out", () => {
    for (const key of [
      "committee_budget",
      "book_idol",
      "book_dhol_tasha",
      "book_pandal_decor",
      "check_permissions",
      "book_sound",
    ]) {
      expect(deadlineDate(key, START, TODAY).late).toBe(false);
    }
  });

  it("dates the committee early June, permissions late July, sound early August", () => {
    expect(deadlineDate("committee_budget", START, TODAY).date).toBe(
      "2027-06-04",
    );
    expect(deadlineDate("book_dhol_tasha", START, TODAY).date).toBe(
      "2027-06-04",
    );
    expect(deadlineDate("book_pandal_decor", START, TODAY).date).toBe(
      "2027-07-04",
    );
    expect(deadlineDate("check_permissions", START, TODAY).date).toBe(
      "2027-07-24",
    );
    expect(deadlineDate("book_sound", START, TODAY).date).toBe("2027-08-07");
  });
});

describe("deadlineDate edge cases", () => {
  it("clamps to the month's last day", () => {
    expect(deadlineDate("book_transport", "2027-05-31", TODAY).date).toBe(
      "2027-02-28",
    );
  });

  it("is due today, not late, when the ideal date is today", () => {
    expect(deadlineDate("order_cake", "2026-10-28", TODAY)).toEqual({
      date: "2026-10-21",
      late: false,
      priority: null,
    });
  });

  it("refuses an unknown leadKey", () => {
    expect(() => deadlineDate("book_elephant", "2027-02-13", TODAY)).toThrow(
      /Unknown leadKey "book_elephant"/,
    );
  });
});
