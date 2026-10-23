import { describe, expect, it } from "vitest";
import type { BriefExtraction } from "../types";
import { aaravBirthday, jaipurWedding, puneGaneshUtsav } from "./examples";
import {
  answerChip,
  NO_PROGRESS,
  nextQuestion,
  OPENING_LINE,
  type BriefProgress,
} from "./questions";

// Today is 2026-10-21 in all three first-brief.md worked examples.
const TODAY = "2026-10-21";

/** Answers questions with the given answers in turn and lists what was asked. */
function walk(
  extraction: BriefExtraction,
  answers: Record<string, string | string[]>,
  progress: BriefProgress = NO_PROGRESS,
) {
  const asked: number[] = [];
  let state = { extraction, progress };
  for (let i = 0; i < 10; i++) {
    const question = nextQuestion(state.extraction, state.progress, TODAY);
    if (!question) break;
    asked.push(question.number);
    const answer = answers[question.id];
    if (answer === undefined) throw new Error(`Unexpected ${question.id}`);
    state = answerChip(state, question, answer, TODAY);
  }
  return { asked, state };
}

describe("the opening line", () => {
  it("matches first-brief.md", () => {
    expect(OPENING_LINE).toBe(
      "Tell me about what you're planning: what you're celebrating, where, roughly when, for how many people, and your budget if you have one.",
    );
  });
});

describe("nextQuestion", () => {
  it("asks the Jaipur wedding only Q6 (Tradition), then Q7 (Functions)", () => {
    const first = nextQuestion(jaipurWedding.extraction, NO_PROGRESS, TODAY);
    expect(first?.number).toBe(6);
    expect(first?.id).toBe("tradition");
    expect(first?.chips.map((c) => c.label)).toEqual([
      "North Indian Hindu",
      "Marwari / Rajasthani",
      "Punjabi or Sikh",
      "Muslim",
      "South Indian Hindu",
      "Bengali",
      "Christian",
      "Mixed (two families)",
      "Other, I'll describe it",
    ]);

    const { asked, state } = walk(jaipurWedding.extraction, {
      tradition: "north_indian_hindu",
      functions: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
    });
    expect(asked).toEqual([6, 7]);
    expect(state.extraction.tradition).toBe("North Indian Hindu");
    expect(state.progress.functionKeys).toEqual([
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
    ]);
  });

  it("shows the Tradition's Functions as toggles, all on, with 'add a Function'", () => {
    const { state } = walk(
      jaipurWedding.extraction,
      { tradition: "north_indian_hindu", functions: [] },
      NO_PROGRESS,
    );
    // An empty answer keeps the defaults rather than planning no Functions.
    expect(state.progress.functionKeys).toHaveLength(5);
    const q7 = nextQuestion(
      { ...jaipurWedding.extraction, tradition: "Punjabi or Sikh" },
      NO_PROGRESS,
      TODAY,
    );
    expect(q7?.id).toBe("functions");
    expect(q7?.multi).toBe(true);
    expect(q7?.chips.map((c) => c.value)).toEqual([
      "roka",
      "chunni",
      "mehendi",
      "jaggo",
      "anand_karaj",
      "reception",
    ]);
    expect(q7?.typeOwn?.label).toBe("Add a Function");
  });

  it("asks Aarav's birthday nothing: Guests are assumed at 60, so no Q4", () => {
    expect(
      nextQuestion(aaravBirthday.extraction, NO_PROGRESS, TODAY),
    ).toBeNull();
  });

  it("asks the Ganesh utsav to confirm 4 to 14 Sep 2027, then Q4 (Guests)", () => {
    const q3 = nextQuestion(puneGaneshUtsav.extraction, NO_PROGRESS, TODAY);
    expect(q3?.number).toBe(3);
    expect(q3?.chips[0]).toEqual({
      value: "festival:2027-09-04:2027-09-14",
      label: "Yes, 4 to 14 Sep 2027",
    });

    const { asked, state } = walk(puneGaneshUtsav.extraction, {
      date: "festival:2027-09-04:2027-09-14",
      guests: "400",
    });
    expect(asked).toEqual([3, 4]);
    expect(state.extraction.date).toEqual({ kind: "day", value: "2027-09-04" });
    expect(state.extraction.guests).toBe(400);
    // 240 households were given, so the optional Q7 isn't asked.
  });

  it("asks everything for an empty Brief, in first-brief order, seven at most", () => {
    const empty: BriefExtraction = {
      eventType: null,
      city: null,
      date: null,
      guests: null,
      budget: null,
      tradition: null,
      honoree: null,
      communityKind: null,
      households: null,
      notes: [],
    };
    const { asked, state } = walk(empty, {
      eventType: "wedding",
      city: "Jaipur",
      date: "month:2027-02",
      guests: "300",
      budget: "2500000",
      tradition: "marwari",
      functions: ["haldi", "wedding"],
    });
    expect(asked).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.extraction).toMatchObject({
      eventType: "wedding",
      city: "Jaipur",
      date: { kind: "month", value: "2027-02" },
      guests: 300,
      budget: 2500000,
      tradition: "Marwari / Rajasthani",
    });
  });

  it("asks a birthday who it's for, then the age", () => {
    const { asked, state } = walk(
      { ...aaravBirthday.extraction, honoree: null },
      { honoreeWho: "elder", honoreeAge: "60" },
    );
    expect(asked).toEqual([6, 7]);
    expect(state.extraction.honoree).toEqual({
      who: "elder",
      age: 60,
      name: null,
    });
  });

  it("lets the households question be skipped", () => {
    const q7 = nextQuestion(
      {
        ...puneGaneshUtsav.extraction,
        households: null,
        guests: 400,
        date: { kind: "day", value: "2027-09-04" },
      },
      NO_PROGRESS,
      TODAY,
    );
    expect(q7?.id).toBe("households");
    const { state } = walk(
      {
        ...puneGaneshUtsav.extraction,
        households: null,
        guests: 400,
        date: { kind: "day", value: "2027-09-04" },
      },
      { households: "skip" },
    );
    expect(state.extraction.households).toBeNull();
    expect(state.progress.householdsSkipped).toBe(true);
  });

  it("'Help me set one' leaves the budget to the Budget check", () => {
    const { state } = walk(
      { ...jaipurWedding.extraction, budget: null, tradition: "Bengali" },
      { budget: "help", functions: ["biye"] },
    );
    expect(state.extraction.budget).toBeNull();
    expect(state.progress.budgetHelp).toBe(true);
  });

  it("every chip question has a 'type my own' option or is a toggle list", () => {
    const empty = {
      ...puneGaneshUtsav.extraction,
      eventType: null,
      city: null,
      budget: null,
      communityKind: null,
      households: null,
    };
    let state = { extraction: empty as BriefExtraction, progress: NO_PROGRESS };
    const answers: Record<string, string> = {
      eventType: "community",
      city: "Pune",
      date: "day:2027-09-04",
      guests: "400",
      budget: "240000",
      communityKind: "ganesh-utsav",
      households: "240",
    };
    for (let i = 0; i < 7; i++) {
      const q = nextQuestion(state.extraction, state.progress, TODAY);
      if (!q) break;
      expect(q.typeOwn, q.id).not.toBeNull();
      state = answerChip(state, q, answers[q.id]!, TODAY);
    }
    expect(nextQuestion(state.extraction, state.progress, TODAY)).toBeNull();
  });
});

describe("answerChip reads typed answers", () => {
  it("reads a typed budget in lakhs and crores", () => {
    const q = nextQuestion(
      { ...jaipurWedding.extraction, budget: null },
      NO_PROGRESS,
      TODAY,
    )!;
    expect(q.id).toBe("budget");
    const read = (typed: string) =>
      answerChip(
        { extraction: { ...jaipurWedding.extraction, budget: null }, progress: NO_PROGRESS },
        q,
        typed,
        TODAY,
      ).extraction.budget;
    expect(read("15 lakh")).toBe(1500000);
    expect(read("₹19.6L")).toBe(1960000);
    expect(read("1.2 crore")).toBe(12000000);
    expect(read("2,40,000")).toBe(240000);
  });

  it("refuses an answer it can't read", () => {
    const q = nextQuestion(
      { ...jaipurWedding.extraction, guests: null },
      NO_PROGRESS,
      TODAY,
    )!;
    expect(() =>
      answerChip(
        { extraction: { ...jaipurWedding.extraction, guests: null }, progress: NO_PROGRESS },
        q,
        "lots",
        TODAY,
      ),
    ).toThrow(/number/);
  });
});
