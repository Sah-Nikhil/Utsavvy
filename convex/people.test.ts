/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_PEOPLE_PER_EVENT } from "./lib/settings";
import { newTest } from "./lib/test.helpers";

// S1 seams for api.people (issue #34): joining by link, roles, removal,
// blocking, link resets and leaving, from docs/design/roles.md.

type T = ReturnType<typeof setUp>;

function setUp() {
  const t = newTest();
  agentTest.register(t);
  return t;
}

const as = (t: T, name: string) =>
  t.withIdentity({
    subject: `user_${name.toLowerCase()}`,
    name,
    email: `${name.toLowerCase()}@example.com`,
  });

async function denialOf(promise: Promise<unknown>) {
  return await promise.then(
    () => null,
    (error: unknown) => (error as { data?: unknown }).data,
  );
}

/** Meera creates the Event; returns it with its two link tokens. */
async function meerasWedding(t: T, ownerLabel: "owner" | "host" = "host") {
  const eventId = await as(t, "Meera").mutation(api.events.create, {
    name: "Meera weds Rohan",
    eventType: "wedding",
    ownerLabel,
  });
  const links = await as(t, "Meera").query(api.people.links, { eventId });
  return { eventId, memberToken: links.member, viewerToken: links.viewer };
}

async function membershipOf(t: T, eventId: Id<"events">, name: string) {
  const people = await as(t, "Meera").query(api.people.list, { eventId });
  return people.people.find((p) => p.name === name)!;
}

async function peopleChanges(t: T, eventId: Id<"events">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
        .collect()
    ).filter((c) => c.op === "people"),
  );
}

async function membershipCount(t: T, eventId: Id<"events">) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect()
      ).length,
  );
}

describe("people.join", () => {
  it("a Member link makes a Member and a Viewer link a Viewer", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(t);
    expect(
      await as(t, "Rohan").mutation(api.people.join, { token: memberToken }),
    ).toEqual({
      kind: "joined",
      eventId,
      role: "member",
    });
    expect(
      await as(t, "Papa").mutation(api.people.join, { token: viewerToken }),
    ).toEqual({
      kind: "joined",
      eventId,
      role: "viewer",
    });
    expect((await membershipOf(t, eventId, "Papa")).role).toBe("viewer");
  });

  it("someone already in keeps their role, in either direction", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(t);
    await as(t, "Rohan").mutation(api.people.join, { token: memberToken });
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });
    expect(
      await as(t, "Rohan").mutation(api.people.join, { token: viewerToken }),
    ).toEqual({
      kind: "alreadyIn",
      eventId,
      role: "member",
    });
    expect(
      await as(t, "Papa").mutation(api.people.join, { token: memberToken }),
    ).toEqual({
      kind: "alreadyIn",
      eventId,
      role: "viewer",
    });
    expect(
      await as(t, "Meera").mutation(api.people.join, { token: viewerToken }),
    ).toEqual({
      kind: "alreadyIn",
      eventId,
      role: "owner",
    });
    expect(await membershipCount(t, eventId)).toBe(3);
  });

  it("a removed person gets the removed message, creates nothing and learns nothing", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    const aditi = await membershipOf(t, eventId, "Aditi");
    await as(t, "Meera").mutation(api.people.remove, {
      eventId,
      membershipId: aditi.membershipId,
    });

    expect(
      await as(t, "Aditi").mutation(api.people.join, { token: memberToken }),
    ).toEqual({
      kind: "refused",
      reason: "removed",
      message: "You were removed from this Event.",
    });
    expect(await membershipCount(t, eventId)).toBe(2);
    expect((await membershipOf(t, eventId, "Aditi")).status).toBe("removed");
  });

  it("a full Event (25 people, pending email invites included) refuses a newcomer", async () => {
    const t = setUp();
    const { eventId, viewerToken } = await meerasWedding(t);
    // Meera plus 22 joiners plus 2 pending email invites = 25.
    for (let i = 0; i < MAX_PEOPLE_PER_EVENT - 3; i++) {
      await as(t, `Guest${i}`).mutation(api.people.join, {
        token: viewerToken,
      });
    }
    await t.run(async (ctx) => {
      const owner = (await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .first())!;
      for (const email of ["isha@example.com", "kabir@example.com"]) {
        await ctx.db.insert("emailInvites", {
          eventId,
          email,
          role: "member",
          invitedBy: owner._id,
          createdAt: 0,
        });
      }
    });
    const before = await membershipCount(t, eventId);
    expect(
      await as(t, "Latecomer").mutation(api.people.join, {
        token: viewerToken,
      }),
    ).toEqual({
      kind: "refused",
      reason: "full",
      message: "This Event is full. Ask the Owner to make room.",
    });
    expect(await membershipCount(t, eventId)).toBe(before);
    // Someone already in still gets through a full Event.
    expect(
      await as(t, "Guest0").mutation(api.people.join, { token: viewerToken }),
    ).toMatchObject({ kind: "alreadyIn" });
  });

  it("is refused when signed out", async () => {
    const t = setUp();
    const { memberToken } = await meerasWedding(t);
    expect(
      await denialOf(t.mutation(api.people.join, { token: memberToken })),
    ).toMatchObject({
      kind: "AccessDenied",
      reason: "signedOut",
    });
  });

  it("an unknown token creates no membership and returns no Event data", async () => {
    const t = setUp();
    const { eventId } = await meerasWedding(t);
    const result = await as(t, "Rohan").mutation(api.people.join, {
      token: "not-a-token",
    });
    expect(result).toEqual({
      kind: "refused",
      reason: "invalid",
      message: expect.any(String),
    });
    expect(await membershipCount(t, eventId)).toBe(1);
  });

  it("writes a people change for the joiner", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    await as(t, "Rohan").mutation(api.people.join, { token: memberToken });
    const rohan = await membershipOf(t, eventId, "Rohan");
    const changes = await peopleChanges(t, eventId);
    expect(changes.at(-1)).toMatchObject({
      table: "memberships",
      docId: rohan.membershipId,
      actor: { kind: "member", membershipId: rohan.membershipId },
      before: null,
      after: { role: "member", status: "active" },
    });
  });
});

describe("people.resetLink", () => {
  it("stops the old token at once; the new one works; history names the link, not the token", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    await as(t, "Meera").mutation(api.people.resetLink, {
      eventId,
      role: "member",
    });
    const links = await as(t, "Meera").query(api.people.links, { eventId });
    expect(links.member).not.toBe(memberToken);

    const result = await as(t, "Rohan").mutation(api.people.join, {
      token: memberToken,
    });
    expect(result).toMatchObject({ kind: "refused", reason: "invalid" });
    expect(result).not.toHaveProperty("eventId");
    expect(await membershipCount(t, eventId)).toBe(1);

    expect(
      await as(t, "Rohan").mutation(api.people.join, { token: links.member }),
    ).toMatchObject({
      kind: "joined",
      role: "member",
    });
    const changes = await peopleChanges(t, eventId);
    const reset = changes.find((c) => c.after?.linkReset === "member");
    expect(reset).toBeDefined();
    expect(JSON.stringify(changes)).not.toContain(memberToken);
    expect(JSON.stringify(changes)).not.toContain(links.member);
  });

  it("only the Owner and Co-owners see or reset the links", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(t);
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });
    for (const who of ["Aditi", "Papa"]) {
      expect(
        await denialOf(as(t, who).query(api.people.links, { eventId })),
      ).toMatchObject({
        reason: "notAllowed",
      });
      expect(
        await denialOf(
          as(t, who).mutation(api.people.resetLink, {
            eventId,
            role: "viewer",
          }),
        ),
      ).toMatchObject({ reason: "notAllowed" });
    }
  });
});

describe("people.setRole", () => {
  async function weddingWithRohanAsCoOwner(t: T) {
    const w = await meerasWedding(t);
    for (const name of ["Rohan", "Aditi"]) {
      await as(t, name).mutation(api.people.join, { token: w.memberToken });
    }
    await as(t, "Papa").mutation(api.people.join, { token: w.viewerToken });
    const rohan = await membershipOf(t, w.eventId, "Rohan");
    await as(t, "Meera").mutation(api.people.setRole, {
      eventId: w.eventId,
      membershipId: rohan.membershipId,
      role: "coOwner",
    });
    return w;
  }

  it("a Co-owner can switch Member and Viewer", async () => {
    const t = setUp();
    const { eventId } = await weddingWithRohanAsCoOwner(t);
    const papa = await membershipOf(t, eventId, "Papa");
    await as(t, "Rohan").mutation(api.people.setRole, {
      eventId,
      membershipId: papa.membershipId,
      role: "member",
    });
    expect((await membershipOf(t, eventId, "Papa")).role).toBe("member");
    await as(t, "Rohan").mutation(api.people.setRole, {
      eventId,
      membershipId: papa.membershipId,
      role: "viewer",
    });
    expect((await membershipOf(t, eventId, "Papa")).role).toBe("viewer");
  });

  it("a Co-owner can't make a Co-owner or demote one", async () => {
    const t = setUp();
    const { eventId } = await weddingWithRohanAsCoOwner(t);
    const aditi = await membershipOf(t, eventId, "Aditi");
    expect(
      await denialOf(
        as(t, "Rohan").mutation(api.people.setRole, {
          eventId,
          membershipId: aditi.membershipId,
          role: "coOwner",
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
    const rohan = await membershipOf(t, eventId, "Rohan");
    expect(
      await denialOf(
        as(t, "Rohan").mutation(api.people.setRole, {
          eventId,
          membershipId: rohan.membershipId,
          role: "member",
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
    expect((await membershipOf(t, eventId, "Aditi")).role).toBe("member");
  });

  it("nobody can change the Owner", async () => {
    const t = setUp();
    const { eventId } = await weddingWithRohanAsCoOwner(t);
    const meera = await membershipOf(t, eventId, "Meera");
    for (const who of ["Meera", "Rohan"]) {
      expect(
        await denialOf(
          as(t, who).mutation(api.people.setRole, {
            eventId,
            membershipId: meera.membershipId,
            role: "member",
          }),
        ),
      ).toMatchObject({ reason: "notAllowed" });
    }
    expect((await membershipOf(t, eventId, "Meera")).role).toBe("owner");
  });

  it("a Member and a Viewer can't switch anyone", async () => {
    const t = setUp();
    const { eventId } = await weddingWithRohanAsCoOwner(t);
    const papa = await membershipOf(t, eventId, "Papa");
    const aditi = await membershipOf(t, eventId, "Aditi");
    expect(
      await denialOf(
        as(t, "Aditi").mutation(api.people.setRole, {
          eventId,
          membershipId: papa.membershipId,
          role: "member",
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
    expect(
      await denialOf(
        as(t, "Papa").mutation(api.people.setRole, {
          eventId,
          membershipId: aditi.membershipId,
          role: "viewer",
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
  });
});

describe("people.remove and people.unblock", () => {
  it("ends access at once, blocks, cancels queued runs in the same mutation; unblock lets them rejoin by link", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    await as(t, "Rohan").mutation(api.people.join, { token: memberToken });
    const aditi = await membershipOf(t, eventId, "Aditi");
    const rohan = await membershipOf(t, eventId, "Rohan");
    const run = (
      requestedBy: Id<"memberships">,
      status: "queued" | "running",
    ) =>
      t.run((ctx) =>
        ctx.db.insert("runs", {
          eventId,
          requestedBy,
          source: "chat",
          messageId: null,
          commentId: null,
          status,
          stoppedBy: null,
          model: "claude-sonnet-5-5",
          createdAt: 0,
          startedAt: null,
          endedAt: null,
        }),
      );
    const aditiQueued = await run(aditi.membershipId, "queued");
    const aditiRunning = await run(aditi.membershipId, "running");
    const rohanQueued = await run(rohan.membershipId, "queued");

    await as(t, "Meera").mutation(api.people.remove, {
      eventId,
      membershipId: aditi.membershipId,
    });

    const after = await t.run(async (ctx) => ({
      membership: await ctx.db.get("memberships", aditi.membershipId),
      aditiQueued: await ctx.db.get("runs", aditiQueued),
      aditiRunning: await ctx.db.get("runs", aditiRunning),
      rohanQueued: await ctx.db.get("runs", rohanQueued),
    }));
    expect(after.membership).toMatchObject({
      status: "removed",
      blocked: true,
    });
    expect(after.membership?.endedAt).toEqual(expect.any(Number));
    expect(after.aditiQueued?.status).toBe("cancelled");
    expect(after.aditiRunning?.status).toBe("running");
    expect(after.rohanQueued?.status).toBe("queued");
    expect(
      await denialOf(as(t, "Aditi").query(api.events.get, { eventId })),
    ).toMatchObject({
      kind: "AccessDenied",
      reason: "blocked",
    });

    await as(t, "Meera").mutation(api.people.unblock, {
      eventId,
      membershipId: aditi.membershipId,
    });
    expect(
      await as(t, "Aditi").mutation(api.people.join, { token: memberToken }),
    ).toEqual({
      kind: "joined",
      eventId,
      role: "member",
    });
    expect(await membershipOf(t, eventId, "Aditi")).toMatchObject({
      membershipId: aditi.membershipId,
      status: "active",
      blocked: false,
    });
  });

  it("a Co-owner can't remove another Co-owner, and nobody removes the Owner", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    for (const name of ["Rohan", "Kabir"]) {
      await as(t, name).mutation(api.people.join, { token: memberToken });
      const m = await membershipOf(t, eventId, name);
      await as(t, "Meera").mutation(api.people.setRole, {
        eventId,
        membershipId: m.membershipId,
        role: "coOwner",
      });
    }
    const kabir = await membershipOf(t, eventId, "Kabir");
    const meera = await membershipOf(t, eventId, "Meera");
    expect(
      await denialOf(
        as(t, "Rohan").mutation(api.people.remove, {
          eventId,
          membershipId: kabir.membershipId,
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
    for (const who of ["Rohan", "Meera"]) {
      expect(
        await denialOf(
          as(t, who).mutation(api.people.remove, {
            eventId,
            membershipId: meera.membershipId,
          }),
        ),
      ).toMatchObject({ reason: "notAllowed" });
    }
    // The Owner can remove a Co-owner.
    await as(t, "Meera").mutation(api.people.remove, {
      eventId,
      membershipId: kabir.membershipId,
    });
    expect((await membershipOf(t, eventId, "Kabir")).status).toBe("removed");
  });

  it("a Member can't remove or unblock anyone", async () => {
    const t = setUp();
    const { eventId, memberToken } = await meerasWedding(t);
    await as(t, "Rohan").mutation(api.people.join, { token: memberToken });
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    const aditi = await membershipOf(t, eventId, "Aditi");
    expect(
      await denialOf(
        as(t, "Rohan").mutation(api.people.remove, {
          eventId,
          membershipId: aditi.membershipId,
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
    await as(t, "Meera").mutation(api.people.remove, {
      eventId,
      membershipId: aditi.membershipId,
    });
    expect(
      await denialOf(
        as(t, "Rohan").mutation(api.people.unblock, {
          eventId,
          membershipId: aditi.membershipId,
        }),
      ),
    ).toMatchObject({ reason: "notAllowed" });
  });
});

describe("people.leave", () => {
  it("refuses the Owner until ownership moves", async () => {
    const t = setUp();
    const { eventId } = await meerasWedding(t);
    expect(
      await denialOf(as(t, "Meera").mutation(api.people.leave, { eventId })),
    ).toMatchObject({
      reason: "notAllowed",
    });
    expect((await membershipOf(t, eventId, "Meera")).status).toBe("active");
  });

  it("anyone else leaves, shows as left, and can rejoin by link", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(t);
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });
    await as(t, "Papa").mutation(api.people.leave, { eventId });
    expect(await membershipOf(t, eventId, "Papa")).toMatchObject({
      status: "left",
      blocked: false,
    });
    expect(await as(t, "Papa").query(api.events.listMine, {})).toEqual([]);
    expect(
      await as(t, "Papa").mutation(api.people.join, { token: memberToken }),
    ).toEqual({
      kind: "joined",
      eventId,
      role: "member",
    });
  });
});

describe("people.list", () => {
  it("shows the Blocked section to the Owner and Co-owners only", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(t);
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });
    const aditi = await membershipOf(t, eventId, "Aditi");
    await as(t, "Meera").mutation(api.people.remove, {
      eventId,
      membershipId: aditi.membershipId,
    });

    const forMeera = await as(t, "Meera").query(api.people.list, { eventId });
    expect(forMeera.people.find((p) => p.name === "Aditi")).toMatchObject({
      status: "removed",
      blocked: true,
    });
    const forPapa = await as(t, "Papa").query(api.people.list, { eventId });
    const aditiForPapa = forPapa.people.find((p) => p.name === "Aditi");
    expect(aditiForPapa).toMatchObject({ status: "left", blocked: false });
    expect(forPapa.ownerLabel).toBe("host");
    expect(forPapa.people.find((p) => p.isMe)?.name).toBe("Papa");
  });
});

describe("people.me", () => {
  it("is the caller's own role, or why they have none", async () => {
    const t = setUp();
    const { eventId, viewerToken } = await meerasWedding(t);
    expect(
      await as(t, "Meera").query(api.people.me, { eventId }),
    ).toMatchObject({
      status: "active",
      role: "owner",
      ownerLabel: "host",
    });
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });
    await as(t, "Papa").mutation(api.people.leave, { eventId });
    expect(await as(t, "Papa").query(api.people.me, { eventId })).toEqual({
      status: "denied",
      reason: "left",
    });
    expect(await t.query(api.people.me, { eventId })).toEqual({
      status: "denied",
      reason: "signedOut",
    });
  });
});

describe("worked example: the wedding in roles.md", () => {
  it("Meera hosts, Rohan becomes Co-host, removes Aditi, Meera unblocks her", async () => {
    const t = setUp();
    const { eventId, memberToken, viewerToken } = await meerasWedding(
      t,
      "host",
    );
    await as(t, "Rohan").mutation(api.people.join, { token: memberToken });
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    await as(t, "Papa").mutation(api.people.join, { token: viewerToken });

    const rohan = await membershipOf(t, eventId, "Rohan");
    await as(t, "Meera").mutation(api.people.setRole, {
      eventId,
      membershipId: rohan.membershipId,
      role: "coOwner",
    });
    let list = await as(t, "Rohan").query(api.people.list, { eventId });
    expect(list.ownerLabel).toBe("host");
    expect(list.people.map((p) => [p.name, p.role, p.status])).toEqual([
      ["Meera", "owner", "active"],
      ["Rohan", "coOwner", "active"],
      ["Aditi", "member", "active"],
      ["Papa", "viewer", "active"],
    ]);

    const aditi = await membershipOf(t, eventId, "Aditi");
    await as(t, "Rohan").mutation(api.people.remove, {
      eventId,
      membershipId: aditi.membershipId,
    });
    expect(
      await as(t, "Aditi").mutation(api.people.join, { token: memberToken }),
    ).toMatchObject({
      message: "You were removed from this Event.",
    });

    await as(t, "Meera").mutation(api.people.unblock, {
      eventId,
      membershipId: aditi.membershipId,
    });
    await as(t, "Aditi").mutation(api.people.join, { token: memberToken });
    list = await as(t, "Meera").query(api.people.list, { eventId });
    expect(list.people.find((p) => p.name === "Aditi")).toMatchObject({
      role: "member",
      status: "active",
      blocked: false,
    });

    // Every people change is in the history: Meera's own Owner membership,
    // three joins, the promotion, the removal, the unblock and the rejoin.
    const changes = await peopleChanges(t, eventId);
    expect(changes).toHaveLength(8);
  });
});
