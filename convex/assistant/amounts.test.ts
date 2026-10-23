import { describe, expect, it } from "vitest";
import { checkMemberStatedAmount, exceedsProposalThresholds } from "./amounts";

// S7 seams (issue #40): the Assistant writes an amount only when the asking
// Member said it, and a direct change past the Proposal thresholds is refused.

describe("checkMemberStatedAmount", () => {
  const ask = "Add a mehendi artist, around ₹15,000";

  it("accepts the amount the Member wrote with ₹ and lakh grouping", () => {
    expect(checkMemberStatedAmount(15_000, ask)).toBe(true);
  });

  it("accepts the same amount written as 15k", () => {
    expect(checkMemberStatedAmount(15_000, "15k")).toBe(true);
  });

  it("refuses an amount the Member never wrote", () => {
    expect(checkMemberStatedAmount(18_000, ask)).toBe(false);
  });

  it("reads lakh, Rs and Devanagari forms", () => {
    expect(checkMemberStatedAmount(240_000, "Caterer ko 2,40,000 kar do")).toBe(
      true,
    );
    expect(checkMemberStatedAmount(150_000, "decor 1.5 lakh rakho")).toBe(true);
    expect(checkMemberStatedAmount(200_000, "keep it at 2L")).toBe(true);
    expect(checkMemberStatedAmount(15_000, "Rs. 15000 for the DJ")).toBe(true);
    expect(checkMemberStatedAmount(15_000, "मेहंदी के लिए ₹१५,००० रखो")).toBe(
      true,
    );
    expect(checkMemberStatedAmount(50_000, "पचास नहीं, 50 हज़ार")).toBe(true);
  });

  it("refuses when the message has no amount at all", () => {
    expect(checkMemberStatedAmount(15_000, "Add a DJ for the sangeet")).toBe(
      false,
    );
  });

  it("refuses a zero, negative or fractional rupee amount", () => {
    expect(checkMemberStatedAmount(0, "0")).toBe(false);
    expect(checkMemberStatedAmount(-15_000, "-15000")).toBe(false);
    expect(checkMemberStatedAmount(15_000.5, "15000.5")).toBe(false);
  });

  it("reads a suffixed number only at its full value", () => {
    // 2 lakh is ₹2,00,000, not ₹2.
    expect(checkMemberStatedAmount(2, "keep it at 2L")).toBe(false);
  });
});

describe("exceedsProposalThresholds", () => {
  const budget = 1_200_000;

  it("returns null for one ₹15,000 Entry", () => {
    expect(
      exceedsProposalThresholds(
        [{ op: "addEntry", docId: null, amountShift: 15_000 }],
        budget,
      ),
    ).toBeNull();
  });

  it("gives a reason for a deletion", () => {
    expect(
      exceedsProposalThresholds(
        [{ op: "deleteEntry", docId: "e1", amountShift: 0 }],
        budget,
      ),
    ).toMatch(/delet/i);
  });

  it("gives a reason for a Budget total change", () => {
    expect(
      exceedsProposalThresholds(
        [{ op: "setBudgetTotal", docId: "ev", amountShift: 0 }],
        budget,
      ),
    ).toMatch(/Budget total/);
  });

  it("gives a reason for shifting more than 10% of the total", () => {
    expect(
      exceedsProposalThresholds(
        [
          { op: "updateEntry", docId: "e1", amountShift: 70_000 },
          { op: "updateEntry", docId: "e2", amountShift: 60_000 },
        ],
        budget,
      ),
    ).toMatch(/10%/);
    // Exactly 10% is still direct.
    expect(
      exceedsProposalThresholds(
        [{ op: "updateEntry", docId: "e1", amountShift: 120_000 }],
        budget,
      ),
    ).toBeNull();
  });

  it("gives a reason for a change touching 6 Entries", () => {
    const six = ["e1", "e2", "e3", "e4", "e5", "e6"].map((docId) => ({
      op: "updateEntry" as const,
      docId,
      amountShift: 0,
    }));
    expect(exceedsProposalThresholds(six, budget)).toMatch(/5/);
    expect(exceedsProposalThresholds(six.slice(0, 5), budget)).toBeNull();
  });

  it("counts several writes to one Entry once, and each new row once", () => {
    const same = Array.from({ length: 6 }, () => ({
      op: "updateEntry" as const,
      docId: "e1",
      amountShift: 0,
    }));
    expect(exceedsProposalThresholds(same, budget)).toBeNull();
    const inserts = Array.from({ length: 6 }, () => ({
      op: "addEntry" as const,
      docId: null,
      amountShift: 0,
    }));
    expect(exceedsProposalThresholds(inserts, budget)).toMatch(/5/);
  });

  it("checks no share without a Budget total", () => {
    expect(
      exceedsProposalThresholds(
        [{ op: "addEntry", docId: null, amountShift: 500_000 }],
        null,
      ),
    ).toBeNull();
  });
});
