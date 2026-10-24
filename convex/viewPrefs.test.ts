/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

// S16 seams for api.viewPrefs (issue #49): personal Compact mode preferences,
// one row per person per Event, and the person's own mobile pointing setting.

async function denialOf(promise: Promise<unknown>) {
  return await promise.then(
    () => null,
    (error: unknown) => (error as { data?: unknown }).data,
  );
}

/** Meera (Co-owner) and Rohan (Member) in one Event whose default grouping is "by kind". */
async function meeraAndRohan() {
  const t = newTest();
  const ids = await t.run(async (ctx) => {
    const meera = await seedMembership(ctx, {
      clerkId: "meera",
      role: "coOwner",
    });
    await seedMembership(ctx, {
      clerkId: "rohan",
      role: "member",
      eventId: meera.eventId,
    });
    const sectionId = await ctx.db.insert("sections", {
      eventId: meera.eventId,
      kind: "notes",
      name: "Notes",
      frame: { x: 0, y: 0, w: 600, h: 400 },
      order: 3,
      version: 1,
      deletedAt: null,
    });
    const itemIds: Id<"items">[] = [];
    for (const body of ["Mehendi cones", "Sangeet playlist"]) {
      itemIds.push(
        await ctx.db.insert("items", {
          eventId: meera.eventId,
          sectionId,
          kind: "note",
          functionKey: null,
          position: { x: 0, y: itemIds.length * 200 },
          size: { w: 320, h: 180 },
          data: { text: body, citations: [] },
          createdBy: { kind: "member", membershipId: meera.membershipId },
          version: 1,
          deletedAt: null,
        }),
      );
    }
    return { eventId: meera.eventId, itemIds };
  });
  return {
    t,
    ...ids,
    asMeera: t.withIdentity(identityFor("meera")),
    asRohan: t.withIdentity(identityFor("rohan")),
  };
}

describe("viewPrefs.get and viewPrefs.set", () => {
  it("gives a person without a row the Event default grouping, empty order and nothing collapsed", async () => {
    const { asRohan, eventId } = await meeraAndRohan();
    expect(await asRohan.query(api.viewPrefs.get, { eventId })).toMatchObject({
      grouping: "kind",
      ownGrouping: null,
      order: [],
      collapsed: [],
    });
  });

  it("keeps Meera's order and collapse state out of Rohan's view and away from the Event defaults", async () => {
    const { t, asMeera, asRohan, eventId, itemIds } = await meeraAndRohan();
    const before = await t.run((ctx) => ctx.db.get("events", eventId));

    await asMeera.mutation(api.viewPrefs.set, {
      eventId,
      grouping: "function",
      order: [{ group: "eventWide", itemIds: [itemIds[1]!, itemIds[0]!] }],
      collapsed: ["eventWide"],
    });

    expect(await asMeera.query(api.viewPrefs.get, { eventId })).toMatchObject({
      grouping: "function",
      ownGrouping: "function",
      order: [{ group: "eventWide", itemIds: [itemIds[1], itemIds[0]] }],
      collapsed: ["eventWide"],
    });
    expect(await asRohan.query(api.viewPrefs.get, { eventId })).toMatchObject({
      grouping: "kind",
      ownGrouping: null,
      order: [],
      collapsed: [],
    });
    const after = await t.run((ctx) => ctx.db.get("events", eventId));
    expect(after?.defaults).toEqual(before?.defaults);
    expect(after?.version).toBe(before?.version);
  });

  it("upserts one row per person per Event and changes only the fields given", async () => {
    const { t, asMeera, eventId } = await meeraAndRohan();
    await asMeera.mutation(api.viewPrefs.set, {
      eventId,
      collapsed: ["section:a"],
    });
    await asMeera.mutation(api.viewPrefs.set, { eventId, grouping: "kind" });
    await asMeera.mutation(api.viewPrefs.set, { eventId, grouping: null });

    const rows = await t.run((ctx) => ctx.db.query("viewPrefs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ grouping: null, collapsed: ["section:a"] });
    // No history: personal view state is written directly (section 4.4).
    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(changes).toEqual([]);
  });

  it("lets a Viewer get and set their own viewPrefs", async () => {
    const { t, eventId } = await meeraAndRohan();
    await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "papa", role: "viewer", eventId }),
    );
    const asPapa = t.withIdentity(identityFor("papa"));
    await asPapa.mutation(api.viewPrefs.set, {
      eventId,
      collapsed: ["eventWide"],
    });
    expect(await asPapa.query(api.viewPrefs.get, { eventId })).toMatchObject({
      collapsed: ["eventWide"],
    });
  });

  it("refuses a removed person, a blocked person and someone outside the Event", async () => {
    const { t, eventId } = await meeraAndRohan();
    await t.run(async (ctx) => {
      await seedMembership(ctx, {
        clerkId: "kabir",
        status: "removed",
        eventId,
      });
      await seedMembership(ctx, { clerkId: "aditi", blocked: true, eventId });
      await seedMembership(ctx, { clerkId: "stranger" });
    });
    for (const clerkId of ["kabir", "aditi", "stranger"]) {
      const as = t.withIdentity(identityFor(clerkId));
      expect(
        await denialOf(as.query(api.viewPrefs.get, { eventId })),
      ).toMatchObject({ kind: "AccessDenied" });
      expect(
        await denialOf(
          as.mutation(api.viewPrefs.set, { eventId, collapsed: ["x"] }),
        ),
      ).toMatchObject({ kind: "AccessDenied" });
    }
    expect(
      await denialOf(t.query(api.viewPrefs.get, { eventId })),
    ).toMatchObject({ kind: "AccessDenied", reason: "signedOut" });
  });

  it("refuses an order or collapse list too long to be one person's view", async () => {
    const { asMeera, eventId } = await meeraAndRohan();
    const tooMany = Array.from({ length: 201 }, (_, i) => `group-${i}`);
    expect(
      await denialOf(
        asMeera.mutation(api.viewPrefs.set, { eventId, collapsed: tooMany }),
      ),
    ).toMatchObject({ kind: "TooLong" });
  });
});

describe("mobile pointing: the person's setting or the Event default", () => {
  it("follows the Event default until the person chooses, then their choice", async () => {
    const { t, asRohan, eventId } = await meeraAndRohan();
    expect(await asRohan.query(api.viewPrefs.get, { eventId })).toMatchObject({
      mobilePointing: "jump",
      ownMobilePointing: null,
    });

    await asRohan.mutation(api.viewPrefs.setMobilePointing, {
      value: "sheet",
    });
    expect(await asRohan.query(api.viewPrefs.get, { eventId })).toMatchObject({
      mobilePointing: "sheet",
      ownMobilePointing: "sheet",
    });

    // Back to "the Event's default": a later change to the default reaches them.
    await asRohan.mutation(api.viewPrefs.setMobilePointing, { value: null });
    await t.run((ctx) =>
      ctx.db.patch("events", eventId, {
        defaults: {
          view: "canvas",
          compactGrouping: "kind",
          mobilePointing: "sheet",
        },
      }),
    );
    expect(await asRohan.query(api.viewPrefs.get, { eventId })).toMatchObject({
      mobilePointing: "sheet",
      ownMobilePointing: null,
    });
  });

  it("writes only the caller's own user row", async () => {
    const { t, asMeera } = await meeraAndRohan();
    await asMeera.mutation(api.viewPrefs.setMobilePointing, {
      value: "sheet",
    });
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(
      Object.fromEntries(users.map((u) => [u.clerkId, u.mobilePointing])),
    ).toEqual({ meera: "sheet", rohan: null });
  });

  it("reads the caller's own setting for /settings, and refuses a signed-out caller", async () => {
    const { t, asRohan } = await meeraAndRohan();
    expect(await asRohan.query(api.viewPrefs.myMobilePointing, {})).toBe(null);
    await asRohan.mutation(api.viewPrefs.setMobilePointing, { value: "jump" });
    expect(await asRohan.query(api.viewPrefs.myMobilePointing, {})).toBe(
      "jump",
    );
    expect(
      await denialOf(
        t.mutation(api.viewPrefs.setMobilePointing, { value: "jump" }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "signedOut" });
  });
});
