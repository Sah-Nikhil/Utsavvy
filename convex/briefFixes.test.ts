/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hinglishWedding, puneGaneshUtsav } from "../lib/brief/examples";
import { api } from "./_generated/api";
import { runBudgetCheck } from "./brief";
import {
  type EstimateDeps,
  type ResearchInput,
  type ResearchOutput,
  stubEstimateDeps,
} from "./estimates";
import { STUB_MODEL, stubCallCount } from "./lib/models";
import { assistantInsert, assistantWrite, memberInsert } from "./lib/write";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

// The previewed Budget check fixes (X12, #69) end to end on the stub model,
// with the Budget check priced by `stubEstimateDeps`: research finds nothing,
// so every line comes from the reference table, as in first-brief.md's
// worked examples.

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

async function setUp(eventType: "wedding" | "community") {
  const t = newTest();
  agentTest.register(t);
  const asMeera = t.withIdentity(identityFor("Meera"));
  const eventId = await asMeera.mutation(api.events.create, {
    name: "Test Event",
    eventType,
  });
  await t.run(async (ctx) => {
    await seedMembership(ctx, { clerkId: "Papa", role: "viewer", eventId });
  });
  return {
    t,
    eventId,
    asMeera,
    asPapa: t.withIdentity(identityFor("Papa")),
  };
}
type S = Awaited<ReturnType<typeof setUp>>;

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

function actionCtx(t: T): Parameters<typeof runBudgetCheck>[0] {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  return {
    runQuery: t.query as Call,
    runMutation: t.mutation as Call,
    runAction: t.action as Call,
  } as unknown as Parameters<typeof runBudgetCheck>[0];
}

/** Settles the Brief, then prices it again with `stubEstimateDeps`. */
async function checked(s: S) {
  await untilChecked(s);
  await runBudgetCheck(actionCtx(s.t), s.eventId, stubEstimateDeps);
  return (await summary(s))!;
}

async function jaipurAt15L() {
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
  return { s, brief: await checked(s) };
}

async function puneAt240k() {
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
  return { s, brief: await checked(s) };
}

describe("the ₹15L Jaipur wedding's fixes", () => {
  it("previews skipping the reception at about ₹14.2L, which fits, and 200 Guests, still short", async () => {
    const { brief } = await jaipurAt15L();
    expect(brief.budgetCheck!.flag).toBe(
      "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short.",
    );
    expect(brief.budgetCheck!.raiseLabel).toBe("about ₹19.6L");
    expect(
      brief.fixes.map(({ label, preview }) => ({ label, preview })),
    ).toEqual([
      {
        label: "Plan for 200 Guests instead of 300",
        preview: expect.stringMatching(
          /^New minimum about ₹15\.\d+L, still about ₹[\d,]+ short\.$/,
        ),
      },
      {
        label: "Skip the reception",
        preview: "New minimum about ₹14.2L, which fits.",
      },
    ]);
    expect(brief.fixes[0]!.detail).toBe(
      "Haldi 40, Mehendi 80, Sangeet 150, Wedding 200, Reception 200, 100 invitation cards",
    );
  });

  it("previews without a model call", async () => {
    const { s } = await jaipurAt15L();
    const calls = stubCallCount();
    const brief = await summary(s);
    expect(brief!.fixes).toHaveLength(2);
    expect(stubCallCount()).toBe(calls);
  });

  it("skipping the reception lands on the previewed minimum and clears the flag", async () => {
    const { s, brief } = await jaipurAt15L();
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });
    const after = await checked(s);
    expect(after.functions.map((f) => f.key)).toEqual([
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
    ]);
    expect(after.assumptions.some((a) => a.field.includes("reception"))).toBe(
      false,
    );
    expect(after.budgetCheck!.minimum).toBe(skip.minimum);
    expect(after.budgetCheck!.band).not.toBe("belowMinimum");
    expect(after.fixes).toEqual([]);
  });

  it("200 Guests lands on the previewed minimum", async () => {
    const { s, brief } = await jaipurAt15L();
    const fewer = brief.fixes.find((f) => f.kind === "fewerGuests")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: fewer.change,
    });
    const after = await checked(s);
    expect(after.guests).toBe(200);
    expect(
      Object.fromEntries(after.functions.map((f) => [f.key, f.guests])),
    ).toEqual({
      haldi: 40,
      mehendi: 80,
      sangeet: 150,
      wedding: 200,
      reception: 200,
    });
    expect(after.budgetCheck!.minimum).toBe(fewer.minimum);
    expect(after.budgetCheck!.band).toBe("belowMinimum");
  });
});

describe("the Pune Ganesh utsav's fixes", () => {
  it("previews skipping the cultural night at about ₹1.90L, which fits, and 250 Guests, still short", async () => {
    const { brief } = await puneAt240k();
    expect(
      brief.fixes.map(({ label, preview }) => ({ label, preview })),
    ).toEqual([
      {
        label: "Plan for 250 Guests instead of 400",
        preview: expect.stringMatching(
          /^New minimum about ₹2\.\d+L, still about ₹[\d,]+ short\.$/,
        ),
      },
      {
        label: "Skip the cultural night",
        preview: "New minimum about ₹1.90L, which fits.",
      },
    ]);
  });

  it("skipping the cultural night lands on the previewed minimum", async () => {
    const { s, brief } = await puneAt240k();
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });
    const after = await checked(s);
    expect(after.functions.map((f) => f.key)).toEqual([
      "sthapana",
      "daily_aarti",
      "visarjan",
    ]);
    expect(after.budgetCheck!.minimum).toBe(skip.minimum);
  });

  it("250 Guests lands on the previewed minimum", async () => {
    const { s, brief } = await puneAt240k();
    const fewer = brief.fixes.find((f) => f.kind === "fewerGuests")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: fewer.change,
    });
    const after = await checked(s);
    expect(after.budgetCheck!.minimum).toBe(fewer.minimum);
  });
});

describe("skipping a Function", () => {
  it("never skips the wedding itself", async () => {
    const { s } = await jaipurAt15L();
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "dropFunction", functionKey: "wedding" },
      }),
    ).rejects.toThrow(/BadAnswer/);
  });

  it("never skips a Ganesh utsav's rituals", async () => {
    const { s } = await puneAt240k();
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "dropFunction", functionKey: "visarjan" },
      }),
    ).rejects.toThrow(/BadAnswer/);
  });

  it("is a Member's edit: a Viewer can't", async () => {
    const { s } = await jaipurAt15L();
    await expect(
      s.asPapa.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "dropFunction", functionKey: "reception" },
      }),
    ).rejects.toThrow();
  });

  it("is refused once the plan exists, and no fixes are offered then", async () => {
    const { s } = await jaipurAt15L();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { briefState: "planned" }),
    );
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "dropFunction", functionKey: "reception" },
      }),
    ).rejects.toThrow(/AfterThePlan/);
    expect((await summary(s))!.fixes).toEqual([]);
  });
});

describe("review of PR 121", () => {
  it("M2: a preview with table-priced lines says 'should' when the check researched prices", async () => {
    const { s } = await jaipurAt15L();
    // Research finds the main-dinner plate price; every other line stays on
    // the table, and so do the lines a preview adds.
    const research = vi.fn(
      async (input: ResearchInput): Promise<ResearchOutput | null> => {
        const line = input.lines[0]!;
        if (line.category !== "catering_main") return null;
        const url = "https://example-caterer.in/menus";
        return {
          model: "claude-sonnet-5-5",
          searchResultUrls: [url],
          searchesUsed: 1,
          usage: [],
          results: [
            {
              key: line.key,
              unitLow: 1000,
              unitHigh: 2000,
              sourceUrls: [url],
              reasoning: "Jaipur banquet menus list ₹1,000 to ₹2,000 a plate.",
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
    const brief = (await summary(s))!;
    expect(brief.fixes.map((f) => f.preview)).toEqual([
      "New minimum about ₹15.1L, which should leave about ₹9,000 short.",
      "New minimum about ₹14.2L, which should fit.",
    ]);
  });

  it("N3: a Viewer gets no fixes", async () => {
    const { s } = await jaipurAt15L();
    const brief = await s.asPapa.query(api.brief.summary, {
      eventId: s.eventId,
      today: TODAY,
    });
    expect(brief!.budgetCheck!.band).toBe("belowMinimum");
    expect(brief!.fixes).toEqual([]);
  });

  it("L3: skipping writes a 'Skipped the reception' history row by the Member", async () => {
    const { s, brief } = await jaipurAt15L();
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", s.eventId))
        .collect(),
    );
    const row = rows.find(
      (c) => c.table === "eventFunctions" && c.op === "delete",
    );
    expect(row).toMatchObject({
      groupLabel: "Skipped the reception",
      actor: { kind: "member" },
      before: { key: "reception", name: "Reception" },
      after: null,
    });
  });

  it("L4: Items tagged to the skipped Function become Event-wide", async () => {
    const { s, brief } = await jaipurAt15L();
    const ids = await s.t.run(async (ctx) => {
      const section = await ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .first();
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .first();
      const note = (functionKey: string | null) =>
        ctx.db.insert("items", {
          eventId: s.eventId,
          sectionId: section!._id,
          position: { x: 0, y: 0 },
          size: null,
          functionKey,
          createdBy: { kind: "member", membershipId: membership!._id },
          version: 1,
          deletedAt: null,
          kind: "note",
          data: { text: "Mehendi favours", citations: [] },
        });
      return {
        reception: await note("reception"),
        mehendi: await note("mehendi"),
      };
    });
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });
    const [reception, mehendi] = await s.t.run((ctx) =>
      Promise.all([
        ctx.db.get("items", ids.reception),
        ctx.db.get("items", ids.mehendi),
      ]),
    );
    expect(reception).toMatchObject({ functionKey: null, version: 2 });
    expect(mehendi).toMatchObject({ functionKey: "mehendi", version: 1 });
  });

  it("L1: an 'Other' wedding keeps the Functions Utsavvy doesn't know", async () => {
    const { s } = await jaipurAt15L();
    await s.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect();
      const keep = ["mehendi", "wedding", "reception"];
      const rename: Record<string, string> = {
        wedding: "shaadi_ceremony",
        reception: "dinner_party",
      };
      for (const row of rows) {
        if (!keep.includes(row.key))
          await ctx.db.delete("eventFunctions", row._id);
        else if (rename[row.key])
          await ctx.db.patch("eventFunctions", row._id, {
            key: rename[row.key]!,
            name: rename[row.key]!,
          });
      }
    });
    await expect(
      s.asMeera.mutation(api.brief.editField, {
        eventId: s.eventId,
        change: { field: "dropFunction", functionKey: "shaadi_ceremony" },
      }),
    ).rejects.toThrow(/BadAnswer/);
  });
});

describe("Undo all after a skipped Function (X11 with X12)", () => {
  it("neither crashes nor brings the Function back, and Restore of the skip refuses", async () => {
    const { s, brief } = await jaipurAt15L();
    // An Assistant reply before the skip that edited the reception and added a
    // Note tagged to it.
    const { runId, noteId } = await s.t.run(async (ctx) => {
      const meera = (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .collect()
      ).find((m) => m.role === "owner")!;
      const section = await ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .first();
      const reception = await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect()
        .then((rows) => rows.find((r) => r.key === "reception")!);
      const runId = await ctx.db.insert("runs", {
        eventId: s.eventId,
        requestedBy: meera._id,
        source: "chat",
        messageId: null,
        commentId: null,
        status: "done",
        stoppedBy: null,
        model: STUB_MODEL,
        createdAt: 0,
        startedAt: 0,
        endedAt: 1,
      });
      const options = {
        runId,
        forMembershipId: meera._id,
        groupLabel: "Plan the reception",
      };
      await assistantWrite(ctx, {
        table: "eventFunctions",
        id: reception._id,
        expectedVersion: reception.version,
        patch: { guests: 200 },
        toolCallId: "toolu_01#1",
        ...options,
      });
      const { id: noteId } = await assistantInsert(ctx, {
        table: "items",
        value: {
          eventId: s.eventId,
          sectionId: section!._id,
          position: { x: 0, y: 0 },
          size: null,
          functionKey: "reception",
          createdBy: {
            kind: "assistant",
            forMembershipId: meera._id,
            runId,
            proposalId: null,
            acceptedBy: null,
          },
          kind: "note",
          data: { text: "Reception favours", citations: [] },
        },
        toolCallId: "toolu_01#2",
        ...options,
      });
      return { runId, noteId };
    });

    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(skip.change).toEqual({
      field: "dropFunction",
      functionKey: "reception",
    });
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });

    const result = await s.asMeera.mutation(api.history.undoGroup, {
      groupKey: runId,
    });
    expect(result.undone).toBe(0);
    expect(result.total).toBe(2);
    expect(result.message).toMatch(/has since edited/);

    const { functions, note, skipRow } = await s.t.run(async (ctx) => ({
      functions: await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect(),
      note: await ctx.db.get("items", noteId),
      skipRow: (
        await ctx.db
          .query("changes")
          .withIndex("by_event_at", (q) => q.eq("eventId", s.eventId))
          .collect()
      ).find((c) => c.table === "eventFunctions" && c.op === "delete")!,
    }));
    expect(functions.map((f) => f.key)).not.toContain("reception");
    expect(note).toMatchObject({ functionKey: null, deletedAt: null });

    // The skip itself has no group, so no Undo all; its Restore refuses.
    expect(skipRow.groupKey).toBeNull();
    await expect(
      s.asMeera.mutation(api.history.restore, { changeId: skipRow._id }),
    ).rejects.toThrow(/gone/);
  });

  /** Meera's Note tagged to the reception, in the Event's first Section. */
  async function receptionNote(s: S) {
    return await s.t.run(async (ctx) => {
      const meera = (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
          .collect()
      ).find((m) => m.role === "owner")!;
      const section = await ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .first();
      const actor = { kind: "member" as const, membershipId: meera._id };
      const { id: noteId } = await memberInsert(ctx, {
        table: "items",
        actor,
        value: {
          eventId: s.eventId,
          sectionId: section!._id,
          position: { x: 0, y: 0 },
          size: null,
          functionKey: "reception",
          createdBy: actor,
          kind: "note",
          data: { text: "Reception favours", citations: [] },
        },
      });
      return { meera, noteId };
    });
  }

  it("Restore of an Item the skip made Event-wide refuses, rather than tagging it to the skipped Function (review L3)", async () => {
    const { s, brief } = await jaipurAt15L();
    const { noteId } = await receptionNote(s);
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });
    const skipItemRow = await s.t.run(
      async (ctx) =>
        (await ctx.db
          .query("changes")
          .withIndex("by_doc", (q) => q.eq("docId", noteId))
          .order("desc")
          .first())!,
    );
    expect(skipItemRow.groupLabel).toBe("Skipped the reception");

    await expect(
      s.asMeera.mutation(api.history.restore, { changeId: skipItemRow._id }),
    ).rejects.toThrow(/functionGone/);
    const note = await s.t.run((ctx) => ctx.db.get("items", noteId));
    expect(note).toMatchObject({ functionKey: null, deletedAt: null });
  });

  it("Undo all of a reply that moved an Item off a since-skipped Function leaves it Event-wide (review L3)", async () => {
    const { s, brief } = await jaipurAt15L();
    const { meera, noteId } = await receptionNote(s);
    const runId = await s.t.run(async (ctx) => {
      const runId = await ctx.db.insert("runs", {
        eventId: s.eventId,
        requestedBy: meera._id,
        source: "chat",
        messageId: null,
        commentId: null,
        status: "done",
        stoppedBy: null,
        model: STUB_MODEL,
        createdAt: 0,
        startedAt: 0,
        endedAt: 1,
      });
      await assistantWrite(ctx, {
        table: "items",
        id: noteId,
        expectedVersion: 1,
        patch: { functionKey: "mehendi" },
        runId,
        toolCallId: "toolu_01#1",
        forMembershipId: meera._id,
        groupLabel: "Move the favours",
      });
      return runId;
    });
    const skip = brief.fixes.find((f) => f.kind === "fewerFunctions")!;
    expect(skip.change).toEqual({
      field: "dropFunction",
      functionKey: "reception",
    });
    await s.asMeera.mutation(api.brief.editField, {
      eventId: s.eventId,
      change: skip.change,
    });

    const result = await s.asMeera.mutation(api.history.undoGroup, {
      groupKey: runId,
    });
    expect(result.message).toBe("Undid 1 of 1");
    const note = await s.t.run((ctx) => ctx.db.get("items", noteId));
    expect(note).toMatchObject({ functionKey: null, deletedAt: null });
  });
});
