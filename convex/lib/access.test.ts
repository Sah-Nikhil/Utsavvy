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

describe("requireIdentity keeps the users row in step with Clerk", () => {
  const rohan = {
    subject: "user_rohan",
    issuer: "https://clerk.example",
    tokenIdentifier: "https://clerk.example|user_rohan",
    name: "Rohan",
    email: "rohan@example.com",
    pictureUrl: "https://img.clerk.com/rohan-1",
  };

  it("stores the tokenIdentifier and Clerk ID on the first call", async () => {
    const t = newTest();
    const user = await t.withIdentity(rohan).run((ctx) => requireIdentity(ctx));
    expect(user).toMatchObject({
      clerkId: "user_rohan",
      tokenIdentifier: "https://clerk.example|user_rohan",
    });
  });

  it("updates name, email (lowercased) and picture when the claims change", async () => {
    const t = newTest();
    const first = await t
      .withIdentity(rohan)
      .run((ctx) => requireIdentity(ctx));
    const changed = await t
      .withIdentity({
        ...rohan,
        name: "Rohan Sharma",
        email: "Rohan.Sharma@NewMail.example",
        pictureUrl: "https://img.clerk.com/rohan-2",
      })
      .run((ctx) => requireIdentity(ctx));
    expect(changed._id).toBe(first._id);
    expect(changed).toMatchObject({
      name: "Rohan Sharma",
      email: "rohan.sharma@newmail.example",
      imageUrl: "https://img.clerk.com/rohan-2",
    });
    const stored = await t.run((ctx) => ctx.db.get("users", first._id));
    expect(stored?.email).toBe("rohan.sharma@newmail.example");
  });

  it("links a row made ahead by Clerk ID (a demo judge) on that person's first sign-in", async () => {
    const t = newTest();
    const premade = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_rohan",
        name: "Rohan (judge)",
        email: "rohan@example.com",
        imageUrl: null,
        mobilePointing: null,
        keepDontReplyOn: false,
      }),
    );
    const user = await t.withIdentity(rohan).run((ctx) => requireIdentity(ctx));
    expect(user._id).toBe(premade);
    expect(user.tokenIdentifier).toBe("https://clerk.example|user_rohan");
    const all = await t.run((ctx) => ctx.db.query("users").collect());
    expect(all).toHaveLength(1);
  });
});
