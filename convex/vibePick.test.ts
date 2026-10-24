/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findLibraryPhoto, setPhotos } from "../lib/inspirations/library";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

// S18 seams (issue #51): the vibe pick on convex-test. Picking 3 photos adds
// them as Inspirations through S13's `addFromLibrary` and makes a Theme with 3
// to 5 colours and style words that the Brief summary shows. A repeated pick
// adds nothing twice, and Viewers can't pick.

const T0 = Date.UTC(2026, 9, 27, 6, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("DEFAULT_MODEL", "stub-utsavvy");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Three of the North Indian Hindu set's vibe pick photos: two haldi, one mandap. */
const PICKS = [31002035, 19569602, 33417236];

/** The Jaipur wedding at its Brief summary: Meera plans, Papa views. */
async function seedWedding(ctx: MutationCtx) {
  const eventId = await insertEvent(ctx, "Meera weds Rohan");
  await ctx.db.patch("events", eventId, {
    city: { name: "Jaipur", tier: "Y", centre: null },
    tradition: "North Indian Hindu",
    budgetTotal: 2_500_000,
    briefState: "summary",
  });
  const meera = await seedMembership(ctx, { clerkId: "Meera", eventId });
  await seedMembership(ctx, { clerkId: "Papa", eventId, role: "viewer" });
  await ctx.db.patch("memberships", meera.membershipId, {
    displayName: "Meera",
  });
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId: meera.membershipId,
  });
  return { eventId, sections };
}

async function setUp() {
  const t = newTest();
  agentTest.register(t);
  const w = await t.run(seedWedding);
  return {
    t,
    ...w,
    asMeera: t.withIdentity(identityFor("Meera")),
    asPapa: t.withIdentity(identityFor("Papa")),
  };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

const inspirations = (s: Setup) =>
  s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("items")
        .withIndex("by_event_kind", (q) =>
          q.eq("eventId", s.eventId).eq("kind", "inspiration"),
        )
        .collect()
    ).filter((i) => i.deletedAt === null),
  );
const eventOf = (s: Setup) =>
  s.t.run(async (ctx) => (await ctx.db.get("events", s.eventId))!);

describe("vibePick.view", () => {
  it("shows the set's 12 vibe pick photos with their Pexels credits", async () => {
    const s = await setUp();
    const view = await s.asMeera.query(api.vibePick.view, {
      eventId: s.eventId,
      more: 0,
    });
    if (view.kind !== "pick") throw new Error(`got ${view.kind}`);
    expect(view.setKey).toBe("wedding-north-indian-hindu");
    expect(view.photos).toHaveLength(12);
    const first = findLibraryPhoto(31002035)!;
    expect(view.photos[0]).toMatchObject({
      pexelsId: 31002035,
      localPath: first.localPath,
      photographer: first.photographer,
      photographerUrl: first.photographerUrl,
      pageUrl: first.pageUrl,
    });
    expect(view.hasMore).toBe(true);
    expect(view.picked).toEqual([]);
  });

  it('"Show me more" adds 12 more, and a child birthday never shows a branded photo', async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, {
        eventType: "birthday",
        tradition: null,
        honoree: { who: "child", age: 6, name: "Aarav" },
      }),
    );
    const view = await s.asMeera.query(api.vibePick.view, {
      eventId: s.eventId,
      more: 5,
    });
    if (view.kind !== "pick") throw new Error(`got ${view.kind}`);
    expect(view.setKey).toBe("birthday-child");
    expect(view.photos).toHaveLength(63);
    expect(view.hasMore).toBe(false);
    const branded = new Set(
      setPhotos(["birthday-child"])
        .filter((p) => p.tags.includes("branded"))
        .map((p) => p.pexelsId),
    );
    expect(view.photos.some((p) => branded.has(p.pexelsId))).toBe(false);
  });

  it("skips the step for an Event with no set", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, {
        eventType: "community",
        tradition: null,
        communityKind: "Durga puja",
      }),
    );
    expect(
      await s.asMeera.query(api.vibePick.view, { eventId: s.eventId, more: 0 }),
    ).toEqual({ kind: "noSet" });
  });

  it("is hidden from Viewers and once the plan is made", async () => {
    const s = await setUp();
    expect(
      await s.asPapa.query(api.vibePick.view, { eventId: s.eventId, more: 0 }),
    ).toEqual({ kind: "hidden" });
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, { briefState: "planned" }),
    );
    expect(
      await s.asMeera.query(api.vibePick.view, { eventId: s.eventId, more: 0 }),
    ).toEqual({ kind: "hidden" });
  });
});

describe("vibePick.pick", () => {
  it("adds 3 picks as Inspirations and makes a Theme with 3 to 5 colours and style words, shown on the Brief summary", async () => {
    const s = await setUp();
    const result = await s.asMeera.mutation(api.vibePick.pick, {
      eventId: s.eventId,
      pexelsIds: PICKS,
    });
    expect(result).toEqual({ added: 3, themeChanged: true });

    const items = await inspirations(s);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.sectionId).toBe(s.sections.inspirations);
      if (item.kind !== "inspiration") throw new Error(item.kind);
      expect(item.data.source.kind).toBe("pexels");
    }
    expect(
      items
        .map((i) =>
          i.kind === "inspiration" && i.data.source.kind === "pexels"
            ? i.data.source.pexelsId
            : null,
        )
        .sort(),
    ).toEqual([...PICKS].sort());

    const { theme } = await eventOf(s);
    expect(theme.palette.length).toBeGreaterThanOrEqual(3);
    expect(theme.palette.length).toBeLessThanOrEqual(5);
    expect(theme.styleWords.length).toBeGreaterThanOrEqual(2);

    const summary = await s.asMeera.query(api.brief.summary, {
      eventId: s.eventId,
      today: "2026-10-27",
    });
    expect(summary?.styleWords).toEqual(theme.styleWords);

    const view = await s.asMeera.query(api.vibePick.view, {
      eventId: s.eventId,
      more: 0,
    });
    if (view.kind !== "pick") throw new Error(`got ${view.kind}`);
    expect([...view.picked].sort()).toEqual([...PICKS].sort());
    expect(view.palette).toEqual(theme.palette);
  });

  it("keeps the colours and words the Member typed in the Theme", async () => {
    const s = await setUp();
    const typed = {
      palette: ["#1F6F78", "#123456", "#ABCDEF"],
      styleWords: ["lantern-lit", "royal", "minimal", "boho"],
      decorKeywords: [],
    };
    await s.t.run((ctx) => ctx.db.patch("events", s.eventId, { theme: typed }));
    const five = setPhotos(["wedding-north-indian-hindu"])
      .filter((p) => p.vibePick)
      .slice(0, 5)
      .map((p) => p.pexelsId);
    await s.asMeera.mutation(api.vibePick.pick, {
      eventId: s.eventId,
      pexelsIds: five,
    });
    const { theme } = await eventOf(s);
    expect(theme.palette.slice(0, 3)).toEqual(typed.palette);
    expect(theme.styleWords).toEqual(typed.styleWords);
  });

  it("adds each photo once when the same pick arrives twice (a double tap)", async () => {
    const s = await setUp();
    await Promise.all([
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: PICKS,
      }),
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: PICKS,
      }),
    ]);
    const before = await eventOf(s);
    expect(
      await s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: PICKS,
      }),
    ).toEqual({ added: 0, themeChanged: false });
    expect(await inspirations(s)).toHaveLength(3);
    const after = await eventOf(s);
    expect(after.theme).toEqual(before.theme);
    expect(after.version).toBe(before.version);
  });

  it("never offers decor Suggestions during the Brief", async () => {
    const s = await setUp();
    await s.asMeera.mutation(api.vibePick.pick, {
      eventId: s.eventId,
      pexelsIds: PICKS,
    });
    const jobs = await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.map((j) => j.name)).not.toContain(
      "inspirations:suggestForTheme",
    );
  });

  it("refuses a Viewer", async () => {
    const s = await setUp();
    await expect(
      s.asPapa.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: PICKS,
      }),
    ).rejects.toThrow(/AccessDenied/);
    expect(await inspirations(s)).toHaveLength(0);
  });

  it("refuses a branded photo, a photo from another set, and more than 5", async () => {
    const s = await setUp();
    const general = setPhotos(["wedding-general"])[0]!.pexelsId;
    await expect(
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: [general],
      }),
    ).rejects.toThrow(/isn't one of this Event's vibe pick photos/);
    const six = setPhotos(["wedding-north-indian-hindu"])
      .slice(0, 6)
      .map((p) => p.pexelsId);
    await expect(
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: six,
      }),
    ).rejects.toThrow(/at most 5/);

    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, {
        eventType: "birthday",
        tradition: null,
        honoree: { who: "child", age: 6, name: "Aarav" },
      }),
    );
    const branded = setPhotos(["birthday-child"]).find((p) =>
      p.tags.includes("branded"),
    )!.pexelsId;
    await expect(
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: [branded],
      }),
    ).rejects.toThrow(/isn't one of this Event's vibe pick photos/);
    expect(await inspirations(s)).toHaveLength(0);
  });

  it("refuses when the Event has no set", async () => {
    const s = await setUp();
    await s.t.run((ctx) =>
      ctx.db.patch("events", s.eventId, {
        eventType: "birthday",
        tradition: null,
        honoree: { who: "adult", age: 40, name: null },
      }),
    );
    await expect(
      s.asMeera.mutation(api.vibePick.pick, {
        eventId: s.eventId,
        pexelsIds: PICKS,
      }),
    ).rejects.toThrow(/no vibe pick/);
  });
});
