/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaipurWedding } from "../lib/brief/examples";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUB_MODEL, stubCallCount } from "./lib/models";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

// A Member who types the first Brief into the main Chat box, instead of the
// opening card's box, gets the same Brief flow (S11's submit path); once the
// Event has a Brief, Chat messages ask Utsavvy as before.

/** The day the client passes to `summary`. */
const TODAY = "2026-10-24";

beforeEach(() => {
  vi.stubEnv("DEFAULT_MODEL", STUB_MODEL);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEOAPIFY_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const asMeera = t.withIdentity(identityFor("Meera"));
  const eventId = await asMeera.mutation(api.events.create, {
    name: "Meera weds Rohan",
    eventType: "wedding",
  });
  await t.run(async (ctx) => {
    await seedMembership(ctx, { clerkId: "Aditi", eventId });
    await seedMembership(ctx, { clerkId: "Papa", role: "viewer", eventId });
  });
  return {
    t,
    eventId,
    asMeera,
    asAditi: t.withIdentity(identityFor("Aditi")),
    asPapa: t.withIdentity(identityFor("Papa")),
  };
}

type S = Awaited<ReturnType<typeof setUp>>;

function send(
  as: S["asMeera"],
  s: S,
  text: string,
  extra: {
    dontReply?: boolean;
    pointing?: { kind: "item"; itemId: Id<"items"> }[];
  } = {},
) {
  return as.mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: extra.dontReply ?? false,
    pointing: extra.pointing ?? [],
  });
}

const summary = (s: S) =>
  s.asMeera.query(api.brief.summary, { eventId: s.eventId, today: TODAY });

/** Waits until the Brief asks `question`, with the scheduled work settled. */
async function untilQuestion(s: S, question: string) {
  for (let i = 0; i < 100; i++) {
    const brief = await summary(s);
    if (brief?.pendingQuestion === question) {
      await s.t.finishInProgressScheduledFunctions();
      return brief;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The Brief never asked "${question}"`);
}

const runsOf = (s: S) =>
  s.t.run((ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_event_status", (q) => q.eq("eventId", s.eventId))
      .collect(),
  );

async function memberLines(s: S) {
  const details = await s.asMeera.query(api.chat.details, {
    eventId: s.eventId,
  });
  return details!.annotations.filter((a) => a.authorMembershipId !== null);
}

describe("a first Brief typed into the Chat box", () => {
  it("starts the Brief flow with one model call, and no Assistant run", async () => {
    const s = await setUp();
    const calls = stubCallCount();
    const result = await send(s.asMeera, s, jaipurWedding.text);
    expect(result).toMatchObject({ runId: null, brief: "started" });

    const brief = await untilQuestion(s, "tradition");
    expect(brief?.extraction).toEqual(jaipurWedding.extraction);
    expect(stubCallCount() - calls).toBe(1);
    expect(await runsOf(s)).toEqual([]);
    expect(await memberLines(s)).toHaveLength(1);
  });

  it("asks Utsavvy as before once the Event has a Brief", async () => {
    const s = await setUp();
    await s.asMeera.mutation(api.brief.submitText, {
      eventId: s.eventId,
      text: jaipurWedding.text,
    });
    await untilQuestion(s, "tradition");
    const result = await send(s.asMeera, s, "Plan the sangeet");
    expect(result.runId).not.toBeNull();
    expect(result.brief).toBeNull();
  });

  it("never takes a Don't-reply message as the Brief", async () => {
    const s = await setUp();
    const calls = stubCallCount();
    const result = await send(s.asMeera, s, jaipurWedding.text, {
      dontReply: true,
    });
    expect(result).toMatchObject({ runId: null, brief: null });
    await s.t.finishInProgressScheduledFunctions();
    expect((await summary(s))?.pendingQuestion).toBe("text");
    expect(stubCallCount()).toBe(calls);
    expect(await runsOf(s)).toEqual([]);
  });

  it("gives one Brief when two Members send at once", async () => {
    const s = await setUp();
    const calls = stubCallCount();
    const [first, second] = await Promise.all([
      send(s.asMeera, s, jaipurWedding.text),
      send(s.asAditi, s, "Something else entirely"),
    ]);
    expect([first.brief, second.brief].sort()).toEqual([
      "alreadyGiven",
      "started",
    ]);
    await untilQuestion(s, "tradition");
    expect(stubCallCount() - calls).toBe(1);
    expect(await memberLines(s)).toHaveLength(1);
    expect(await runsOf(s)).toEqual([]);
  });

  it("answers a message pointing at the Canvas as a question, not as the Brief", async () => {
    const s = await setUp();
    const itemId = await s.t.run(async (ctx) => {
      const item = await ctx.db
        .query("items")
        .filter((q) => q.eq(q.field("eventId"), s.eventId))
        .first();
      return item!._id;
    });
    const result = await send(s.asMeera, s, "What goes in here?", {
      pointing: [{ kind: "item", itemId }],
    });
    expect(result.runId).not.toBeNull();
    expect(result.brief).toBeNull();
    expect((await summary(s))?.pendingQuestion).toBe("text");
  });

  it("can't be given by a Viewer", async () => {
    const s = await setUp();
    await expect(send(s.asPapa, s, jaipurWedding.text)).rejects.toThrow();
    expect((await summary(s))?.pendingQuestion).toBe("text");
  });
});
