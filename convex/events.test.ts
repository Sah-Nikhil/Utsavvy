/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newTest, seedMembership } from "./lib/test.helpers";

// S1 seams for api.events (issue #34): the access exceptions `create` and
// `listMine`, and the Owner and Co-owner setters.

function setUp() {
  const t = newTest();
  agentTest.register(t);
  return t;
}

const meera = {
  subject: "user_meera",
  name: "Meera",
  email: "meera@example.com",
};

async function denialOf(promise: Promise<unknown>) {
  return await promise.then(
    () => null,
    (error: unknown) => (error as { data?: unknown }).data,
  );
}

describe("events.create", () => {
  it("is refused when signed out", async () => {
    const t = setUp();
    expect(
      await denialOf(
        t.mutation(api.events.create, {
          name: "Meera weds Rohan",
          eventType: "wedding",
        }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "signedOut" });
    expect(await t.run((ctx) => ctx.db.query("events").take(1))).toEqual([]);
  });

  it("makes the caller Owner in the same mutation, with the starting Canvas, two links and a thread", async () => {
    const t = setUp();
    const asMeera = t.withIdentity(meera);
    const eventId = await asMeera.mutation(api.events.create, {
      name: "  Meera weds Rohan  ",
      eventType: "wedding",
      ownerLabel: "host",
    });

    const state = await t.run(async (ctx) => {
      const event = await ctx.db.get("events", eventId);
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      const users = await ctx.db.query("users").collect();
      const sections = await ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      const items = await ctx.db
        .query("items")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      const links = await ctx.db
        .query("inviteLinks")
        .withIndex("by_event_role", (q) => q.eq("eventId", eventId))
        .collect();
      return { event, memberships, users, sections, items, links };
    });

    expect(state.event).toMatchObject({
      name: "Meera weds Rohan",
      eventType: "wedding",
      ownerLabel: "host",
      uploadRightsOn: false,
      briefState: "intake",
    });
    expect(state.event?.agentThreadId).toEqual(expect.any(String));
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      userId: state.users[0]!._id,
      role: "owner",
      status: "active",
      blocked: false,
      displayName: "Meera",
    });

    expect(
      state.sections
        .sort((a, b) => a.order - b.order)
        .map((s) => [s.kind, s.name]),
    ).toEqual([
      ["money", "Money and dates"],
      ["vendors", "Vendors"],
      ["inspirations", "Inspirations"],
      ["notes", "Notes"],
    ]);
    const sectionKind = new Map(state.sections.map((s) => [s._id, s.kind]));
    expect(
      state.items.map((i) => [i.kind, sectionKind.get(i.sectionId)]).sort(),
    ).toEqual([
      ["budget", "money"],
      ["checklist", "vendors"],
      ["timeline", "money"],
    ]);
    for (const item of state.items) {
      expect(item.data).toEqual({ note: null });
      expect(item.deletedAt).toBeNull();
    }
    // The Budget and Timeline don't start on top of each other.
    const [budget, timeline] = ["budget", "timeline"].map((k) =>
      state.items.find((i) => i.kind === k)!,
    );
    expect(budget!.position).not.toEqual(timeline!.position);

    expect(state.links.map((l) => l.role).sort()).toEqual(["member", "viewer"]);
    const [first, second] = state.links;
    expect(first!.token).not.toEqual(second!.token);
    expect(first!.token.length).toBeGreaterThanOrEqual(20);
  });

  it("starts with upload rights off unless asked for them", async () => {
    const t = setUp();
    const asMeera = t.withIdentity(meera);
    const off = await asMeera.mutation(api.events.create, {
      name: "Off",
      eventType: "birthday",
    });
    const on = await asMeera.mutation(api.events.create, {
      name: "On",
      eventType: "community",
      uploadRightsOn: true,
    });
    const [offEvent, onEvent] = await t.run(async (ctx) => [
      await ctx.db.get("events", off),
      await ctx.db.get("events", on),
    ]);
    expect(offEvent).toMatchObject({
      uploadRightsOn: false,
      ownerLabel: "owner",
    });
    expect(onEvent).toMatchObject({ uploadRightsOn: true });
  });

  it("refuses an empty name", async () => {
    const t = setUp();
    await expect(
      t
        .withIdentity(meera)
        .mutation(api.events.create, { name: "   ", eventType: "wedding" }),
    ).rejects.toThrow();
  });
});

describe("events.listMine", () => {
  it("is refused when signed out", async () => {
    const t = setUp();
    expect(await denialOf(t.query(api.events.listMine, {}))).toMatchObject({
      kind: "AccessDenied",
      reason: "signedOut",
    });
  });

  it("returns only Events where the caller is active, newest first", async () => {
    const t = setUp();
    const ids = await t.run(async (ctx) => {
      const active = await seedMembership(ctx, { clerkId: "rohan" });
      const userId = active.userId;
      const event = (name: string, createdAt: number) =>
        ctx.db.insert("events", { ...eventFields(name), createdAt });
      const older = active.eventId;
      await ctx.db.patch("events", older, { name: "Older", createdAt: 1 });
      const newer = await event("Newer", 5);
      const left = await event("Left", 9);
      const removed = await event("Removed", 9);
      const stranger = await event("Someone else's", 9);
      for (const [eventId, status] of [
        [newer, "active"],
        [left, "left"],
        [removed, "removed"],
      ] as const) {
        await ctx.db.insert("memberships", {
          eventId,
          userId,
          role: "viewer",
          status,
          blocked: status === "removed",
          displayName: "rohan",
          joinedAt: 0,
          endedAt: status === "active" ? null : 1,
        });
      }
      return { older, newer, stranger };
    });

    const mine = await t
      .withIdentity({ subject: "rohan", name: "rohan" })
      .query(api.events.listMine, {});
    expect(mine.map((e) => e.name)).toEqual(["Newer", "Older"]);
    expect(mine[0]).toMatchObject({
      eventId: ids.newer,
      role: "viewer",
      isDemo: false,
    });
    expect(mine[1]).toMatchObject({ eventId: ids.older, role: "member" });
  });
});

describe("events.get", () => {
  it("returns the Event to anyone in it and refuses everyone else", async () => {
    const t = setUp();
    const eventId = await t.withIdentity(meera).mutation(api.events.create, {
      name: "Meera weds Rohan",
      eventType: "wedding",
    });
    const event = await t
      .withIdentity(meera)
      .query(api.events.get, { eventId });
    expect(event).toMatchObject({
      _id: eventId,
      name: "Meera weds Rohan",
      ownerLabel: "owner",
    });
    expect(JSON.stringify(event)).not.toMatch(/token/i);

    await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "stranger", eventId: undefined }),
    );
    expect(
      await denialOf(
        t
          .withIdentity({ subject: "stranger" })
          .query(api.events.get, { eventId }),
      ),
    ).toMatchObject({ kind: "AccessDenied", reason: "notAMember" });
  });
});

describe("Owner and Co-owner setters", () => {
  async function eventWithEveryRole() {
    const t = setUp();
    const s = await t.run(async (ctx) => {
      const owner = await seedMembership(ctx, {
        clerkId: "meera",
        role: "owner",
      });
      const eventId = owner.eventId;
      const coOwner = await seedMembership(ctx, {
        clerkId: "rohan",
        role: "coOwner",
        eventId,
      });
      const member = await seedMembership(ctx, {
        clerkId: "aditi",
        role: "member",
        eventId,
      });
      const viewer = await seedMembership(ctx, {
        clerkId: "papa",
        role: "viewer",
        eventId,
      });
      return { eventId, owner, coOwner, member, viewer };
    });
    return { t, ...s };
  }

  const as = (t: ReturnType<typeof setUp>, clerkId: string) =>
    t.withIdentity({ subject: clerkId, name: clerkId });

  async function eventChanges(
    t: ReturnType<typeof setUp>,
    eventId: Id<"events">,
  ) {
    return await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", eventId))
        .collect(),
    );
  }

  it("setUploadRights: the Owner and a Co-owner succeed and write history", async () => {
    const { t, eventId, owner, coOwner } = await eventWithEveryRole();
    await as(t, "meera").mutation(api.events.setUploadRights, {
      eventId,
      on: true,
    });
    await as(t, "rohan").mutation(api.events.setUploadRights, {
      eventId,
      on: false,
    });
    const changes = await eventChanges(t, eventId);
    expect(
      changes.map((c) => [
        c.actor,
        c.before.uploadRightsOn,
        c.after.uploadRightsOn,
      ]),
    ).toEqual([
      [{ kind: "member", membershipId: owner.membershipId }, false, true],
      [{ kind: "member", membershipId: coOwner.membershipId }, true, false],
    ]);
  });

  it("setUploadRights: a Member and a Viewer are refused", async () => {
    const { t, eventId } = await eventWithEveryRole();
    for (const who of ["aditi", "papa"]) {
      expect(
        await denialOf(
          as(t, who).mutation(api.events.setUploadRights, {
            eventId,
            on: true,
          }),
        ),
      ).toMatchObject({ kind: "AccessDenied", reason: "notAllowed" });
    }
    expect(await eventChanges(t, eventId)).toEqual([]);
  });

  it("setDefaults: the Owner and a Co-owner succeed and write history", async () => {
    const { t, eventId } = await eventWithEveryRole();
    await as(t, "meera").mutation(api.events.setDefaults, {
      eventId,
      compactGrouping: "function",
    });
    await as(t, "rohan").mutation(api.events.setDefaults, {
      eventId,
      mobilePointing: "sheet",
    });
    const event = await t.run((ctx) => ctx.db.get("events", eventId));
    expect(event?.defaults).toEqual({
      view: "canvas",
      compactGrouping: "function",
      mobilePointing: "sheet",
    });
    expect(await eventChanges(t, eventId)).toHaveLength(2);
  });

  it("setDefaults: a Member and a Viewer are refused", async () => {
    const { t, eventId } = await eventWithEveryRole();
    for (const who of ["aditi", "papa"]) {
      expect(
        await denialOf(
          as(t, who).mutation(api.events.setDefaults, {
            eventId,
            compactGrouping: "function",
          }),
        ),
      ).toMatchObject({ kind: "AccessDenied", reason: "notAllowed" });
    }
  });

  it("setOwnerLabel and rename: Owner and Co-owners only", async () => {
    const { t, eventId } = await eventWithEveryRole();
    await as(t, "rohan").mutation(api.events.setOwnerLabel, {
      eventId,
      ownerLabel: "host",
    });
    await as(t, "meera").mutation(api.events.rename, {
      eventId,
      name: "Meera weds Rohan",
    });
    expect(await t.run((ctx) => ctx.db.get("events", eventId))).toMatchObject({
      ownerLabel: "host",
      name: "Meera weds Rohan",
    });
    expect(
      await denialOf(
        as(t, "aditi").mutation(api.events.setOwnerLabel, {
          eventId,
          ownerLabel: "owner",
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
  });
});

function eventFields(name: string) {
  return {
    name,
    eventType: "wedding" as const,
    ownerLabel: "owner" as const,
    city: null,
    tradition: null,
    communityKind: null,
    honoree: null,
    households: null,
    budgetTotal: null,
    contingencyShare: 0.1,
    theme: { palette: [], styleWords: [], decorKeywords: [] },
    briefState: "intake" as const,
    brief: null,
    budgetCheck: null,
    uploadRightsOn: false,
    defaults: {
      view: "canvas" as const,
      compactGrouping: "kind" as const,
      mobilePointing: "jump" as const,
    },
    startingSectionRenameBlocked: false,
    agentThreadId: null,
    demoKey: null,
    version: 1,
  };
}
