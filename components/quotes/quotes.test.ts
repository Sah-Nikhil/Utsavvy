import { describe, expect, it } from "vitest";
import {
  comparedEntries,
  compareWithPlanned,
  numbersIn,
  quoteChangeLine,
  quoteForEntries,
  quoteLine,
  bookingQuestion,
  type QuoteEntry,
} from "./quotes";

// S12 (issue #45): the Budget comparison's arithmetic, all done by code. The
// worked example is docs/design/vendors.md, "A Quote pasted from WhatsApp":
// ₹950 a plate for 300 Guests at the sangeet is ₹2,85,000.

function line(
  id: string,
  functionKey: string | null,
  fields: Partial<QuoteEntry["fields"]> = {},
): QuoteEntry {
  return {
    _id: id,
    functionKey,
    fields: {
      quantity: 300,
      unit: "per_plate",
      plannedAmount: null,
      estimate: null,
      ...fields,
    },
  };
}

const sangeetCatering = line("sangeet-catering", "sangeet");
const weddingCatering = line("wedding-catering", "wedding", { quantity: 450 });

describe("quoteForEntries", () => {
  it("multiplies a plate price by the Quote's Guests: ₹950 × 300 = ₹2,85,000", () => {
    const quote = {
      amount: 950,
      unit: "per_plate" as const,
      functionKeys: ["sangeet"],
      guests: 300,
    };
    expect(quoteForEntries(quote, [sangeetCatering, weddingCatering])).toBe(
      285_000,
    );
  });

  it("compares a Quote that names Functions with those Functions' Entries only", () => {
    const quote = {
      amount: 950,
      unit: "per_plate" as const,
      functionKeys: ["sangeet"],
      guests: null,
    };
    expect(
      comparedEntries(quote, [sangeetCatering, weddingCatering]).map(
        (e) => e._id,
      ),
    ).toEqual(["sangeet-catering"]);
    // With no Guests on the Quote, the line's own plates count: 300.
    expect(quoteForEntries(quote, [sangeetCatering, weddingCatering])).toBe(
      285_000,
    );
  });

  it("compares a Quote that names no Function with every Entry its checklist Entry pays for", () => {
    const quote = {
      amount: 1_000,
      unit: "per_plate" as const,
      functionKeys: [],
      guests: null,
    };
    expect(
      comparedEntries(quote, [sangeetCatering, weddingCatering]).map(
        (e) => e._id,
      ),
    ).toEqual(["sangeet-catering", "wedding-catering"]);
    // 300 + 450 plates at ₹1,000.
    expect(quoteForEntries(quote, [sangeetCatering, weddingCatering])).toBe(
      750_000,
    );
  });

  it("keeps a total as it is, and counts a Function price once per Function", () => {
    expect(
      quoteForEntries(
        { amount: 1_80_000, unit: "total", functionKeys: [], guests: null },
        [sangeetCatering, weddingCatering],
      ),
    ).toBe(180_000);
    expect(
      quoteForEntries(
        {
          amount: 60_000,
          unit: "per_function",
          functionKeys: ["sangeet", "wedding"],
          guests: null,
        },
        [sangeetCatering, weddingCatering],
      ),
    ).toBe(120_000);
  });

  it("is zero when the Quote covers none of the Entries", () => {
    expect(
      quoteForEntries(
        {
          amount: 950,
          unit: "per_plate",
          functionKeys: ["haldi"],
          guests: 60,
        },
        [sangeetCatering],
      ),
    ).toBe(0);
  });
});

describe("compareWithPlanned", () => {
  it("says over and under in words as well as by its kind", () => {
    expect(compareWithPlanned(285_000, 245_000)).toEqual({
      kind: "over",
      by: 40_000,
      text: "₹40,000 over",
    });
    expect(compareWithPlanned(200_000, 245_000)).toEqual({
      kind: "under",
      by: 45_000,
      text: "₹45,000 under",
    });
    expect(compareWithPlanned(245_000, 245_000)).toEqual({
      kind: "same",
      by: 0,
      text: "the same as",
    });
  });
});

describe("the words", () => {
  it("asks the booking question with the Quote in lakhs", () => {
    expect(bookingQuestion(285_000)).toBe(
      "Use the ₹2.85L Quote as this line's amount?",
    );
  });

  it("shows how a Quote adds up, labelled as a Quote", () => {
    expect(
      quoteLine({
        amount: 950,
        unit: "per_plate",
        functionKeys: ["sangeet"],
        guests: 300,
        total: 285_000,
      }),
    ).toBe("₹950/plate × 300 = ₹2.85L");
    expect(
      quoteLine({
        amount: 180_000,
        unit: "total",
        functionKeys: [],
        guests: null,
        total: 180_000,
      }),
    ).toBe("₹1.8L in all");
  });

  it("describes a pasted Quote's change for its Proposal card", () => {
    expect(
      quoteChangeLine(
        {
          amount: 950,
          unit: "per_plate",
          functionKeys: ["sangeet"],
          guests: 300,
          note: "live counters extra",
        },
        "Vinayak Caterers",
        ["Sangeet"],
      ),
    ).toBe(
      "Quote from Vinayak Caterers: ₹950/plate for 300 Guests at the Sangeet (₹2,85,000), live counters extra",
    );
  });
});

describe("numbersIn", () => {
  it("reads every number a pasted message writes, with lakh and thousand words", () => {
    expect(numbersIn("Veg 950/plate for 300 pax, live counters extra")).toEqual(
      [950, 300],
    );
    expect(numbersIn("Total 2.85L, advance 50k, ₹1,20,000 balance")).toEqual([
      285_000, 50_000, 120_000,
    ]);
    expect(numbersIn("₹९५० प्रति प्लेट")).toEqual([950]);
    expect(numbersIn("no numbers here")).toEqual([]);
  });
});
