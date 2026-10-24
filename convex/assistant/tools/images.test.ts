/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../../../lib/types/brief";
import { findLibraryPhoto, queryWords } from "../../../lib/inspirations/library";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { createStartingSections } from "../../canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "../../lib/test.helpers";
import type { ToolResult } from "./core";
import { imageTools, parseStripCard, updateThemeOp } from "./images";

// S13 seams (issue #46): the Assistant's image tools, called the way the Agent
// calls them (the run's context injected), and the updateTheme Proposal op.

const T0 = Date.UTC(2026, 9, 25, 6, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const JAIPUR: Theme = {
  palette: ["#C2185B", "#F4A300", "#F8C8DC"],
  styleWords: ["royal Rajputana"],
  decorKeywords: ["marigold", "pastel pink drapes", "brass urli"],
};

async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    tradition: "North Indian Hindu",
    theme: JAIPUR,
  });
  const meera = await seedMembership(ctx, { clerkId: "Meera", eventId });
  await ctx.db.patch("memberships", meera.membershipId, {
    displayName: "Meera",
  });
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId: meera.membershipId,
  });
  for (const [order, key] of ["haldi", "mehendi"].entries()) {
    await ctx.db.insert("eventFunctions", {
      eventId,
      key,
      name: key[0]!.toUpperCase() + key.slice(1),
      date: null,
      guests: null,
      assumed: [],
      order,
      version: 1,
    });
  }
  const itemId = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.inspirations,
    kind: "inspiration",
    position: { x: 0, y: 0 },
    size: { w: 300, h: 360 },
    functionKey: null,
    data: {
      source: {
        kind: "pexels",
        pexelsId: 31002035,
        localPath: "/inspirations/wedding-north-indian-hindu/31002035.webp",
        photographer: "Naresh Babu",
        photographerUrl: "https://www.pexels.com/@naresh99/",
        pageUrl: "https://www.pexels.com/photo/31002035/",
        alt: "Marigold-filled urli",
        tags: ["haldi", "urli"],
      },
      addedBy: meera.membershipId,
      memberNote: null,
      seen: null,
    },
    createdBy: { kind: "member", membershipId: meera.membershipId },
    version: 1,
    deletedAt: null,
  });
  return { eventId, meera: meera.membershipId, sections, itemId };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const w = await t.run(seedWedding);
  return { t, ...w, asMeera: t.withIdentity(identityFor("Meera")) };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

/** Meera asks in the Chat; her run starts as the scheduler would start it. */
async function ask(
  s: Setup,
  text: string,
  source: "chat" | "nudge" | "brief" = "chat",
): Promise<Id<"runs">> {
  const { runId } = await s.asMeera.mutation(api.chat.send, {
    eventId: s.eventId,
    text,
    dontReply: false,
    pointing: [],
  });
  await s.t.run((ctx) =>
    ctx.db.patch("runs", runId!, { status: "running", startedAt: T0, source }),
  );
  return runId!;
}

async function call(
  s: Setup,
  runId: Id<"runs">,
  name: keyof typeof imageTools,
  input: unknown,
  toolCallId = "toolu_01",
): Promise<ToolResult> {
  type Call = (ref: unknown, args: unknown) => Promise<unknown>;
  const ctx = {
    runQuery: s.t.query as Call,
    runMutation: s.t.mutation as Call,
    runAction: s.t.action as Call,
    runId,
    eventId: s.eventId,
    forMembershipId: s.meera,
  };
  const tool = { ...imageTools[name], ctx } as unknown as {
    execute: (input: unknown, options: unknown) => Promise<ToolResult>;
  };
  return await tool.execute(input, { toolCallId, messages: [] });
}

const strips = (s: Setup) =>
  s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("chatAnnotations")
        .withIndex("by_event", (q) => q.eq("eventId", s.eventId))
        .collect()
    ).filter((a) => a.card?.kind === "stockStrip"),
  );
const eventOf = (s: Setup) =>
  s.t.run(async (ctx) => (await ctx.db.get("events", s.eventId))!);

// ---------------------------------------------------------------------------

describe("searchStockImages", () => {
  it("shows up to 6 matching photos as a strip, every one matching, tagged with the Function the request names", async () => {
    const s = await setUp();
    const runId = await ask(s, "find some haldi decor ideas");
    const result = await call(s, runId, "searchStockImages", {
      query: "haldi decor",
    });
    expect(result).toMatchObject({ ok: true, found: 6, functionKey: "haldi" });
    const [strip] = await strips(s);
    const card = parseStripCard(strip!.card!.id);
    expect(card?.pexelsIds).toHaveLength(6);
    expect(card?.functionKey).toBe("haldi");
    for (const id of card!.pexelsIds) {
      const photo = findLibraryPhoto(id)!;
      const words = photo.tags.flatMap((t) => t.split(" "));
      expect(queryWords("haldi decor").some((w) => words.includes(w))).toBe(
        true,
      );
    }
  });

  it("with no match, says the library has nothing for it and offers an upload, with no strip", async () => {
    const s = await setUp();
    const runId = await ask(s, "show me Durga puja pandal ideas");
    const result = await call(s, runId, "searchStockImages", {
      query: "halloween pumpkin",
    });
    expect(result).toMatchObject({ ok: true, found: 0 });
    expect(String(result.message)).toContain(
      "I don't have stock photos for that yet. You can upload your own.",
    );
    expect(await strips(s)).toEqual([]);
  });

  it("names no Function when the request names none", async () => {
    const s = await setUp();
    const runId = await ask(s, "find some decor");
    const result = await call(s, runId, "searchStockImages", {
      query: "haldi",
    });
    expect(result).toMatchObject({ ok: true, functionKey: null });
  });

  it("posts one strip for a repeated tool call", async () => {
    const s = await setUp();
    const runId = await ask(s, "find some haldi decor ideas");
    await call(s, runId, "searchStockImages", { query: "haldi" });
    await call(s, runId, "searchStockImages", { query: "haldi" });
    expect(await strips(s)).toHaveLength(1);
  });
});

describe("updateTheme", () => {
  const teal = {
    addPalette: ["#1F6F78"],
    removePalette: [],
    addStyleWords: ["lantern-lit"],
    addDecorKeywords: [],
    expectedVersion: 1,
  };

  it("with no Member request, is refused with a message telling the model to use propose", async () => {
    const s = await setUp();
    const runId = await ask(s, "Nudge: a new Inspiration", "nudge");
    const result = await call(s, runId, "updateTheme", teal);
    expect(result).toMatchObject({ ok: false, reason: "notAsked" });
    expect(String((result as { message: string }).message)).toContain(
      "propose",
    );
    expect((await eventOf(s)).theme).toEqual(JAIPUR);
  });

  it("is refused in a Chat run whose message didn't ask about the Theme", async () => {
    const s = await setUp();
    const runId = await ask(s, "find some haldi decor ideas");
    const result = await call(s, runId, "updateTheme", teal);
    expect(result).toMatchObject({ ok: false, reason: "notAsked" });
    expect((await eventOf(s)).theme).toEqual(JAIPUR);
  });

  it("applies at once when a Member asked for it", async () => {
    const s = await setUp();
    const runId = await ask(s, "Add teal to our Theme");
    const result = await call(s, runId, "updateTheme", teal);
    expect(result).toMatchObject({ ok: true });
    const event = await eventOf(s);
    expect(event.theme.palette).toEqual([...JAIPUR.palette, "#1F6F78"]);
    expect(event.theme.styleWords).toEqual(["royal Rajputana", "lantern-lit"]);
    expect(event.version).toBe(2);
  });

  it("refuses a colour that isn't a hex colour", async () => {
    const s = await setUp();
    const runId = await ask(s, "Add teal to the Theme");
    const result = await call(s, runId, "updateTheme", {
      ...teal,
      addPalette: ["teal"],
    });
    expect(result).toMatchObject({ ok: false });
    expect((await eventOf(s)).theme).toEqual(JAIPUR);
  });
});

describe("the updateTheme Proposal op", () => {
  async function proposal(s: Setup) {
    return await s.t.run((ctx) =>
      ctx.db.insert("proposals", {
        eventId: s.eventId,
        runId: null,
        requestedBy: s.meera,
        origin: { kind: "chat" },
        summary: "Add teal to the Theme",
        changes: [],
        status: "open",
        decidedBy: null,
        decidedAt: null,
        replacedBy: null,
        expiresAt: T0 + 1,
        createdAt: T0,
      }),
    );
  }
  const change = (s: Setup, expectedVersion: number) => ({
    op: "updateTheme" as const,
    table: "events" as const,
    docId: s.eventId,
    expectedVersion,
    guards: [],
    values: {
      addPalette: ["#1F6F78"],
      removePalette: [],
      addStyleWords: [],
      addDecorKeywords: ["brass lanterns"],
      fromInspiration: null,
    },
  });

  it("refuses a stale Event version", async () => {
    const s = await setUp();
    await s.t.run((ctx) => ctx.db.patch("events", s.eventId, { version: 3 }));
    const refusal = await s.t.run((ctx) =>
      updateThemeOp.validate(ctx, change(s, 1)),
    );
    expect(refusal).toMatch(/changed/);
  });

  it("with the current version, applies the ThemeUpdate through assistantWrite", async () => {
    const s = await setUp();
    const proposalId = await proposal(s);
    const ids = await s.t.run(async (ctx) => {
      expect(await updateThemeOp.validate(ctx, change(s, 1))).toBeNull();
      return await updateThemeOp.apply(ctx, change(s, 1), {
        kind: "assistant",
        forMembershipId: s.meera,
        runId: null,
        proposalId,
        acceptedBy: s.meera,
      });
    });
    expect(ids).toEqual([s.eventId]);
    const event = await eventOf(s);
    expect(event.theme.palette).toContain("#1F6F78");
    expect(event.theme.decorKeywords).toContain("brass lanterns");
    const [row] = await s.t.run((ctx) =>
      ctx.db
        .query("changes")
        .filter((q) => q.eq(q.field("docId"), s.eventId))
        .collect(),
    );
    expect(row!.actor).toMatchObject({ kind: "assistant", proposalId });
  });
});

describe("tagInspiration", () => {
  const tag = (s: Setup, functionKey: string | null) => ({
    itemId: s.itemId,
    functionKey,
    expectedVersion: 1,
  });
  const functionOf = (s: Setup) =>
    s.t.run(async (ctx) => (await ctx.db.get("items", s.itemId))!.functionKey);

  it('tags when the Member\'s message names the Function ("find mehendi decor")', async () => {
    const s = await setUp();
    const runId = await ask(s, "find mehendi decor");
    const result = await call(s, runId, "tagInspiration", tag(s, "mehendi"));
    expect(result).toMatchObject({ ok: true });
    expect(await functionOf(s)).toBe("mehendi");
  });

  it('is refused, writing nothing, when the message names no Function ("find some decor")', async () => {
    const s = await setUp();
    const runId = await ask(s, "find some decor");
    const result = await call(s, runId, "tagInspiration", tag(s, "mehendi"));
    expect(result).toMatchObject({ ok: false, reason: "notAsked" });
    expect(await functionOf(s)).toBeNull();
  });

  it("is refused in any nudge or brief run", async () => {
    for (const source of ["nudge", "brief"] as const) {
      const s = await setUp();
      const runId = await ask(s, "find mehendi decor", source);
      const result = await call(s, runId, "tagInspiration", tag(s, "mehendi"));
      expect(result).toMatchObject({ ok: false, reason: "notAsked" });
      expect(await functionOf(s)).toBeNull();
    }
  });

  it("tags only with a Function the message names", async () => {
    const s = await setUp();
    const runId = await ask(s, "find mehendi decor");
    const result = await call(s, runId, "tagInspiration", tag(s, "haldi"));
    expect(result).toMatchObject({ ok: false, reason: "notAsked" });
  });

  it("propose with a tagInspiration change fails validation", async () => {
    const s = await setUp();
    await expect(
      s.t.run((ctx) =>
        ctx.db.insert("proposals", {
          eventId: s.eventId,
          runId: null,
          requestedBy: s.meera,
          origin: { kind: "chat" },
          summary: "Tag it",
          changes: [
            {
              op: "tagInspiration",
              table: "items",
              docId: s.itemId,
              expectedVersion: 1,
              guards: [],
              values: { functionKey: "haldi" },
            } as never,
          ],
          status: "open",
          decidedBy: null,
          decidedAt: null,
          replacedBy: null,
          expiresAt: T0 + 1,
          createdAt: T0,
        }),
      ),
    ).rejects.toThrow();
  });
});
