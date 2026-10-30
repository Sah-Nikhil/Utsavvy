/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetRollup, entryAmount } from "../components/items/budget/rollup";
import { formatINR } from "../lib/format";
import {
  aaravBirthday,
  jaipurWedding,
  puneGaneshUtsav,
} from "../lib/brief/examples";
import type { FirstPlanDraft } from "../lib/types";
import { getFunctionName, type FunctionReference } from "convex/server";
import { cityRepriceNoticeId } from "../lib/chat/notices";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  estimateLines,
  stubEstimateDeps,
  type KnowledgeInput,
} from "./estimates";
import { knowledgeBasis } from "../lib/pricing/basis";
import { addDays } from "../lib/brief/dates";
import {
  languageModel,
  STUB_FALLBACK_MODEL,
  STUB_MODEL,
  type ModelV4,
} from "./lib/models";
import { istDay } from "./lib/time";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";
import {
  aaravBirthdayDraft,
  applyPlan,
  describeEssentialChange,
  diffEssentialChange,
  draftWithModel,
  jaipurWeddingDraft,
  mentionsAmount,
  planLinesOf,
  pricePlanDraft,
  puneGaneshUtsavDraft,
  runCityReprice,
  runEssentialProposal,
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

/** System notices posted in the Event's Chat. */
/**
 * Changes the reception catering's range stored with a city Proposal, so a
 * test can tell the stored prices from a fresh lookup.
 */
async function markStoredPrice(
  s: S,
  proposalId: Id<"proposals">,
  text: string,
): Promise<void> {
  await s.t.run(async (ctx) => {
    const row = await ctx.db
      .query("toolCalls")
      .withIndex("by_key", (q) => q.eq("key", `${proposalId}:city:prices`))
      .unique();
    type Price = {
      id: Id<"entries">;
      range: { basis: { text: string } } | null;
    };
    const result = row!.result as { prices: Price[] };
    const lines = await ctx.db
      .query("entries")
      .withIndex("by_event_kind", (q) =>
        q.eq("eventId", s.eventId).eq("kind", "budget"),
      )
      .take(200);
    const reception = lines.find(
      (e) =>
        e.kind === "budget" &&
        e.functionKey === "reception" &&
        e.fields.category === "catering_main",
    )!;
    const prices = result.prices.map((p) =>
      p.id === reception._id && p.range
        ? { ...p, range: { ...p.range, basis: { ...p.range.basis, text } } }
        : p,
    );
    await ctx.db.patch("toolCalls", row!._id, {
      result: { ...result, prices },
    });
  });
}

async function notices(s: S): Promise<number> {
  return (
    await s.t.run((ctx) =>
      ctx.db
        .query("chatAnnotations")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .take(100),
    )
  ).filter((a) => a.card?.kind === "system").length;
}

/** A model that never answers until its call is aborted, like a stalled provider. */
function stalledModel(modelId: string): ModelV4 {
  const hang = (options: { abortSignal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      options.abortSignal?.addEventListener("abort", () =>
        reject(options.abortSignal!.reason),
      );
    });
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId,
    supportedUrls: {},
    doGenerate: hang,
    doStream: hang,
  } as unknown as ModelV4;
}

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

  it("rejects the same category twice in one Function", () => {
    const twice = jaipurDraft();
    const lines = twice.functions[0]!.budgetEntries;
    lines.push({ ...lines[0]! });
    expect(check(twice).join(" ")).toMatch(/catering_light.*twice/);
  });

  it("tells a plain count from a rupee amount", () => {
    expect(mentionsAmount("Light 1,001 diyas at the gate")).toBe(false);
    expect(mentionsAmount("A 5k run for the society")).toBe(false);
    expect(mentionsAmount("Keep ₹2,40,000 aside")).toBe(true);
    expect(mentionsAmount("about 2,40,000 for the pandal")).toBe(true);
    expect(mentionsAmount("Rs 500 a head")).toBe(true);
    expect(mentionsAmount("a 1 crore wedding")).toBe(true);
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
      (e) =>
        e.functionKey === "haldi" && e.fields.category === "catering_light",
    )!;
    expect(haldiCatering.fields.quantity).toBe(60);
    expect(haldiCatering.assumed).toContain("quantity");
    const weddingCatering = lines.find(
      (e) =>
        e.functionKey === "wedding" && e.fields.category === "catering_main",
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
    for (const venue of venues)
      expect(view.bookBy[venue._id]).toBe("2026-10-28");

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
    expect(due("book_caterer")).toMatchObject({
      date: "2026-10-28",
      late: true,
    });
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
      runSheet
        .filter((e) => e.functionKey === "wedding")
        .map((e) => e.fields.time),
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

describe("a plan run that can't finish", () => {
  it("hands the Brief back to its summary when the draft fails, so Make my plan works again", async () => {
    const s = await aaravAtSummary();
    const runId = await startRun(s);
    await runPlan(
      actionCtx(s.t),
      { eventId: s.eventId, runId },
      {
        draft: async () => {
          throw new Error("no model could answer");
        },
        estimate: stubEstimateDeps,
        today: TODAY,
      },
    );
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.briefState).toBe("summary");
    const run = await s.t.run((ctx) => ctx.db.get("runs", runId));
    expect(run!.status).toBe("failed");
    expect(await liveEntries(s)).toEqual([]);
  });
});

describe("a stopped plan whose action never ends", () => {
  it("is ended by the watchdog, which hands the Brief back", async () => {
    const s = await aaravAtSummary();
    const runId = await startRun(s);
    // S5's reaper ended the Stop; the action died before it noticed.
    await s.t.run((ctx) =>
      ctx.db.patch("runs", runId, { status: "stopped", endedAt: Date.now() }),
    );
    await s.t.mutation(internal.plan.watchdog, { eventId: s.eventId, runId });
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.briefState).toBe("summary");
  });
});

describe("the plan run's contracts", () => {
  it("waits in S5's queue behind a running Chat reply, then runs alone", async () => {
    const s = await aaravAtSummary();
    const chatRun = await s.t.run((ctx) =>
      ctx.db.insert("runs", {
        eventId: s.eventId,
        requestedBy: s.member,
        source: "chat",
        messageId: null,
        commentId: null,
        status: "running",
        stoppedBy: null,
        model: "",
        createdAt: Date.now(),
        startedAt: Date.now(),
        endedAt: null,
      }),
    );
    const made = await s.asMeera.mutation(api.plan.make, {
      eventId: s.eventId,
      belowMinimum: false,
    });
    expect(made.status).toBe("started");
    await s.t.finishInProgressScheduledFunctions();
    const running = (
      await s.t.run((ctx) =>
        ctx.db
          .query("runs")
          .withIndex("by_event_status", (q) =>
            q.eq("eventId", s.eventId).eq("status", "running"),
          )
          .take(10),
      )
    ).map((r) => r.source);
    expect(running).toEqual(["chat"]);
    const planRun = await s.t.run((ctx) => ctx.db.get("runs", made.runId!));
    expect(planRun!.status).toBe("queued");

    await s.t.mutation(internal.runs.finish, {
      runId: chatRun,
      outcome: "done",
    });
    const event = await until(
      s,
      () => s.t.run((ctx) => ctx.db.get("events", s.eventId)),
      (e) => e?.briefState === "planned",
    );
    expect(event!.briefState).toBe("planned");
  });

  it("stops writing when the Member who asked loses access, and says so", async () => {
    const s = await jaipurAtSummary();
    const runId = await startRun(s);
    const run = await s.t.run((ctx) => ctx.db.get("runs", runId));
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", run!.requestedBy, {
        status: "removed",
        endedAt: Date.now(),
      }),
    );
    const before = await notices(s);
    await runPlan(
      actionCtx(s.t),
      { eventId: s.eventId, runId },
      {
        draft: async (input) => ({
          draft: toFirstPlanDraft(jaipurWeddingDraft, input.functions),
          model: STUB_MODEL,
        }),
        estimate: stubEstimateDeps,
        today: TODAY,
      },
    );
    expect(await liveEntries(s)).toEqual([]);
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.briefState).toBe("summary");
    expect((await s.t.run((ctx) => ctx.db.get("runs", runId)))!.status).toBe(
      "failed",
    );
    expect(await notices(s)).toBe(before + 1);
  });

  it("falls back to the next model when the first one stalls", async () => {
    const s = await jaipurAtSummary();
    const runId = await startRun(s);
    const input = await s.t.query(internal.plan.planInput, {
      eventId: s.eventId,
      runId,
    });
    const source = { DEFAULT_MODEL: STUB_FALLBACK_MODEL };
    const { model } = await draftWithModel(input!, {
      source,
      modelFor: (id) =>
        id === "stub-claude" ? stalledModel(id) : languageModel(id, source),
      timeoutMs: 300,
    });
    expect(model).toBe("stub-gemini");
  });

  it("records handing the Brief back in the history, and a partial plan gets its own Budget check", async () => {
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
    // The Budget lands, then the run fails before the rest.
    await s.t.run((ctx) =>
      applyPlan(ctx, s.eventId, priced, ["functions", "budget"]),
    );
    await s.t.mutation(internal.plan.end, {
      eventId: s.eventId,
      runId,
      outcome: "failed",
      reason: null,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(event!.briefState).toBe("planned");
    expect(event!.budgetCheck?.minimum).toBe(priced.budgetCheck.minimum);
    const history = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", s.eventId))
        .take(100),
    );
    expect(
      history.some(
        (row) =>
          row.actor.kind === "assistant" &&
          (row.before as { briefState?: string } | null)?.briefState ===
            "planning" &&
          (row.after as { briefState?: string } | null)?.briefState ===
            "planned",
      ),
    ).toBe(true);
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
      (e) =>
        e.functionKey === "wedding" && e.fields.category === "catering_main",
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
        (e) =>
          e.functionKey === key && e.fields.category?.startsWith("catering_"),
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
        (e) =>
          e.functionKey === "reception" &&
          e.fields.category === "catering_main",
      )!.fields.quantity,
    ).toBe(400);
    const kept = lines.find((e) => e._id === weddingCateringId)!;
    expect(kept.fields.quantity).toBe(300);
    expect(kept.fields.plannedAmount).toBe(390000);
  });
  async function acceptNext(s: S) {
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
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId: proposal!._id,
      }),
    ).toEqual({ ok: true });
  }

  const venuesDeadline = async (s: S) =>
    (await timelineEntries(s)).find((e) => e.fields.leadKey === "book_venues")!
      .fields;

  it("moves the deadlines with each accepted date change, lateness included", async () => {
    const { s } = await plannedJaipur();
    const today = istDay(Date.now());
    // A year later: the Venues are no longer late.
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "date", date: { kind: "day", value: "2027-12-15" } },
    });
    await acceptNext(s);
    expect(await venuesDeadline(s)).toMatchObject({
      date: "2026-12-13",
      late: false,
      note: null,
    });
    // And back to February: late again, pulled to this week.
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "date", date: { kind: "month", value: "2027-02" } },
    });
    await acceptNext(s);
    const venues = await venuesDeadline(s);
    expect(venues).toMatchObject({
      date: addDays(today, 7),
      late: true,
      priority: "P1",
    });
    expect(venues.note).toMatch(/this week/);
  });

  it("re-points the Vendor checklist at a Venue line that swapped to the large row", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "guests", functionKey: null, guests: 400 },
    });
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const entries = await liveEntries(s);
    const largeVenue = entries.find(
      (e) =>
        e.kind === "budget" &&
        e.functionKey === "mehendi" &&
        e.fields.category === "venue_large",
    )!;
    const venueCheck = entries.find(
      (e) =>
        e.kind === "checklist" &&
        e.fields.vendorCategory === "venue" &&
        e.fields.functionKeys.includes("mehendi"),
    );
    expect(
      venueCheck?.kind === "checklist" && venueCheck.fields.budgetEntryIds,
    ).toEqual([largeVenue._id]);
  });

  it("refuses a bad value after the plan, and any essential edit while it is being made", async () => {
    const { s } = await plannedJaipur();
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "guests", functionKey: null, guests: 0 },
      }),
    ).rejects.toThrow(/whole number of Guests/);
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { briefState: "planning" }),
    );
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "guests", functionKey: null, guests: 400 },
      }),
    ).rejects.toThrow(/Wait for the plan to finish/);
  });

  const rollupOf = async (s: S) => {
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    return {
      event: event!,
      rollup: budgetRollup(await budgetEntries(s), event!.budgetTotal),
    };
  };
  const linesTotal = (r: ReturnType<typeof budgetRollup>) =>
    r.total - r.contingency - r.unallocated;

  it("a lower budget re-prices the lines to fit, with a 10% Contingency", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2200000 },
    });
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const { event, rollup } = await rollupOf(s);
    expect(event.budgetTotal).toBe(2200000);
    expect(rollup.total).toBe(2200000);
    expect(rollup.overBy).toBe(0);
    expect(
      Math.abs(rollup.contingency - 0.1 * linesTotal(rollup)),
    ).toBeLessThanOrEqual(5000);
  });

  it("a budget above the high end puts the rest in Unallocated", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 5000000 },
    });
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const { event, rollup } = await rollupOf(s);
    expect(rollup.total).toBe(5000000);
    expect(rollup.unallocated).toBeGreaterThan(0);
    expect(
      Math.abs(rollup.contingency - 0.1 * linesTotal(rollup)),
    ).toBeLessThanOrEqual(5000);
    expect(event.budgetCheck?.band).toBe("aboveHigh");
  });

  it("says when the change leaves the Budget over", async () => {
    const { s } = await plannedJaipur();
    const state = await s.t.query(internal.plan.essentialInput, {
      eventId: s.eventId,
      today: TODAY,
    });
    // Meera's own ₹3,90,000 catering line alone is over a ₹3L budget.
    const budget = { field: "budget" as const, budget: 300000 };
    expect(
      describeEssentialChange(
        state!,
        budget,
        diffEssentialChange(state!, budget),
      ),
    ).toMatch(/over the ₹3L budget by/);
    const guests = {
      field: "guests" as const,
      functionKey: null,
      guests: 400,
    };
    expect(
      describeEssentialChange(
        state!,
        guests,
        diffEssentialChange(state!, guests),
      ),
    ).toMatch(/over the ₹25L budget by/);
  });

  it("invitations follow the Guests while they are still assumed", async () => {
    const { s } = await plannedJaipur();
    const state = await s.t.query(internal.plan.essentialInput, {
      eventId: s.eventId,
      today: TODAY,
    });
    const invitations = state!.lines.find(
      (l: { fields: { category: string | null } }) =>
        l.fields.category === "invitations",
    )!;
    const change = diffEssentialChange(state!, {
      field: "guests",
      functionKey: null,
      guests: 400,
    }).find((c) => c.docId === invitations.id);
    expect(
      change?.op === "updateEntry" &&
        (change.values.patch.fields as { quantity: number }).quantity,
    ).toBe(200);
  });

  it("a city change re-prices the Estimates for the new city on Accept", async () => {
    const { s, weddingCateringId } = await plannedJaipur();
    const before = await budgetEntries(s);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
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
    expect(proposal!.summary).toMatch(/re-priced for Mumbai/);
    await acceptNext(s);
    const receptionText = async () =>
      (await budgetEntries(s)).find(
        (e) =>
          e.functionKey === "reception" &&
          e.fields.category === "catering_main",
      )!.fields.estimate!.basis.text;
    await until(s, receptionText, (text) => /X tier/.test(text));
    await s.t.finishAllScheduledFunctions(() => {});
    const after = await budgetEntries(s);
    const reception = after.find(
      (e) =>
        e.functionKey === "reception" && e.fields.category === "catering_main",
    )!;
    expect(reception.fields.estimate!.basis.text).toBe(
      "Utsavvy reference table, X tier, Oct 2026",
    );
    expect(reception.fields.estimate!.basis.unitLow).toBe(1250);
    // Meera's own line stays as she set it, Estimate and all.
    expect(after.find((e) => e._id === weddingCateringId)!.fields).toEqual(
      before.find((e) => e._id === weddingCateringId)!.fields,
    );
    const { event, rollup } = await rollupOf(s);
    expect(event.city?.tier).toBe("X");
    expect(rollup.total).toBe(2500000);
    expect(event.budgetCheck!.minimum).toBeGreaterThan(1962400 * 1.2);
  });

  it("says so in the Chat when pricing the change fails", async () => {
    const { s } = await plannedJaipur();
    const owner = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner"),
    );
    const before = await notices(s);
    await runEssentialProposal(
      actionCtx(s.t),
      {
        eventId: s.eventId,
        change: { field: "guests", functionKey: null, guests: 400 },
        requestedBy: owner!._id,
      },
      {
        now: () => {
          throw new Error("the cascade is down");
        },
      },
    );
    expect(await notices(s)).toBe(before + 1);
  });

  const openProposal = async (s: S) =>
    (
      await until(
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
      )
    )[0]!;

  // Issue #102, review of #114 L2: the card warns before Accept, with the
  // same minimum the Budget check shows after it.
  it("warns on the card when a lower budget falls below the usual minimum", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 1500000 },
    });
    const proposal = await openProposal(s);
    expect(proposal.summary).toMatch(
      /the ₹15L budget would be below the usual minimum of ₹19,62,400 for Jaipur/,
    );
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck).toMatchObject({
      band: "belowMinimum",
      minimum: 1962400,
    });
  });

  it("doesn't warn when the lower budget still covers the minimum", async () => {
    const { s } = await plannedJaipur();
    const state = await s.t.query(internal.plan.essentialInput, {
      eventId: s.eventId,
      today: TODAY,
    });
    const budget = { field: "budget" as const, budget: 2200000 };
    expect(
      describeEssentialChange(
        state!,
        budget,
        diffEssentialChange(state!, budget),
      ),
    ).not.toMatch(/usual minimum/);
  });

  it("warns on the card when a ₹20L plan moves to Mumbai, below its usual minimum", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2000000 },
    });
    expect((await openProposal(s)).summary).not.toMatch(/usual minimum/);
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});

    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    const proposal = await openProposal(s);
    expect(proposal.summary).toMatch(
      /the ₹20L budget would be below the usual minimum of ₹23,70,500 for Mumbai/,
    );
    await acceptNext(s);
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.budgetCheck?.minimum === 2370500,
    );
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck?.band).toBe("belowMinimum");
  });

  // Issue #102: the Budget Item kept the note the first plan wrote, so after a
  // move to Mumbai it still said "is below the typical" beside a "Below the
  // usual minimum" badge. The note follows every new Budget check.
  const budgetNote = (s: S) =>
    s.t.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "budget"),
        )
        .take(5);
      const item = items.find((i) => i.deletedAt === null);
      return item?.kind === "budget" ? item.data.note : null;
    });

  it("rewrites the Budget note when a budget Proposal changes the band", async () => {
    const { s } = await plannedJaipur();
    const first = await budgetNote(s);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2000000 },
    });
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    const check = event.budgetCheck!;
    const note = await budgetNote(s);
    expect(note).not.toBe(first);
    expect(check.band).toBe("tight");
    expect(note).toMatch(
      /^₹20L is below the typical ₹[\d.]+L for this plan, so Estimates sit near the low end\./,
    );
  });

  /** An open setBudgetTotal Proposal, as the Assistant would make it for the Owner. */
  const setBudgetTotalProposal = (s: S, budgetTotal: number) =>
    s.t.run(async (ctx) => {
      const owner = (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner")!;
      const event = (await ctx.db.get("events", s.eventId))!;
      return await ctx.db.insert("proposals", {
        eventId: s.eventId,
        runId: null,
        requestedBy: owner._id,
        origin: { kind: "chat" },
        summary: `Budget total to ${budgetTotal}`,
        changes: [
          {
            op: "setBudgetTotal",
            table: "events",
            docId: s.eventId,
            expectedVersion: event.version,
            guards: [],
            values: { budgetTotal },
          },
        ],
        status: "open",
        decidedBy: null,
        decidedAt: null,
        replacedBy: null,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });

  /** The Budget check and note as the plan's current state gives them. */
  const derived = async (s: S) => {
    await s.t.mutation(internal.plan.recheckBudget, {
      eventId: s.eventId,
      relink: null,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    return { check: event.budgetCheck, note: await budgetNote(s) };
  };

  const amountsOf = async (s: S) =>
    new Map(
      (await budgetEntries(s)).map((e) => [e._id, entryAmount(e.fields)]),
    );

  // Review of #130, H2: IMPLEMENTATION_PLAN.md section 3.5 says a budget
  // change "re-runs the same arithmetic over the stored ranges", so a new
  // total re-prices the lines as an accepted budget change does.
  it("an accepted setBudgetTotal Proposal re-prices the lines over their stored ranges, and the roll-up meets the new total", async () => {
    const { s, weddingCateringId } = await plannedJaipur();
    const before = await amountsOf(s);
    const proposalId = await setBudgetTotalProposal(s, 10_000_000);
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toEqual({ ok: true });
    await s.t.finishAllScheduledFunctions(() => {});

    const { event, rollup } = await rollupOf(s);
    expect(event.budgetTotal).toBe(10_000_000);
    expect(rollup.total).toBe(10_000_000);
    expect(event.budgetCheck?.band).toBe("aboveHigh");
    // Every line the Assistant priced moved to its high end; Meera's own stayed.
    const lines = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line",
    );
    for (const line of lines) {
      if (line._id === weddingCateringId) {
        // Kept below its own high end, so the note can't say every Estimate sits there.
        expect(entryAmount(line.fields)).toBe(390000);
        expect(390000).toBeLessThan(line.fields.estimate!.high);
        continue;
      }
      if (line.fields.estimate === null) continue;
      // At the top of its range, a rounding step below its high at most.
      expect(line.fields.estimate.amount).toBeLessThanOrEqual(
        line.fields.estimate.high,
      );
      expect(line.fields.estimate.amount).toBeGreaterThan(
        (line.fields.estimate.low + line.fields.estimate.high) / 2,
      );
      expect(entryAmount(line.fields)).toBeGreaterThanOrEqual(
        before.get(line._id)!,
      );
    }
    const unallocated = (await budgetEntries(s)).find(
      (e) => e.fields.role === "unallocated",
    )!;
    expect(entryAmount(unallocated.fields)).toBe(rollup.unallocated);
    expect(rollup.unallocated).toBeGreaterThan(0);
    expect(event.budgetCheck?.unallocated).toBe(rollup.unallocated);
    expect(await budgetNote(s)).toMatch(
      new RegExp(
        `^₹100L is above the high end of ₹[\\d.]+L for this plan, so there's room for every Estimate at its high end and ${formatINR(rollup.unallocated).replace(/[.]/g, "\\.")} is Unallocated\\.`,
      ),
    );

    // A second Accept changes nothing more.
    const after = await amountsOf(s);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    expect(await amountsOf(s)).toEqual(after);
  });

  it("an out-of-date setBudgetTotal Proposal changes neither the total nor the lines", async () => {
    const { s } = await plannedJaipur();
    const proposalId = await setBudgetTotalProposal(s, 10_000_000);
    await s.asAditi.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "tradition", tradition: "Marwari" },
    });
    const before = await amountsOf(s);
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toMatchObject({ ok: false, reason: "outOfDate" });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetTotal).toBe(2500000);
    expect(await amountsOf(s)).toEqual(before);
  });

  // Review of #130, H1: the check and the note are derived from the plan, so
  // an Undo all or a Restore that moves what they rest on recomputes both.
  it("Undo all of an accepted setBudgetTotal puts the check and note back with the total", async () => {
    const { s } = await plannedJaipur();
    const baseline = await derived(s);
    const totalBefore = (await rollupOf(s)).rollup.total;
    // Comfortable for this plan, so the re-price adds no Unallocated row.
    const proposalId = await setBudgetTotalProposal(s, 3_500_000);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    expect((await rollupOf(s)).event.budgetCheck?.band).toBe("comfortable");

    expect(
      await s.asMeera.mutation(api.history.undoGroup, {
        groupKey: proposalId,
      }),
    ).toMatchObject({ message: "Undid 28 of 28" });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event, rollup } = await rollupOf(s);
    expect(event.budgetTotal).toBe(2500000);
    expect(rollup.total).toBe(totalBefore);
    expect(event.budgetCheck).toEqual(baseline.check);
    expect(await budgetNote(s)).toBe(baseline.note);
  });

  it("Restoring the Budget note on its own leaves it as the check says", async () => {
    const { s } = await plannedJaipur();
    const baseline = await derived(s);
    const noteChange = await s.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", s.eventId))
        .take(500);
      return rows.find(
        (c) =>
          c.table === "items" &&
          (c.after as { kind?: string }).kind === "budget" &&
          (c.before as { data?: { note: string | null } } | null)?.data
            ?.note === null &&
          (c.after as { data: { note: string | null } }).data.note !== null,
      )!;
    });
    await s.asMeera.mutation(api.history.restore, {
      changeId: noteChange._id,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    expect(await budgetNote(s)).toBe(baseline.note);
    expect((await rollupOf(s)).event.budgetCheck).toEqual(baseline.check);
  });

  it("Undo all of an accepted city change puts the check and note back with the old prices", async () => {
    const { s } = await plannedJaipur();
    const baseline = await derived(s);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    const proposal = await openProposal(s);
    await acceptNext(s);
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.city?.tier === "X",
    );
    await s.t.finishAllScheduledFunctions(() => {});
    expect((await rollupOf(s)).event.budgetCheck).not.toEqual(baseline.check);

    await s.asMeera.mutation(api.history.undoGroup, {
      groupKey: proposal._id,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.city?.name).toBe("Jaipur");
    expect(event.budgetCheck).toEqual(baseline.check);
    expect(await budgetNote(s)).toBe(baseline.note);
  });

  // Review of #130, M: with no line priced from a range there is no band.
  it("a plan with no lines left has no band, and its note says so for the current total", async () => {
    const { s } = await plannedJaipur();
    await s.t.run(async (ctx) => {
      for (const e of await ctx.db
        .query("entries")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "budget"),
        )
        .take(200))
        await ctx.db.patch("entries", e._id, { deletedAt: Date.now() });
    });
    const proposalId = await setBudgetTotalProposal(s, 3_000_000);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck).toBeNull();
    expect(await budgetNote(s)).toBe(
      "There are no budget lines yet, so ₹30L isn't checked against typical prices.",
    );
  });

  it("a plan whose lines all lack an Estimate has no band, and its note counts them for the current total", async () => {
    const { s, weddingCateringId } = await plannedJaipur();
    const lineCount = await s.t.run(async (ctx) => {
      let n = 0;
      for (const e of await ctx.db
        .query("entries")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "budget"),
        )
        .take(200)) {
        if (e.kind !== "budget" || e.deletedAt !== null) continue;
        if (e.fields.role !== "line") {
          await ctx.db.patch("entries", e._id, { deletedAt: Date.now() });
          continue;
        }
        if (e._id === weddingCateringId) {
          await ctx.db.patch("entries", e._id, { deletedAt: Date.now() });
          continue;
        }
        await ctx.db.patch("entries", e._id, {
          fields: { ...e.fields, estimate: null, plannedAmount: null },
        });
        n++;
      }
      return n;
    });
    expect(lineCount).toBeGreaterThan(1);
    const proposalId = await setBudgetTotalProposal(s, 3_000_000);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck).toBeNull();
    expect(await budgetNote(s)).toBe(
      `${lineCount} lines have no Estimate yet and count as zero, so ₹30L isn't checked against typical prices.`,
    );
  });

  // Review of #130, round 2, M1: an Entry edit moves the check and the note too.
  const receptionCatering = async (s: S) =>
    (await budgetEntries(s)).find(
      (e) =>
        e.functionKey === "reception" && e.fields.category === "catering_main",
    )!;

  it("a Member's quantity edit on a budget line recomputes the check's thresholds and the catering share", async () => {
    const { s } = await plannedJaipur();
    const baseline = await derived(s);
    const line = await receptionCatering(s);
    await s.asMeera.mutation(api.entries.update, {
      entryId: line._id,
      patch: { kind: "budget", quantity: line.fields.quantity * 3 },
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck!.minimum).toBeGreaterThan(baseline.check!.minimum);
    expect(event.budgetCheck!.typical).toBeGreaterThan(baseline.check!.typical);
    const note = await budgetNote(s);
    expect(note).not.toBe(baseline.note);
    expect(note).toMatch(/Catering is about \d+% of the budget/);
    expect(note?.match(/Catering is about (\d+)%/)?.[1]).not.toBe(
      baseline.note?.match(/Catering is about (\d+)%/)?.[1],
    );
  });

  it("an accepted updateEntry Proposal on a budget line recomputes the check and the note", async () => {
    const { s } = await plannedJaipur();
    const baseline = await derived(s);
    const line = await receptionCatering(s);
    const proposalId = await s.t.run(async (ctx) => {
      const owner = (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner")!;
      return await ctx.db.insert("proposals", {
        eventId: s.eventId,
        runId: null,
        requestedBy: owner._id,
        origin: { kind: "chat" },
        summary: "Reception for more Guests",
        changes: [
          {
            op: "updateEntry",
            table: "entries",
            docId: line._id,
            expectedVersion: line.version,
            guards: [],
            values: {
              patch: { fields: { quantity: line.fields.quantity * 3 } },
            },
          },
        ],
        status: "open",
        decidedBy: null,
        decidedAt: null,
        replacedBy: null,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });
    });
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toEqual({ ok: true });
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck!.minimum).toBeGreaterThan(baseline.check!.minimum);
    expect(await budgetNote(s)).not.toBe(baseline.note);
  });

  // Review of #130, round 2, M2: the basis counts only lines with a range.
  it("counts only priced lines in the check's basis when some lines have no Estimate", async () => {
    const { s } = await plannedJaipur();
    const lines = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line" && e.fields.estimate !== null,
    );
    const unpriced = lines.slice(0, 2);
    await s.t.run(async (ctx) => {
      for (const e of unpriced)
        await ctx.db.patch("entries", e._id, {
          fields: { ...e.fields, estimate: null },
        });
    });
    const { check, note } = await derived(s);
    const priced = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line" && e.fields.estimate !== null,
    ).length;
    expect(check!.basis).toEqual({ researched: 0, lines: priced });
    expect(note).toMatch(/2 lines have no Estimate yet and count as zero\./);
  });

  // Review of #130, round 3: one recheck per Accept, never a second plain one.
  const rechecks = (s: S) =>
    s.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter(
          (f) =>
            /^plan(\.js)?:recheckBudget$/.test(f.name) &&
            f.state.kind !== "canceled",
        )
        .map((f) => (f.args[0] as { relink: unknown }).relink),
    );

  it("an accepted setBudgetTotal schedules the Budget recheck once", async () => {
    const { s } = await plannedJaipur();
    await s.t.finishAllScheduledFunctions(() => {});
    const before = (await rechecks(s)).length;
    const proposalId = await setBudgetTotalProposal(s, 3_500_000);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    expect((await rechecks(s)).slice(before)).toEqual([null]);
  });

  it("an accepted essential budget change schedules one recheck, the one that relinks the checklist", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2_200_000 },
    });
    const proposal = await openProposal(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const before = (await rechecks(s)).length;
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal._id,
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const after = (await rechecks(s)).slice(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ proposalId: proposal._id });
  });

  it("an accepted city change schedules one recheck, and its new prices recompute in place", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    const proposal = await openProposal(s);
    await s.t.finishAllScheduledFunctions(() => {});
    const before = (await rechecks(s)).length;
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal._id,
    });
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.city?.tier === "X",
    );
    await s.t.finishAllScheduledFunctions(() => {});
    const after = (await rechecks(s)).slice(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ proposalId: proposal._id });
  });

  // Issue #133: a free-label line follows a city change like any other line.
  it("a city change re-estimates a free-label line for the new city from its label alone", async () => {
    const { s } = await plannedJaipur();
    const jaipurRange = { unit: "per_event", unitLow: 20000, unitHigh: 30000 };
    const lineId = await s.t.run(async (ctx) => {
      const item = (
        await ctx.db
          .query("items")
          .withIndex("by_event_kind", (q) =>
            q.eq("eventId", s.eventId).eq("kind", "budget"),
          )
          .take(5)
      ).find((i) => i.deletedAt === null)!;
      const owner = (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner")!;
      return await ctx.db.insert("entries", {
        eventId: s.eventId,
        itemId: item._id,
        order: 999,
        functionKey: null,
        kind: "budget",
        fields: {
          label: "Mehndi cones",
          category: null,
          quantity: 1,
          unit: "per_event",
          estimate: {
            low: 20000,
            high: 30000,
            amount: 20000,
            label: "Estimate",
            basis: knowledgeBasis({ ...jaipurRange, reasoning: "Jaipur" }),
          },
          plannedAmount: null,
          role: "line",
          belowUsualRange: false,
          editedByMember: false,
        },
        assumed: [],
        createdBy: {
          kind: "assistant",
          forMembershipId: owner._id,
          runId: null,
          proposalId: null,
          acceptedBy: null,
        },
        version: 1,
        deletedAt: null,
      });
    });
    const owner = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner"),
    );
    const asked: KnowledgeInput[] = [];
    await runEssentialProposal(
      actionCtx(s.t),
      {
        eventId: s.eventId,
        change: { field: "city", city: "Mumbai" },
        requestedBy: owner!._id,
      },
      {
        claudeReachable: () => false,
        knowledge: async (input) => {
          asked.push(input);
          return {
            model: "stub",
            results: input.lines.map((l) => ({
              key: l.key,
              unitLow: 45000,
              unitHigh: 60000,
              reasoning: "Mumbai prices",
            })),
          };
        },
      },
    );
    await acceptNext(s);
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.city?.tier === "X",
    );
    await s.t.finishAllScheduledFunctions(() => {});

    const line = (await budgetEntries(s)).find((e) => e._id === lineId)!;
    expect(line.fields.estimate!.basis).toMatchObject({
      kind: "assistantKnowledge",
      unitLow: 45000,
      unitHigh: 60000,
    });
    expect(line.fields.estimate!.amount).toBeGreaterThanOrEqual(45000);
    expect(line.fields.estimate!.amount).toBeLessThanOrEqual(60000);

    // The estimate asked about the label, the city and the Event type only.
    const prompt = JSON.stringify(asked);
    expect(prompt).toContain("Mehndi cones");
    expect(prompt).toContain("Mumbai");
    const names = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(20)
      ).map((m) => m.displayName),
    );
    for (const name of names) expect(prompt).not.toContain(name);

    // The Budget check counts it as priced, at its Mumbai range.
    const { event } = await rollupOf(s);
    const priced = (await budgetEntries(s)).filter(
      (e) => e.fields.role === "line" && e.fields.estimate !== null,
    ).length;
    expect(event.budgetCheck!.basis!.lines).toBe(priced);
  });

  it("rewrites the Budget note to match the badge after a ₹20L plan moves to Mumbai", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2000000 },
    });
    await acceptNext(s);
    await s.t.finishAllScheduledFunctions(() => {});
    expect(await budgetNote(s)).toMatch(/is below the typical/);

    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    await acceptNext(s);
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.budgetCheck?.minimum === 2370500,
    );
    await s.t.finishAllScheduledFunctions(() => {});
    const { event } = await rollupOf(s);
    expect(event.budgetCheck?.band).toBe("belowMinimum");
    const note = await budgetNote(s);
    expect(note).not.toMatch(/typical/);
    expect(note).toMatch(
      /^A plan like this in Mumbai usually starts at about ₹23\.7L\. You're about ₹3\.7L short\./,
    );
  });

  // Issue #102, review of #114 L5: the city Accept doesn't depend on the lines.
  it("a city Proposal stays good when a budget line is touched before Accept", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    const proposal = await openProposal(s);
    const invitations = (await budgetEntries(s)).find(
      (e) => e.fields.category === "invitations",
    )!;
    await s.asAditi.mutation(api.entries.update, {
      entryId: invitations._id,
      patch: { kind: "budget", quantity: 160 },
    });
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId: proposal._id,
      }),
    ).toEqual({ ok: true });
    await until(
      s,
      () => rollupOf(s),
      ({ event }) => event.city?.tier === "X",
    );
    await s.t.finishAllScheduledFunctions(() => {});
    const { rollup } = await rollupOf(s);
    expect(rollup.total).toBe(2500000);
  });

  it("a budget Proposal still goes out of date when a line it re-prices is touched", async () => {
    const { s } = await plannedJaipur();
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "budget", budget: 2200000 },
    });
    const proposal = await openProposal(s);
    const invitations = (await budgetEntries(s)).find(
      (e) => e.fields.category === "invitations",
    )!;
    await s.asAditi.mutation(api.entries.update, {
      entryId: invitations._id,
      patch: { kind: "budget", quantity: 160 },
    });
    expect(
      await s.asMeera.mutation(api.proposals.accept, {
        eventId: s.eventId,
        proposalId: proposal._id,
      }),
    ).toMatchObject({ ok: false, reason: "outOfDate" });
  });

  // Review of #118, M1: the card's prices are the ones Accept writes, from one lookup.
  it("a city change looks prices up once, and Accept writes the ones stored with the Proposal", async () => {
    const { s } = await plannedJaipur();
    const owner = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(10)
      ).find((m) => m.role === "owner"),
    );
    let lookups = 0;
    await runEssentialProposal(
      actionCtx(s.t),
      {
        eventId: s.eventId,
        change: { field: "city", city: "Mumbai" },
        requestedBy: owner!._id,
      },
      {
        now: () => {
          lookups++;
          return Date.now();
        },
      },
    );
    expect(lookups).toBe(1);
    const proposal = await openProposal(s);
    // What a fresh lookup at Accept would no longer give.
    await markStoredPrice(s, proposal._id, "Stored when the card was made");
    await acceptNext(s);
    const reception = async () =>
      (await budgetEntries(s)).find(
        (e) =>
          e.functionKey === "reception" &&
          e.fields.category === "catering_main",
      )!.fields.estimate!.basis.text;
    await until(s, reception, (text) => /Stored|X tier/.test(text));
    await s.t.finishAllScheduledFunctions(() => {});
    expect(await reception()).toBe("Stored when the card was made");
  });
});

// Issue #102, review of #114 L3: a failed city re-price can be tried again
// from its notice. Fake timers hold the scheduled steps so the test can stand
// in for the one that fails: the write after the prices fails.
describe("trying a failed city re-price again", () => {
  const scheduled = (s: S) =>
    s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const pendingReprices = async (s: S) =>
    (await scheduled(s)).filter(
      (f) => f.name.includes("repriceCity") && f.state.kind === "pending",
    );
  // Runs the steps due now, not the 24-hour expiry each Proposal schedules.
  const settle = async (s: S) => {
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(10);
      await s.t.finishInProgressScheduledFunctions();
    }
  };
  const openProposals = (s: S) =>
    s.t.run((ctx) =>
      ctx.db
        .query("proposals")
        .withIndex("by_event_status", (q) =>
          q.eq("eventId", s.eventId).eq("status", "open"),
        )
        .take(5),
    );
  /** An action context whose write of the new city's prices fails. */
  const failingWrite = (t: T): Parameters<typeof runCityReprice>[0] => {
    const base = actionCtx(t);
    const target = getFunctionName(internal.plan.applyCityPrices);
    return {
      ...base,
      runMutation: ((ref: FunctionReference<"mutation", "internal">, args) =>
        getFunctionName(ref) === target
          ? Promise.reject(new Error("the write failed"))
          : base.runMutation(ref, args)) as typeof base.runMutation,
    };
  };
  const receptionBasis = async (s: S) =>
    (await budgetEntries(s)).find(
      (e) =>
        e.functionKey === "reception" && e.fields.category === "catering_main",
    )!.fields.estimate!.basis.text;

  /** A planned Jaipur wedding moved to Mumbai at the asker's request, accepted by Meera, whose re-price failed. */
  async function failedReprice(asker: "asMeera" | "asAditi") {
    const s = await jaipurAtSummary();
    await planWith(s, jaipurWeddingDraft);
    vi.useFakeTimers();
    await s[asker].mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    await settle(s);
    const [proposal] = await openProposals(s);
    await s.asMeera.mutation(api.proposals.accept, {
      eventId: s.eventId,
      proposalId: proposal!._id,
    });
    const [step] = await pendingReprices(s);
    const args = step!.args[0] as Parameters<typeof runCityReprice>[1];
    await s.t.run((ctx) => ctx.scheduler.cancel(step!._id));
    await settle(s);
    await runCityReprice(failingWrite(s.t), args);
    return { s, proposalId: proposal!._id };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts a notice with Try again for the Proposal, which re-prices once and only for Members", async () => {
    const { s, proposalId } = await failedReprice("asMeera");
    const notice = (
      await s.t.run((ctx) =>
        ctx.db
          .query("chatAnnotations")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .take(100),
      )
    ).findLast((a) => a.card?.kind === "system");
    expect(notice!.card).toEqual({
      kind: "system",
      id: cityRepriceNoticeId(proposalId),
    });
    expect(await receptionBasis(s)).toMatch(/Y tier/);
    const status = (as: typeof s.asAditi) =>
      as.query(api.plan.cityRepriceStatus, {
        eventId: s.eventId,
        proposalId,
      });
    expect(await status(s.asAditi)).toEqual({
      city: "Mumbai",
      state: "failed",
      canRetry: true,
    });
    expect(await status(s.asPapa)).toMatchObject({ canRetry: false });

    // A Viewer can't; a Member can, and a double tap schedules one step.
    await expect(
      s.asPapa.mutation(api.plan.retryCityReprice, {
        eventId: s.eventId,
        proposalId,
      }),
    ).rejects.toThrow();
    expect(
      await s.asAditi.mutation(api.plan.retryCityReprice, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toEqual({ ok: true });
    await s.asAditi.mutation(api.plan.retryCityReprice, {
      eventId: s.eventId,
      proposalId,
    });
    expect(await pendingReprices(s)).toHaveLength(1);
    expect(await status(s.asAditi)).toMatchObject({ state: "retrying" });
    await settle(s);
    expect(await receptionBasis(s)).toBe(
      "Utsavvy reference table, X tier, Oct 2026",
    );
    const event = await s.t.run((ctx) => ctx.db.get("events", s.eventId));
    expect(budgetRollup(await budgetEntries(s), event!.budgetTotal).total).toBe(
      2500000,
    );

    // Once it has landed there is nothing to try again.
    expect(
      await s.asAditi.mutation(api.plan.retryCityReprice, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toMatchObject({ ok: false });
    expect(await pendingReprices(s)).toHaveLength(0);
    expect(await status(s.asAditi)).toMatchObject({ state: "landed" });
  });

  // Review of #118, M1: Try again applies the prices the card was made from.
  it("Try again applies the prices stored with the Proposal, without a new lookup", async () => {
    const { s, proposalId } = await failedReprice("asMeera");
    await markStoredPrice(s, proposalId, "Stored when the card was made");
    await s.asMeera.mutation(api.plan.retryCityReprice, {
      eventId: s.eventId,
      proposalId,
    });
    await settle(s);
    expect(await receptionBasis(s)).toBe("Stored when the card was made");
  });

  // Review of #118, L2: the same rule as Accept: the asker must still be able to ask.
  it("refuses Try again once the Member who asked has left", async () => {
    const { s, proposalId } = await failedReprice("asAditi");
    await s.t.run((ctx) =>
      ctx.db.patch("memberships", s.member, { status: "removed" }),
    );
    const result = await s.asMeera.mutation(api.plan.retryCityReprice, {
      eventId: s.eventId,
      proposalId,
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toMatch(/asked for this/);
    expect(await pendingReprices(s)).toHaveLength(0);
    expect(
      await s.asMeera.query(api.plan.cityRepriceStatus, {
        eventId: s.eventId,
        proposalId,
      }),
    ).toMatchObject({ state: "failed", canRetry: false });
    expect(await receptionBasis(s)).toMatch(/Y tier/);
  });

  it("refuses a Proposal that isn't an accepted city change", async () => {
    const s = await jaipurAtSummary();
    await planWith(s, jaipurWeddingDraft);
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: { field: "city", city: "Mumbai" },
    });
    const [proposal] = await until(
      s,
      () => openProposals(s),
      (rows) => rows.length > 0,
    );
    expect(
      await s.asMeera.mutation(api.plan.retryCityReprice, {
        eventId: s.eventId,
        proposalId: proposal!._id,
      }),
    ).toMatchObject({ ok: false });
    expect(await pendingReprices(s)).toHaveLength(0);
  });

  // Review of #118, nit: a notice ID that isn't a Proposal gives no status, not an error.
  it("gives no status for an ID that isn't one of the Event's Proposals", async () => {
    const s = await setUp("wedding");
    expect(
      await s.asMeera.query(api.plan.cityRepriceStatus, {
        eventId: s.eventId,
        proposalId: "nudge:not-a-proposal",
      }),
    ).toBeNull();
  });
});
