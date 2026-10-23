/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aaravBirthday,
  hinglishWedding,
  jaipurWedding,
  puneGaneshUtsav,
} from "../lib/brief/examples";
import { OPENING_LINE } from "../lib/brief/questions";
import { api } from "./_generated/api";
import { runBudgetCheck } from "./brief";
import {
  type EstimateDeps,
  type ResearchInput,
  type ResearchOutput,
  stubEstimateDeps,
} from "./estimates";
import { STUB_MODEL } from "./lib/models";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

// The first Brief end to end on the stub model, whose canned BriefExtraction
// answers are the first-brief.md worked examples. Estimate research is off
// (no Claude key), so every price comes from the reference table, exactly as
// with `stubEstimateDeps`.

beforeEach(() => {
  vi.stubEnv("DEFAULT_MODEL", STUB_MODEL);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEOAPIFY_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

type T = ReturnType<typeof newTest>;

async function setUp(eventType: "wedding" | "birthday" | "community") {
  const t = newTest();
  agentTest.register(t);
  const asMeera = t.withIdentity(identityFor("Meera"));
  const eventId = await asMeera.mutation(api.events.create, {
    name: "Test Event",
    eventType,
  });
  const { viewer, member } = await t.run(async (ctx) => {
    const viewer = await seedMembership(ctx, {
      clerkId: "Papa",
      role: "viewer",
      eventId,
    });
    const member = await seedMembership(ctx, {
      clerkId: "Aditi",
      role: "member",
      eventId,
    });
    return { viewer: viewer.membershipId, member: member.membershipId };
  });
  return {
    t,
    eventId,
    viewer,
    member,
    asMeera,
    asPapa: t.withIdentity(identityFor("Papa")),
    asAditi: t.withIdentity(identityFor("Aditi")),
  };
}
type S = Awaited<ReturnType<typeof setUp>>;

/** Waits until the scheduled Brief work has settled and `ready` holds. */
async function until<R>(
  s: S,
  read: () => Promise<R>,
  ready: (value: R) => boolean,
): Promise<R> {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (ready(value)) {
      await s.t.finishInProgressScheduledFunctions();
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The Brief never settled");
}

const summary = (s: S) =>
  s.asMeera.query(api.brief.summary, { eventId: s.eventId });

const untilQuestion = (s: S, id: string) =>
  until(
    s,
    () => summary(s),
    (b) => b?.pendingQuestion === id,
  );

const untilChecked = (s: S) =>
  until(
    s,
    () => summary(s),
    (b) => b?.briefState === "summary" && b.budgetCheck !== null,
  );

async function cards(s: S) {
  const details = await s.asMeera.query(api.chat.details, {
    eventId: s.eventId,
  });
  const page = await s.asMeera.query(api.chat.list, {
    eventId: s.eventId,
    threadId: details!.threadId!,
    paginationOpts: { numItems: 50, cursor: null },
  });
  const text = new Map(page.page.map((m) => [m.id, m.text]));
  return details!.annotations
    .filter((a) => a.card !== null)
    .map((a) => ({ ...a.card!, text: text.get(a.messageId) ?? "" }));
}

describe("the opening line", () => {
  it("opens a new Event's Chat with the first-brief.md line", async () => {
    const s = await setUp("wedding");
    expect(await cards(s)).toEqual([
      { kind: "briefChips", id: "opening", text: OPENING_LINE },
    ]);
    const brief = await summary(s);
    expect(brief?.briefState).toBe("intake");
    expect(brief?.pendingQuestion).toBe("text");
  });
});

describe("extraction", () => {
  it("reads the Jaipur wedding and asks only Q6, then Q7", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    const brief = await untilQuestion(s, "tradition");
    expect(brief?.extraction).toEqual(jaipurWedding.extraction);
    expect(brief?.city).toEqual({ name: "Jaipur", tier: "Y" });

    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "tradition",
      answer: ["north_indian_hindu"],
    });
    await untilQuestion(s, "functions");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "functions",
      answer: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
    });
    const done = await untilChecked(s);
    expect(done!.functions.map((f) => [f.key, f.guests])).toEqual([
      ["haldi", 60],
      ["mehendi", 120],
      ["sangeet", 225],
      ["wedding", 300],
      ["reception", 300],
    ]);
    // ₹25L is tight: no flag (first-brief.md worked example 1).
    expect(done!.budgetCheck).toMatchObject({
      band: "tight",
      flag: null,
    });
    expect(done!.budgetCheck!.minimum).toBeGreaterThan(1_961_000);
    expect(done!.budgetCheck!.minimum).toBeLessThan(1_963_000);

    // Only the two questions were asked, as chips cards.
    const asked = (await cards(s))
      .filter((c) => c.kind === "briefChips")
      .map((c) => c.id);
    expect(asked).toEqual(["opening", "tradition", "functions"]);
  });

  it("takes Aarav's birthday straight to the summary, with 60 Guests assumed", async () => {
    const s = await setUp("birthday");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: aaravBirthday.text,
    });
    const brief = await untilChecked(s);
    expect(brief?.extraction).toEqual(aaravBirthday.extraction);
    expect(brief?.assumptions.map((a) => a.value)).toEqual(
      expect.arrayContaining([
        "60 Guests",
        "35 children get return gifts",
        "3 kg cake",
      ]),
    );
    expect(brief!.budgetCheck).toMatchObject({
      band: "comfortable",
      minimum: 68915,
    });
    const shown = await cards(s);
    expect(shown.map((c) => c.kind)).toEqual([
      "briefChips",
      "system",
      "briefSummary",
    ]);
    expect(shown[1]!.text).toBe("Checking current prices in Jaipur");
  });

  it("unknown fields stay null and the Assistant asks for them", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: "We're planning something lovely.",
    });
    // The stub has no canned answer for this, so every field comes back null;
    // the Event was created as a wedding, so Q1 isn't needed.
    const brief = await untilQuestion(s, "city");
    expect(brief?.extraction).toMatchObject({
      eventType: "wedding",
      city: null,
      date: null,
      guests: null,
      budget: null,
    });
  });
});

describe("the Ganesh utsav", () => {
  it("confirms 4 to 14 Sep 2027, asks Q4, then flags ₹36,000 short", async () => {
    const s = await setUp("community");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: puneGaneshUtsav.text,
    });
    await untilQuestion(s, "date");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "date",
      answer: ["festival:2027-09-04:2027-09-14"],
    });
    await untilQuestion(s, "guests");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "guests",
      answer: ["400"],
    });
    const brief = await untilChecked(s);
    expect(brief!.city).toEqual({ name: "Pune", tier: "X" });
    expect(brief!.budgetCheck).toMatchObject({
      band: "belowMinimum",
      flag: "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short.",
      raiseTo: 276000,
      raiseLabel: "about ₹2.76L",
      perHousehold: 1000,
      basis: "Based on Utsavvy's reference table for all 14 lines.",
    });
  });
});

describe("the Budget check", () => {
  async function hinglishAtSummary() {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: hinglishWedding.text,
    });
    await untilQuestion(s, "tradition");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "tradition",
      answer: ["north_indian_hindu"],
    });
    await untilQuestion(s, "functions");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "functions",
      answer: ["haldi", "mehendi", "sangeet", "wedding", "reception"],
    });
    return { s, brief: await untilChecked(s) };
  }

  it("flags the ₹15L variant with 'Raise the budget' to about ₹19.6L", async () => {
    const { brief } = await hinglishAtSummary();
    expect(brief!.budgetCheck).toMatchObject({
      band: "belowMinimum",
      flag: "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short.",
      raiseLabel: "about ₹19.6L",
    });
    expect(brief!.budgetCheck!.raiseTo).toBeGreaterThanOrEqual(
      brief!.budgetCheck!.minimum,
    );
    expect(brief!.canPlanAnyway).toBe(true);
  });

  it("'Raise the budget' clears the flag", async () => {
    const { s, brief } = await hinglishAtSummary();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: brief!.budgetCheck!.raiseTo! },
    });
    const raised = await untilChecked(s);
    expect(raised!.budget).toBe(brief!.budgetCheck!.raiseTo);
    expect(raised!.budgetCheck).toMatchObject({ band: "tight", flag: null });
  });

  it("moves the minimum by the catering lines' change in lows × 1.10 with a researched range", async () => {
    const { s, brief } = await hinglishAtSummary();
    const tableMinimum = brief!.budgetCheck!.minimum;

    // Research finds ₹1,200-₹2,400 a plate for the main dinners instead of the
    // table's ₹1,000-₹2,000. The three main-dinner lines are the sangeet (225),
    // the wedding (300) and the reception (300): 825 plates. Their lows rise by
    // ₹200 × 825 = ₹1,65,000, and the minimum by ₹1,65,000 × 1.10 = ₹1,81,500.
    const research = vi.fn(
      async (input: ResearchInput): Promise<ResearchOutput | null> => {
        const lineIn = input.lines[0]!;
        if (lineIn.category !== "catering_main") return null;
        const url = "https://example-caterer.in/menus";
        return {
          model: "claude-sonnet-5-5",
          searchResultUrls: [url],
          searchesUsed: 1,
          usage: [],
          results: [
            {
              key: lineIn.key,
              unitLow: 1200,
              unitHigh: 2400,
              sourceUrls: [url],
              reasoning: "Jaipur banquet menus list ₹1,200 to ₹2,400 a plate.",
            },
          ],
        };
      },
    );
    const deps: Partial<EstimateDeps> = {
      ...stubEstimateDeps,
      research,
      claudeReachable: () => true,
    };
    await runBudgetCheck(actionCtx(s.t), s.eventId, deps);
    const after = await summary(s);
    expect(after!.budgetCheck!.minimum - tableMinimum).toBe(181500);
    expect(after!.budgetCheck!.basis).toBe(
      "Based on prices researched today for 3 of 27 lines; the rest from Utsavvy's reference table.",
    );
  });
});

describe("a city on neither list", () => {
  it("is Z, shown as the Assumption 'treated as a smaller city'", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: "We're planning something lovely.",
    });
    await untilQuestion(s, "city");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "city",
      answer: ["Kishangarh"],
    });
    const brief = await untilQuestion(s, "date");
    expect(brief!.city).toEqual({ name: "Kishangarh", tier: "Z" });
    expect(brief!.assumptions).toContainEqual(
      expect.objectContaining({
        field: "city.tier",
        value: "Treated as a smaller city",
      }),
    );
  });
});

describe("editField", () => {
  async function aaravAtSummary() {
    const s = await setUp("birthday");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: aaravBirthday.text,
    });
    return { s, brief: await untilChecked(s) };
  }

  it("before the plan, a Guest count change updates the Brief and re-runs the Budget check", async () => {
    const { s, brief } = await aaravAtSummary();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "guests", functionKey: null, guests: 100 },
    });
    const changed = await untilChecked(s);
    expect(changed!.guests).toBe(100);
    expect(changed!.functions[0]!.guests).toBe(100);
    // 40 more plates at ₹400, 2 more kg of cake at ₹800: ₹17,600 more in lows.
    expect(changed!.budgetCheck!.minimum - brief!.budgetCheck!.minimum).toBe(
      Math.round(17600 * 1.1),
    );
  });

  it("after the plan, a Guest count change goes to proposeEssentialChange and writes nothing", async () => {
    const { s } = await aaravAtSummary();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { briefState: "planned" }),
    );
    const before = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "guests", functionKey: null, guests: 100 },
      }),
    ).rejects.toThrow(/changing an essential after the first plan/);
    const after = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(after).toEqual(before);
  });

  it("after the plan, changing the honoree applies directly", async () => {
    const { s } = await aaravAtSummary();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { briefState: "planned" }),
    );
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: {
        field: "honoree",
        honoree: { who: "child", age: 7, name: "Aarav" },
      },
    });
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.honoree).toEqual({ who: "child", age: 7, name: "Aarav" });
    expect(event!.brief!.extraction.honoree).toEqual({
      who: "child",
      age: 7,
      name: "Aarav",
    });
  });

  it("changes one Function's date, which stops being assumed", async () => {
    const s = await setUp("community");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: puneGaneshUtsav.text,
    });
    await untilQuestion(s, "date");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "date",
      answer: ["festival:2027-09-04:2027-09-14"],
    });
    await untilQuestion(s, "guests");
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "guests",
      answer: ["400"],
    });
    await untilChecked(s);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: {
        field: "functionDate",
        functionKey: "cultural_night",
        date: { kind: "day", value: "2027-09-12" },
      },
    });
    const brief = await untilChecked(s);
    const night = brief!.functions.find((f) => f.key === "cultural_night")!;
    expect(night.date).toEqual({ kind: "day", value: "2027-09-12" });
    expect(night.assumed).toEqual([]);
    expect(
      brief!.assumptions.some(
        (a) => a.field === "function.cultural_night.date",
      ),
    ).toBe(false);
  });
});

describe("who may answer", () => {
  it("refuses Viewers and removed Members", async () => {
    const s = await setUp("wedding");
    await expect(
      s.asPapa.mutation(api.brief.submitText, {
        eventId: s.eventId,
        text: jaipurWedding.text,
      }),
    ).rejects.toThrow(/AccessDenied|notAllowed/);
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.member, { status: "removed" }),
    );
    await expect(
      s.asAditi.mutation(api.brief.submitText, {
        eventId: s.eventId,
        text: jaipurWedding.text,
      }),
    ).rejects.toThrow(/AccessDenied|removed/);
    // Viewers can still read the summary.
    expect(
      (await s.asPapa.query(api.brief.summary, { eventId: s.eventId }))
        ?.canEdit,
    ).toBe(false);
  });

  it("lets any active Member answer, and refuses an answer to a question no longer asked", async () => {
    const s = await setUp("wedding");
    await s.asAditi.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    await untilQuestion(s, "tradition");
    await expect(
      s.asAditi.mutation(api.brief.answerChip, {
        eventId: s.eventId,
        question: "guests",
        answer: ["200"],
      }),
    ).rejects.toThrow(/QuestionNotAsked/);
    await expect(
      s.asMeera.mutation(api.brief.submitText, {
        eventId: s.eventId,
        text: "again",
      }),
    ).rejects.toThrow(/BriefAlreadyGiven/);
  });
});

/** The action-side context `runBudgetCheck` needs, backed by convex-test. */
function actionCtx(t: T): Parameters<typeof runBudgetCheck>[0] {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  return {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
    runAction: t.action as Call,
  } as unknown as Parameters<typeof runBudgetCheck>[0];
}
