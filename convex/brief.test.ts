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
import { geocodeCity, runBudgetCheck } from "./brief";
import {
  type EstimateDeps,
  type ResearchInput,
  type ResearchOutput,
  stubEstimateDeps,
} from "./estimates";
import { registerStubObject, STUB_MODEL, stubCallCount } from "./lib/models";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

// The first Brief end to end on the stub model, whose canned BriefExtraction
// answers are the first-brief.md worked examples. Estimate research is off
// (no Claude key), so every price comes from the reference table, exactly as
// with `stubEstimateDeps`.

/** The day the client passes to `summary` (M3: no clock in the query). */
const TODAY = "2026-10-24";

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
  s.asMeera.query(api.brief.summary, { eventId: s.eventId, today: TODAY });

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
    // One summary card, which showed "Checking current prices in Jaipur"
    // until the check landed; no separate notice, so the Chat never merges
    // two Utsavvy lines into one.
    expect(shown.map((c) => c.kind)).toEqual(["briefChips", "briefSummary"]);
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
    // M7: the basis is stored with the check, not in the card's record ID.
    const stored = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(stored!.budgetCheck!.basis).toEqual({ researched: 3, lines: 27 });
    const summaryCard = (await cards(s)).find((c) => c.kind === "briefSummary");
    expect(summaryCard!.id).toBeNull();
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
      (
        await s.asPapa.query(api.brief.summary, {
          eventId: s.eventId,
          today: TODAY,
        })
      )?.canEdit,
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

// ---------------------------------------------------------------------------
// Review of #101

const PUNJABI_TEXT =
  "Punjabi wedding in Delhi in February 2027, 300 people, budget 25 lakh, with mehendi and sangeet.";
const NAVRATRI_TEXT =
  "Navratri garba in our society in Pune, 500 people, budget 3 lakh, garba and dandiya nights.";
const NONE = {
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
  functions: [],
  assumed: [],
};
registerStubObject({
  promptIncludes: PUNJABI_TEXT,
  object: {
    ...NONE,
    eventType: "wedding",
    city: "Delhi",
    date: { kind: "month", value: "2027-02" },
    guests: 300,
    budget: 2500000,
    tradition: "Punjabi",
    functions: ["mehendi", "sangeet"],
  },
});
registerStubObject({
  promptIncludes: NAVRATRI_TEXT,
  object: {
    ...NONE,
    eventType: "community",
    city: "Pune",
    date: { kind: "day", value: "2027-10-01" },
    guests: 500,
    budget: 300000,
    communityKind: "Navratri garba",
    households: 200,
    functions: ["garba", "dandiya"],
  },
});

describe("H1: a wedding Brief that names some Functions", () => {
  it("still asks Q7 and keeps the wedding itself", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: PUNJABI_TEXT,
    });
    const asked = await untilQuestion(s, "functions");
    expect(asked!.question!.chips.map((c) => c.value)).toEqual([
      "roka",
      "chunni",
      "mehendi",
      "jaggo",
      "anand_karaj",
      "reception",
      "sangeet",
    ]);
    await s.asMeera.mutation(api.brief.answerChip, {
      eventId: s.eventId,
      question: "functions",
      answer: asked!.question!.chips.map((c) => c.value),
    });
    const brief = await untilChecked(s);
    const keys = brief!.functions.map((f) => f.key);
    expect(keys).toContain("anand_karaj");
    expect(keys).toContain("reception");
    expect(keys).toContain("sangeet");
    // Seven Functions in Delhi (X tier): far above the two-Function minimum.
    expect(brief!.budgetCheck!.minimum).toBeGreaterThan(2_000_000);
  });
});

describe("M5: named Functions an Event type doesn't use", () => {
  it("leave no empty rows behind", async () => {
    const s = await setUp("community");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: NAVRATRI_TEXT,
    });
    const brief = await untilChecked(s);
    expect(brief!.functions.map((f) => f.key)).toEqual(["navratri_garba"]);
    for (const fn of brief!.functions) {
      expect(fn.date).not.toBeNull();
      expect(fn.guests).not.toBeNull();
    }
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("M4: submitting the Brief twice", () => {
  it("posts one line and makes one model call; the second submit sees the first", async () => {
    const s = await setUp("wedding");
    const calls = stubCallCount();
    const [first, second] = await Promise.all([
      s.asMeera.mutation(api.brief.submitText, {
        eventId: s.eventId,
        text: jaipurWedding.text,
      }),
      s.asAditi.mutation(api.brief.submitText, {
        eventId: s.eventId,
        text: "Something else entirely",
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([
      "alreadyGiven",
      "started",
    ]);
    // While the extraction runs, nobody sees the box any more.
    const reading = await summary(s);
    expect(["reading", "tradition"]).toContain(reading!.pendingQuestion);
    await untilQuestion(s, "tradition");
    expect(stubCallCount() - calls).toBe(1);
    const details = await s.asMeera.query(api.chat.details, {
      eventId: s.eventId,
    });
    const memberLines = details!.annotations.filter(
      (a) => a.authorMembershipId !== null,
    );
    expect(memberLines).toHaveLength(1);
  });
});

describe("M8: the Event type", () => {
  it("stays as the Member set it at creation, with the disagreement as an Assumption", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: aaravBirthday.text,
    });
    const brief = await untilQuestion(s, "tradition");
    expect(brief!.eventType).toBe("wedding");
    expect(brief!.extraction!.eventType).toBe("wedding");
    expect(brief!.assumptions).toContainEqual(
      expect.objectContaining({ field: "eventType" }),
    );
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.eventType).toBe("wedding");
  });
});

describe("M2: bounds on the server", () => {
  it("refuses Guests past 1,00,000 on an edit, a budget past ₹10,000Cr and more than 12 Functions", async () => {
    const s = await setUp("birthday");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: aaravBirthday.text,
    });
    await untilChecked(s);
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "guests", functionKey: null, guests: 200_000 },
      }),
    ).rejects.toThrow(/BadAnswer/);
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "budget", budget: 2e11 },
      }),
    ).rejects.toThrow(/BadAnswer/);

    const w = await setUp("wedding");
    await w.asMeera.mutation(api.brief.submitText, {
      eventId: w.eventId,
      text: jaipurWedding.text,
    });
    await untilQuestion(w, "tradition");
    await w.asMeera.mutation(api.brief.answerChip, {
      eventId: w.eventId,
      question: "tradition",
      answer: ["north_indian_hindu"],
    });
    await untilQuestion(w, "functions");
    await expect(
      w.asMeera.mutation(api.brief.answerChip, {
        eventId: w.eventId,
        question: "functions",
        answer: Array.from({ length: 13 }, (_, i) => `party ${i}`),
      }),
    ).rejects.toThrow(/12/);
  });
});

describe("M3: the summary with a long Chat", () => {
  it("still finds the question being asked after many later messages", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    await untilQuestion(s, "tradition");
    for (let i = 0; i < 40; i++) {
      await s.asMeera.mutation(api.chat.send, {
        eventId: s.eventId,
        text: `note ${i}`,
        dontReply: true,
        pointing: [],
      });
    }
    expect((await summary(s))!.pendingQuestion).toBe("tradition");
  });
});

describe("M9: who may answer and edit", () => {
  it("refuses Viewers and removed Members on answerChip and editField", async () => {
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    await untilQuestion(s, "tradition");
    const answer = {
      eventId: s.eventId,
      question: "tradition" as const,
      answer: ["north_indian_hindu"],
    };
    const edit = {
      eventId: s.eventId,
      change: { field: "budget" as const, budget: 3_000_000 },
    };
    await expect(
      s.asPapa.mutation(api.brief.answerChip, answer),
    ).rejects.toThrow(/AccessDenied|notAllowed/);
    await expect(s.asPapa.mutation(api.brief.editField, edit)).rejects.toThrow(
      /AccessDenied|notAllowed/,
    );
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.member, { status: "removed" }),
    );
    await expect(
      s.asAditi.mutation(api.brief.answerChip, answer),
    ).rejects.toThrow(/AccessDenied|removed/);
    await expect(s.asAditi.mutation(api.brief.editField, edit)).rejects.toThrow(
      /AccessDenied|removed/,
    );
  });
});

describe("M9: when no model can read the Brief", () => {
  it("says so in the first question and asks for everything", async () => {
    vi.stubEnv("DEFAULT_MODEL", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const s = await setUp("wedding");
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    const brief = await untilQuestion(s, "city");
    expect(brief!.extraction!.guests).toBeNull();
    const asked = (await cards(s)).find((c) => c.id === "city");
    expect(asked!.text).toMatch(
      /^I couldn't read that just now, so I'll ask a few quick questions instead\. Which city/,
    );
  });
});

describe("M9: geocodeCity", () => {
  const KEY = "geo-secret-123";

  it("returns the city's centre from Geoapify", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get("text")).toBe("Pune");
      return new Response(
        JSON.stringify({ results: [{ lat: 18.52, lon: 73.85 }] }),
      );
    });
    expect(
      await geocodeCity("Pune", {
        apiKey: KEY,
        fetch: fetch as unknown as typeof globalThis.fetch,
      }),
    ).toEqual({ lat: 18.52, lng: 73.85 });
  });

  it("returns null with no key, on an error status or a timeout, and never logs the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const never = vi.fn();
    expect(
      await geocodeCity("Pune", {
        apiKey: undefined,
        fetch: never as unknown as typeof globalThis.fetch,
      }),
    ).toBeNull();
    expect(never).not.toHaveBeenCalled();

    const failing = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(
      await geocodeCity("Pune", {
        apiKey: KEY,
        fetch: failing as unknown as typeof globalThis.fetch,
      }),
    ).toBeNull();

    const timeout = vi.fn(async (url: string) => {
      throw new DOMException(`The operation timed out: ${url}`, "TimeoutError");
    });
    expect(
      await geocodeCity("Pune", {
        apiKey: KEY,
        fetch: timeout as unknown as typeof globalThis.fetch,
      }),
    ).toBeNull();

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain(KEY);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
