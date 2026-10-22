import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

async function seedEvent(
  ctx: MutationCtx,
  opts: Parameters<typeof seedMembership>[1] = { clerkId: "meera" },
) {
  const seeded = await seedMembership(ctx, opts);
  const sectionId = await ctx.db.insert("sections", {
    eventId: seeded.eventId,
    kind: "inspirations",
    name: "Inspirations",
    frame: { x: 0, y: 0, w: 640, h: 480 },
    order: 2,
    version: 1,
    deletedAt: null,
  });
  return { ...seeded, sectionId };
}

async function addMember(
  ctx: MutationCtx,
  eventId: Id<"events">,
  opts: Omit<Parameters<typeof seedMembership>[1], "eventId">,
) {
  return await seedMembership(ctx, { ...opts, eventId });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("references.add", () => {
  it("stores only the platform, kind, URL and note, with one changes row", async () => {
    const t = newTest();
    const { eventId, membershipId, sectionId } = await t.run((ctx) =>
      seedEvent(ctx),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { itemId } = await t
      .withIdentity(identityFor("meera"))
      .mutation(api.references.add, {
        eventId,
        url: "https://in.pinterest.com/pin/123456789/?utm_source=share",
        note: "  love the teal drapes  ",
      });

    const { item, changes } = await t.run(async (ctx) => ({
      item: await ctx.db.get("items", itemId),
      changes: await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
        .collect(),
    }));
    expect(item).toMatchObject({
      eventId,
      sectionId,
      kind: "inspiration",
      functionKey: null,
      createdBy: { kind: "member", membershipId },
      version: 1,
      deletedAt: null,
    });
    expect(item!.data).toEqual({
      source: {
        kind: "reference",
        platform: "pinterest",
        urlKind: "pin",
        url: "https://in.pinterest.com/pin/123456789/",
      },
      addedBy: membershipId,
      memberNote: "love the teal drapes",
      seen: null,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ docId: itemId, op: "create" });
    // The server never opens the Member's link.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["https://pin.it/AbC123", "pinterest", "pinShort"],
    ["https://www.pinterest.com/meera/haldi-decor/", "pinterest", "board"],
    ["https://www.instagram.com/p/fA9uwTtkSN/", "instagram", "post"],
    ["https://www.instagram.com/reel/Cxyz123/", "instagram", "reel"],
  ])("saves %s as a %s %s", async (url, platform, urlKind) => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => seedEvent(ctx));
    const { itemId } = await t
      .withIdentity(identityFor("meera"))
      .mutation(api.references.add, { eventId, url, note: null });
    const item = await t.run((ctx) => ctx.db.get("items", itemId));
    expect(item!.data).toMatchObject({
      source: { kind: "reference", platform, urlKind, url },
      memberNote: null,
    });
  });

  it("lands each new Reference in free space in the Inspirations Section", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => seedEvent(ctx));
    const asMeera = t.withIdentity(identityFor("meera"));
    const first = await asMeera.mutation(api.references.add, {
      eventId,
      url: "https://www.pinterest.com/pin/1/",
      note: null,
    });
    const second = await asMeera.mutation(api.references.add, {
      eventId,
      url: "https://www.pinterest.com/pin/2/",
      note: null,
    });
    const [a, b] = await t.run(async (ctx) => [
      await ctx.db.get("items", first.itemId),
      await ctx.db.get("items", second.itemId),
    ]);
    expect(a!.position).not.toEqual(b!.position);
  });

  it("files the Reference under a Function of the Event", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const seeded = await seedEvent(ctx);
      await ctx.db.insert("eventFunctions", {
        eventId: seeded.eventId,
        key: "haldi",
        name: "Haldi",
        date: null,
        guests: null,
        assumed: [],
        order: 0,
        version: 1,
      });
      return seeded;
    });
    const asMeera = t.withIdentity(identityFor("meera"));
    const { itemId } = await asMeera.mutation(api.references.add, {
      eventId,
      url: "https://www.pinterest.com/pin/1/",
      note: null,
      functionKey: "haldi",
    });
    const item = await t.run((ctx) => ctx.db.get("items", itemId));
    expect(item!.functionKey).toBe("haldi");

    await expect(
      asMeera.mutation(api.references.add, {
        eventId,
        url: "https://www.pinterest.com/pin/1/",
        note: null,
        functionKey: "sangeet",
      }),
    ).rejects.toThrow(/sangeet/);
  });

  it.each([
    ["a Viewer", { role: "viewer" as const }, "notAllowed"],
    ["a removed person", { status: "removed" as const }, "removed"],
  ])("refuses %s and writes nothing", async (_who, opts, reason) => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const seeded = await seedEvent(ctx);
      await addMember(ctx, seeded.eventId, { clerkId: "papa", ...opts });
      return seeded;
    });
    await expect(
      t.withIdentity(identityFor("papa")).mutation(api.references.add, {
        eventId,
        url: "https://www.pinterest.com/pin/123456789/",
        note: null,
      }),
    ).rejects.toMatchObject({ data: { kind: "AccessDenied", reason } });
    const rows = await t.run(async (ctx) => ({
      items: await ctx.db.query("items").collect(),
      changes: await ctx.db.query("changes").collect(),
    }));
    expect(rows).toEqual({ items: [], changes: [] });
  });

  it.each([
    "http://www.pinterest.com/pin/123456789/",
    "https://www.pinterest.com/search/pins/?q=haldi",
    "https://www.instagram.com/meera/",
    "javascript:alert(1)",
  ])("refuses the link %s and writes nothing", async (url) => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => seedEvent(ctx));
    await expect(
      t
        .withIdentity(identityFor("meera"))
        .mutation(api.references.add, { eventId, url, note: null }),
    ).rejects.toMatchObject({ data: { kind: "ReferenceUrlRefused" } });
    const items = await t.run((ctx) => ctx.db.query("items").collect());
    expect(items).toEqual([]);
  });

  it("refuses a note longer than 500 characters", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => seedEvent(ctx));
    await expect(
      t.withIdentity(identityFor("meera")).mutation(api.references.add, {
        eventId,
        url: "https://www.pinterest.com/pin/1/",
        note: "a".repeat(501),
      }),
    ).rejects.toMatchObject({ data: { kind: "ReferenceNoteTooLong" } });
  });
});

describe("references.themeWords", () => {
  it("gives a Member the Theme's style words and decor keywords", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const seeded = await seedEvent(ctx);
      await ctx.db.patch("events", seeded.eventId, {
        theme: {
          palette: [],
          styleWords: ["royal Rajputana", "pastel"],
          decorKeywords: ["marigold", "pastel"],
        },
      });
      return seeded;
    });
    const words = await t
      .withIdentity(identityFor("meera"))
      .query(api.references.themeWords, { eventId });
    expect(words).toEqual(["royal Rajputana", "pastel", "marigold"]);
  });

  it("gives nothing to someone outside the Event or for an ID that isn't one", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const seeded = await seedEvent(ctx);
      await seedMembership(ctx, { clerkId: "stranger" });
      return seeded;
    });
    const asStranger = t.withIdentity(identityFor("stranger"));
    expect(
      await asStranger.query(api.references.themeWords, { eventId }),
    ).toEqual([]);
    expect(
      await asStranger.query(api.references.themeWords, {
        eventId: "smoke-test-event",
      }),
    ).toEqual([]);
  });
});
