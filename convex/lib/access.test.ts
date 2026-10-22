import { describe, expect, it } from "vitest";
import { requireAccess, requireIdentity } from "./access";
import { identityFor, newTest, seedMembership } from "./test.helpers";

describe("requireAccess", () => {
  it.each([
    {
      who: "a member who left",
      status: "left" as const,
      blocked: false,
      reason: "left",
    },
    {
      who: "a removed member",
      status: "removed" as const,
      blocked: false,
      reason: "removed",
    },
    {
      who: "a blocked member",
      status: "removed" as const,
      blocked: true,
      reason: "blocked",
    },
  ])("refuses $who", async ({ status, blocked, reason }) => {
    const t = newTest();
    const { eventId } = await t.run((ctx) =>
      seedMembership(ctx, {
        clerkId: "aditi",
        role: "member",
        status,
        blocked,
      }),
    );
    const asAditi = t.withIdentity(identityFor("aditi"));
    await expect(
      asAditi.run((ctx) => requireAccess(ctx, eventId, "canvas.view")),
    ).rejects.toMatchObject({ data: { kind: "AccessDenied", reason } });
  });

  it("lets an active Viewer see the Canvas but not edit it", async () => {
    const t = newTest();
    const { eventId, membershipId } = await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "papa", role: "viewer" }),
    );
    const asPapa = t.withIdentity(identityFor("papa"));

    const access = await asPapa.run((ctx) =>
      requireAccess(ctx, eventId, "canvas.view"),
    );
    expect(access.membership._id).toBe(membershipId);
    expect(access.user.clerkId).toBe("papa");

    await expect(
      asPapa.run((ctx) => requireAccess(ctx, eventId, "canvas.edit")),
    ).rejects.toMatchObject({
      data: { kind: "AccessDenied", reason: "notAllowed" },
    });
  });

  it("refuses someone with no membership in the Event", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) =>
      seedMembership(ctx, { clerkId: "meera" }),
    );
    await t.run((ctx) => seedMembership(ctx, { clerkId: "stranger" }));
    await expect(
      t
        .withIdentity(identityFor("stranger"))
        .run((ctx) => requireAccess(ctx, eventId, "canvas.view")),
    ).rejects.toMatchObject({
      data: { kind: "AccessDenied", reason: "notAMember" },
    });
  });
});

describe("requireIdentity", () => {
  it("refuses a signed-out caller", async () => {
    const t = newTest();
    await expect(t.run((ctx) => requireIdentity(ctx))).rejects.toMatchObject({
      data: { kind: "AccessDenied", reason: "signedOut" },
    });
  });

  it("returns the signed-in caller's users row, creating it on the first call", async () => {
    const t = newTest();
    const asRohan = t.withIdentity({
      subject: "user_rohan",
      name: "Rohan",
      email: "Rohan@Example.com",
    });
    const first = await asRohan.run((ctx) => requireIdentity(ctx));
    const second = await asRohan.run((ctx) => requireIdentity(ctx));
    expect(first._id).toBe(second._id);
    expect(first).toMatchObject({
      clerkId: "user_rohan",
      name: "Rohan",
      email: "rohan@example.com",
    });
  });
});
