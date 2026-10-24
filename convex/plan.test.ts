/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetRollup } from "../components/items/budget/rollup";
import {
  aaravBirthday,
  jaipurWedding,
  puneGaneshUtsav,
} from "../lib/brief/examples";
import type { FirstPlanDraft } from "../lib/types";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { estimateLines, stubEstimateDeps } from "./estimates";
import { STUB_MODEL } from "./lib/models";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";
import {
  aaravBirthdayDraft,
  applyPlan,
  diffEssentialChange,
  jaipurWeddingDraft,
  planLinesOf,
  pricePlanDraft,
  puneGaneshUtsavDraft,
  runPlan,
  toFirstPlanDraft,
  validateDraft,
  type PlanDraftOutput,
  type PlanInput,
} from "./plan";

// The first plan (S14) on the stub model, with Estimate research off (no
// Claude key), so every line is priced from the reference table exactly as
// with `stubEstimateDeps`. The worked examples' numbers come from
// docs/design/first-brief.md, where today is 2026-10-21.

const TODAY = "2026-10-21";

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

/** Waits until scheduled work has settled and `ready` holds. */
async function until<R>(
  s: S,
  read: () => Promise<R>,
  ready: (value: R) => boolean,
): Promise<R> {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (ready(value)) {
      await s.t.finishInProgressScheduledFunctions();
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Never settled");
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

/** The Jaipur wedding at its Brief summary: North Indian Hindu, all five Functions. */
async function jaipurAtSummary(): Promise<S> {
  const s = await setUp("wedding");
  await s.asMeera.mutation(api.brief.submitText, {
    eventId: s.eventId,
    text: jaipurWedding.text,
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
  await untilChecked(s);
  return s;
}

async function aaravAtSummary(): Promise<S> {
  const s = await setUp("birthday");
  await s.asMeera.mutation(api.brief.submitText, {
    eventId: s.eventId,
    text: aaravBirthday.text,
  });
  await untilChecked(s);
  return s;
}

async function ganeshAtSummary(): Promise<S> {
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
  return s;
}

function actionCtx(t: T): Parameters<typeof runPlan>[0] {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  return {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
    runAction: t.action as Call,
  } as unknown as Parameters<typeof runPlan>[0];
}

/** A plan run as `api.plan.make` starts it, without scheduling the pipeline. */
async function startRun(s: S): Promise<Id<"runs">> {
  return await s.t.run(async (ctx) => {
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .take(10)
    ).find((m) => m.role === "owner")!;
    await ctx.db.patch("events", s.eventId, { briefState: "planning" });
    return await ctx.db.insert("runs", {
      eventId: s.eventId,
      requestedBy: owner._id,
      source: "brief",
      messageId: null,
      commentId: null,
      status: "running",
      stoppedBy: null,
      model: "",
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
    });
  });
}

/** Runs the pipeline with a fixed draft, `stubEstimateDeps` and today as in the worked examples. */
async function planWith(s: S, output: PlanDraftOutput): Promise<Id<"runs">> {
  const runId = await startRun(s);
  await runPlan(
    actionCtx(s.t),
    { eventId: s.eventId, runId },
    {
      draft: async (input) => ({
        draft: toFirstPlanDraft(output, input.functions),
        model: STUB_MODEL,
      }),
      estimate: stubEstimateDeps,
      today: TODAY,
    },
  );
  return runId;
}

async function liveEntries(s: S): Promise<Doc<"entries">[]> {
  return await s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("entries")
        .withIndex("by_event_kind", (q) => q.eq("eventId", s.eventId))
        .take(500)
    ).filter((e) => e.deletedAt === null),
  );
}

async function budgetEntries(s: S) {
  return (await liveEntries(s)).filter(
    (e): e is Extract<Doc<"entries">, { kind: "budget" }> =>
      e.kind === "budget",
  );
}

async function timelineEntries(s: S) {
  return (await liveEntries(s)).filter(
    (e): e is Extract<Doc<"entries">, { kind: "timeline" }> =>
      e.kind === "timeline",
  );
}

async function suggestions(s: S) {
  return await s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "suggestion"),
        )
        .take(50)
    ).filter((i) => i.deletedAt === null),
  );
}

/** The Jaipur wedding's five Functions as the Brief fills them in (first-brief.md). */
const JAIPUR_FUNCTIONS: PlanInput["functions"] = [
  {
    key: "haldi",
    name: "Haldi",
    date: { kind: "day", value: "2027-02-14" },
    guests: 60,
    assumed: ["date", "guests"],
  },
  {
    key: "mehendi",
    name: "Mehendi",
    date: { kind: "day", value: "2027-02-13" },
    guests: 120,
    assumed: ["date", "guests"],
  },
  {
    key: "sangeet",
    name: "Sangeet",
    date: { kind: "day", value: "2027-02-14" },
    guests: 225,
    assumed: ["date", "guests"],
  },
  {
    key: "wedding",
    name: "Wedding",
    date: { kind: "day", value: "2027-02-15" },
    guests: 300,
    assumed: ["date"],
  },
  {
    key: "reception",
    name: "Reception",
    date: { kind: "day", value: "2027-02-16" },
    guests: 300,
    assumed: ["date", "guests"],
  },
];

const KEYS = JAIPUR_FUNCTIONS.map((fn) => fn.key);
const jaipurDraft = (): FirstPlanDraft =>
  toFirstPlanDraft(jaipurWeddingDraft, JAIPUR_FUNCTIONS);
const check = (draft: FirstPlanDraft) =>
  validateDraft(draft, { eventType: "wedding", functionKeys: KEYS });

// ---------------------------------------------------------------------------

describe("validateDraft", () => {
  it("accepts the Jaipur wedding's fixed draft", () => {
    expect(check(jaipurDraft())).toEqual([]);
  });

  it("rejects a draft with an amount, in words or as a field", () => {
    const inText = jaipurDraft();
    inText.suggestions[0]!.body = "A Manganiyar group for about ₹25,000.";
    expect(check(inText).join(" ")).toMatch(/amount/i);

    const inLakh = jaipurDraft();
    inLakh.functions[0]!.runSheet[0]!.label = "Pay the 2 lakh advance";
    expect(check(inLakh).join(" ")).toMatch(/amount/i);

    const asField = jaipurDraft();
    (asField.eventWide[0] as Record<string, unknown>).amount = 40000;
    expect(check(asField).join(" ")).toMatch(/amount/i);
  });

  it("rejects an unknown category, or a known one in the wrong unit", () => {
    const unknown = jaipurDraft();
    unknown.functions[1]!.budgetEntries[0]!.category = "catering_deluxe";
    expect(check(unknown).join(" ")).toMatch(/catering_deluxe/);

    const wrongUnit = jaipurDraft();
    wrongUnit.eventWide[0]!.unit = "per_event";
    expect(check(wrongUnit).join(" ")).toMatch(/photography_video/);
  });

  it("rejects a run sheet outside 6 to 10 Entries", () => {
    const short = jaipurDraft();
    short.functions[0]!.runSheet = short.functions[0]!.runSheet.slice(0, 5);
    expect(check(short).join(" ")).toMatch(/Haldi run sheet has 5 Entries/);

    const long = jaipurDraft();
    const sheet = long.functions[3]!.runSheet;
    long.functions[3]!.runSheet = [...sheet, sheet[0]!, sheet[1]!, sheet[2]!];
    expect(check(long).join(" ")).toMatch(/Wedding run sheet has 11 Entries/);
  });

  it("rejects a Function the Event doesn't have, or one left out", () => {
    const extra = jaipurDraft();
    extra.functions[0]!.key = "cocktail";
    const errors = check(extra).join(" ");
    expect(errors).toMatch(/cocktail/);
    expect(errors).toMatch(/haldi/);
  });

  it("accepts the birthday and Ganesh utsav drafts too", () => {
    const party: PlanInput["functions"] = [
      {
        key: "party",
        name: "Party",
        date: { kind: "day", value: "2026-12-12" },
        guests: 60,
        assumed: [],
      },
    ];
    expect(
      validateDraft(toFirstPlanDraft(aaravBirthdayDraft, party), {
        eventType: "birthday",
        functionKeys: ["party"],
      }),
    ).toEqual([]);
    const ganesh: PlanInput["functions"] = [
      ["sthapana", { kind: "day", value: "2027-09-04" }, 150],
      [
        "daily_aarti",
        { kind: "range", from: "2027-09-04", to: "2027-09-13" },
        100,
      ],
      ["cultural_night", { kind: "day", value: "2027-09-11" }, 400],
      ["visarjan", { kind: "day", value: "2027-09-14" }, 300],
    ].map(([key, date, guests]) => ({
      key: key as string,
      name: key as string,
      date: date as PlanInput["functions"][number]["date"],
      guests: guests as number,
      assumed: [],
    }));
    expect(
      validateDraft(toFirstPlanDraft(puneGaneshUtsavDraft, ganesh), {
        eventType: "community",
        functionKeys: ganesh.map((fn) => fn.key),
      }),
    ).toEqual([]);
  });
});

describe("applying the Jaipur wedding's fixed draft", () => {
  it("gives the worked example's numbers, every Estimate from the reference table", async () => {
    const s = await jaipurAtSummary();
    await planWith(s, jaipurWeddingDraft);

    const budget = await budgetEntries(s);
    const lines = budget.filter((e) => e.fields.role === "line");
    for (const line of lines) {
      expect(line.fields.estimate?.label).toBe("Estimate");
      expect(line.fields.estimate?.basis.kind).toBe("referenceTable");
    }
    const amount = (key: string, category: string) =>
      lines.find(
        (e) => e.functionKey === key && e.fields.category === category,
      )!.fields.estimate!.amount;
    // first-brief.md: catering ₹1,210 per plate × 300, Venue ₹1,01,000,
    // decor ₹1,01,000, baraat band and ghodi ₹40,000, pandit ₹14,000.
    expect([
      amount("wedding", "catering_main"),
      amount("wedding", "venue_large"),
      amount("wedding", "decor_main"),
      amount("wedding", "baraat_band_ghodi"),
      amount("wedding", "pandit_puja"),
    ]).toEqual([363000, 101000, 101000, 40000, 14000]);

    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    const rollup = budgetRollup(budget, event!.budgetTotal);
    expect(rollup.total).toBe(2500000);
    expect(Math.abs(rollup.contingency - 227000)).toBeLessThanOrEqual(5000);
    expect(Math.abs(rollup.byFunction.haldi! - 92000)).toBeLessThanOrEqual(
      3000,
    );
    expect(event!.briefState).toBe("planned");
    expect(event!.budgetCheck?.band).toBe("tight");

    // Plates follow each Function's Guests, which are assumed except the wedding's.
    const haldiCatering = lines.find(
      (e) => e.functionKey === "haldi" && e.fields.category === "catering_light",
    )!;
    expect(haldiCatering.fields.quantity).toBe(60);
    expect(haldiCatering.assumed).toContain("quantity");
    const weddingCatering = lines.find(
      (e) => e.functionKey === "wedding" && e.fields.category === "catering_main",
    )!;
    expect(weddingCatering.assumed).not.toContain("quantity");
  });

  it("lists 14 Vendors to find and pulls the late bookings forward", async () => {
    const s = await jaipurAtSummary();
    await planWith(s, jaipurWeddingDraft);

    const checklistItem = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("items")
          .withIndex("by_event_kind", (q) =>
            q.eq("eventId", s.eventId).eq("kind", "checklist"),
          )
          .take(5)
      ).find((i) => i.deletedAt === null),
    );
    const view = await s.asMeera.query(api.entries.forItem, {
      itemId: checklistItem!._id,
    });
    expect(view.entries).toHaveLength(14);
    expect(new Set(Object.values(view.checklistStatus))).toEqual(
      new Set(["toFind"]),
    );
    // Venue × 4, each for its own Function and booked by the Venues deadline.
    const venues = view.entries.filter(
      (e) => e.kind === "checklist" && e.fields.vendorCategory === "venue",
    );
    expect(venues).toHaveLength(4);
    for (const venue of venues) expect(view.bookBy[venue._id]).toBe("2026-10-28");

    const deadlines = (await timelineEntries(s)).filter(
      (e) => e.fields.time === null,
    );
    const due = (leadKey: string) =>
      deadlines.find((e) => e.fields.leadKey === leadKey)!.fields;
    expect(due("book_venues")).toMatchObject({
      date: "2026-10-28",
      late: true,
      priority: "P1",
    });
    expect(due("book_venues").note).toMatch(/this week/);
    expect(due("book_caterer")).toMatchObject({ date: "2026-10-28", late: true });
    expect(due("book_photographer")).toMatchObject({ date: "2026-10-28" });
    for (const key of [
      "book_decorator",
      "book_makeup_mehendi",
      "book_baraat_band",
      "order_outfits",
    ])
      expect(due(key)).toMatchObject({
        date: "2026-11-04",
        late: true,
        priority: "P2",
      });
    expect(due("book_dj")).toMatchObject({
      date: "2026-11-11",
      late: true,
      priority: "P3",
    });
    expect(due("book_transport")).toMatchObject({
      date: "2026-11-13",
      late: false,
    });
    expect(due("send_invitations").date).toBe("2026-12-19");
    expect(due("makeup_trial").date).toBe("2027-01-13");
    expect(due("share_run_sheets").date).toBe("2027-01-13");

    // Every Function's run sheet has 6 to 10 timed Entries, all assumed.
    const runSheet = (await timelineEntries(s)).filter(
      (e) => e.fields.time !== null,
    );
    for (const key of KEYS) {
      const sheet = runSheet.filter((e) => e.functionKey === key);
      expect(sheet.length).toBeGreaterThanOrEqual(6);
      expect(sheet.length).toBeLessThanOrEqual(10);
      for (const entry of sheet) expect(entry.assumed).toContain("time");
    }
    expect(
      runSheet.filter((e) => e.functionKey === "wedding").map((e) => e.fields.time),
    ).toEqual([
      "17:30",
      "18:30",
      "19:00",
      "19:45",
      "20:15",
      "20:30",
      "22:30",
      "01:00",
    ]);

    // 7 Suggestions; the costed ones carry a table Estimate and none counts in the Budget.
    const ideas = await suggestions(s);
    expect(ideas).toHaveLength(7);
    for (const idea of ideas) {
      if (idea.kind !== "suggestion") continue;
      expect(idea.data.status).toBe("open");
      if (idea.data.costCategory !== null)
        expect(idea.data.estimate?.basis.kind).toBe("referenceTable");
    }
  });

  it("is idempotent per run: applying the same run again adds nothing", async () => {
    const s = await jaipurAtSummary();
    const runId = await startRun(s);
    const input = await s.t.query(internal.plan.planInput, {
      eventId: s.eventId,
      runId,
    });
    const draft = toFirstPlanDraft(jaipurWeddingDraft, input!.functions);
    const ranges = await estimateLines(
      actionCtx(s.t),
      {
        eventId: s.eventId,
        city: input!.event.city.name,
        tier: input!.event.city.tier,
        eventType: input!.event.eventType,
        lines: planLinesOf(draft),
      },
      stubEstimateDeps,
    );
    const priced = pricePlanDraft(input!, draft, ranges, TODAY);
    await s.t.run((ctx) => applyPlan(ctx, s.eventId, priced));
    const once = await liveEntries(s);
    const ideas = (await suggestions(s)).length;
    await s.t.run((ctx) => applyPlan(ctx, s.eventId, priced));
    expect(await liveEntries(s)).toHaveLength(once.length);
    expect(await suggestions(s)).toHaveLength(ideas);
  });
});

describe("Make my plan", () => {
  it("refuses Viewers; a double tap makes one plan", async () => {
    const s = await aaravAtSummary();
    await expect(
      s.asPapa.mutation(api.plan.make, {
        eventId: s.eventId,
        belowMinimum: false,
      }),
    ).rejects.toThrow(/AccessDenied|notAllowed/);

    const [first, second] = await Promise.all([
      s.asMeera.mutation(api.plan.make, {
        eventId: s.eventId,
        belowMinimum: false,
      }),
      s.asAditi.mutation(api.plan.make, {
        eventId: s.eventId,
        belowMinimum: false,
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([
      "alreadyStarted",
      "started",
    ]);
    const runs = await s.t.run((ctx) =>
      ctx.db
        .query("runs")
        .withIndex("by_event_created", (q) => q.eq("eventId", s.eventId))
        .take(10),
    );
    expect(runs.filter((r) => r.source === "brief")).toHaveLength(1);

    const event = await until(
      s,
      () => s.t.run((ctx) => ctx.db.get("events", s.eventId)),
      (e) => e?.briefState === "planned",
    );
    expect(event!.budgetCheck?.band).toBe("comfortable");
    const runId = runs.find((r) => r.source === "brief")!._id;
    const progress = await s.asPapa.query(api.plan.progress, {
      eventId: s.eventId,
      runId,
    });
    expect(progress?.status).toBe("done");
    expect(progress?.steps.every((step) => step.done)).toBe(true);
    // Aarav's party: the hall, catering, decor, cake, entertainer, return gifts, photography.
    const lines = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line",
    );
    expect(lines.map((e) => e.fields.estimate?.amount)).toEqual([
      39600, 38000, 18000, 4000, 11000, 11000, 16000,
    ]);
  });

  it("plans the Ganesh utsav at its budget anyway: daily aarti is one Function with a range", async () => {
    const s = await ganeshAtSummary();
    await expect(
      s.asMeera.mutation(api.plan.make, {
        eventId: s.eventId,
        belowMinimum: false,
      }),
    ).rejects.toThrow(/below the usual minimum/);
    await s.asMeera.mutation(api.plan.make, {
      eventId: s.eventId,
      belowMinimum: true,
    });
    const event = await until(
      s,
      () => s.t.run((ctx) => ctx.db.get("events", s.eventId)),
      (e) => e?.briefState === "planned",
    );
    expect(event!.budgetCheck).toMatchObject({
      band: "belowMinimum",
      perHousehold: 1000,
    });
    const aarti = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("eventFunctions")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(20)
      ).filter((fn) => fn.key === "daily_aarti"),
    );
    expect(aarti).toHaveLength(1);
    expect(aarti[0]!.date).toEqual({
      kind: "range",
      from: "2027-09-04",
      to: "2027-09-13",
    });
    const lines = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line",
    );
    for (const line of lines) expect(line.fields.belowUsualRange).toBe(true);
    // 10 days of 100 Guests at the daily aarti.
    expect(
      lines.find((e) => e.fields.category === "prasad_daily_aarti")!.fields
        .quantity,
    ).toBe(1000);
    expect(budgetRollup(await budgetEntries(s), 240000).total).toBe(240000);
  });
});

describe("changing an essential after the plan", () => {
  async function plannedJaipur() {
    const s = await jaipurAtSummary();
    await planWith(s, jaipurWeddingDraft);
    // Meera sets the wedding's catering herself, so the change must keep it.
    const weddingCatering = (await budgetEntries(s)).find(
      (e) => e.functionKey === "wedding" && e.fields.category === "catering_main",
    )!;
    await s.asMeera.mutation(api.entries.update, {
      entryId: weddingCatering._id,
      patch: { kind: "budget", plannedAmount: 390000 },
    });
    return { s, weddingCateringId: weddingCatering._id };
  }

  it("diffEssentialChange for 300 to 400 Guests raises catering and the Venue, keeps the Member's line and flags Venue capacity", async () => {
    const { s, weddingCateringId } = await plannedJaipur();
    const snapshot = await s.t.query(internal.plan.essentialInput, {
      eventId: s.eventId,
      today: TODAY,
    });
    const before = await budgetEntries(s);
    const changes = diffEssentialChange(snapshot!, {
      field: "guests",
      functionKey: null,
      guests: 400,
    });

    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(changes[0]).toMatchObject({
      op: "changeEssential",
      table: "events",
      docId: s.eventId,
      expectedVersion: event!.version,
      values: { field: "guests", functionKey: null, guests: 400 },
    });
    expect(changes.length).toBeLessThanOrEqual(20);
    expect(changes.some((c) => c.docId === weddingCateringId)).toBe(false);

    const quantityOf = (key: string) => {
      const entry = before.find(
        (e) => e.functionKey === key && e.fields.category?.startsWith("catering_"),
      )!;
      const change = changes.find(
        (c) => c.op === "updateEntry" && c.docId === entry._id,
      );
      return change?.op === "updateEntry"
        ? (change.values.patch.fields as { quantity: number }).quantity
        : null;
    };
    // 20%, 40%, 75% and 100% of 400 Guests; the wedding's is Meera's own.
    expect(quantityOf("haldi")).toBe(80);
    expect(quantityOf("mehendi")).toBe(160);
    expect(quantityOf("sangeet")).toBe(300);
    expect(quantityOf("reception")).toBe(400);
    expect(quantityOf("wedding")).toBeNull();

    // The mehendi passes 150 Guests, so its small Venue becomes a large one.
    const smallVenue = before.find(
      (e) => e.functionKey === "mehendi" && e.fields.category === "venue_small",
    )!;
    expect(
      changes.some((c) => c.op === "deleteEntry" && c.docId === smallVenue._id),
    ).toBe(true);
    const largeVenue = changes.find(
      (c) =>
        c.op === "addEntry" &&
        c.values.kind === "budget" &&
        (c.values.fields as { category: string }).category === "venue_large",
    );
    expect(largeVenue).toBeDefined();
    const newVenue =
      largeVenue?.op === "addEntry"
        ? (largeVenue.values.fields as { estimate: { amount: number } })
        : null;
    expect(newVenue!.estimate.amount).toBeGreaterThan(
      smallVenue.fields.estimate!.amount,
    );

    // A Timeline Entry to recheck the Venues' capacity.
    expect(
      changes.some(
        (c) =>
          c.op === "addEntry" &&
          c.values.kind === "timeline" &&
          /Venue/.test((c.values.fields as { title: string }).title),
      ),
    ).toBe(true);
  });

  it("editField on a planned Event sends one Proposal and changes nothing until Accept", async () => {
    const { s } = await plannedJaipur();
    const before = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    const entriesBefore = await liveEntries(s);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "guests", functionKey: null, guests: 400 },
    });
    const open = await until(
      s,
      () =>
        s.t.run((ctx) =>
          ctx.db
            .query("proposals")
            .withIndex("by_event_status", (q) =>
              q.eq("eventId", s.eventId).eq("status", "open"),
            )
            .take(5),
        ),
      (rows) => rows.length > 0,
    );
    expect(open).toHaveLength(1);
    expect(open[0]!.origin).toEqual({ kind: "briefEdit" });
    expect(open[0]!.runId).toBeNull();
    expect(open[0]!.summary).toMatch(/Venue capacity/);
    const after = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(after!.brief).toEqual(before!.brief);
    expect(await liveEntries(s)).toEqual(entriesBefore);

    // Aditi changes the Tradition meanwhile: the Proposal is out of date.
    await s.asAditi.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "tradition", tradition: "Marwari" },
    });
    const result = await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: open[0]!._id,
    });
    expect(result).toMatchObject({ ok: false, reason: "outOfDate" });
    expect(await liveEntries(s)).toEqual(entriesBefore);
  });

  it("on Accept the Brief, the Functions and the plan's lines follow the new Guest count", async () => {
    const { s, weddingCateringId } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "guests", functionKey: null, guests: 400 },
    });
    const [proposal] = await until(
      s,
      () =>
        s.t.run((ctx) =>
          ctx.db
            .query("proposals")
            .withIndex("by_event_status", (q) =>
              q.eq("eventId", s.eventId).eq("status", "open"),
            )
            .take(5),
        ),
      (rows) => rows.length > 0,
    );
    const result = await s.asAditi.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    expect(result).toEqual({ ok: true });
    const brief = await summary(s);
    expect(brief!.guests).toBe(400);
    expect(brief!.functions.find((fn) => fn.key === "mehendi")!.guests).toBe(
      160,
    );
    const lines = await budgetEntries(s);
    expect(
      lines.find(
        (e) => e.functionKey === "reception" && e.fields.category === "catering_main",
      )!.fields.quantity,
    ).toBe(400);
    const kept = lines.find((e) => e._id === weddingCateringId)!;
    expect(kept.fields.quantity).toBe(300);
    expect(kept.fields.plannedAmount).toBe(390000);
  });
});
