import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { newTest } from "./lib/test.helpers";

describe("users.me", () => {
  it("is null when signed out", async () => {
    const t = newTest();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  it("is null before ensureMe, then the person's own profile", async () => {
    const t = newTest();
    const asRohan = t.withIdentity({
      subject: "user_rohan",
      name: "Rohan",
      email: "Rohan@Example.com",
    });
    expect(await asRohan.query(api.users.me, {})).toBeNull();
    const id = await asRohan.mutation(api.users.ensureMe, {});
    expect(await asRohan.query(api.users.me, {})).toEqual({
      _id: id,
      name: "Rohan",
      email: "rohan@example.com",
      imageUrl: null,
    });
  });
});

// A person's name is shown to everyone in their Events, so it must never be
// their full email address (#83).
describe("users.ensureMe display name", () => {
  async function nameAfterSignIn(
    identity: { subject: string; name?: string; email?: string },
    t = newTest(),
  ) {
    const as = t.withIdentity(identity);
    await as.mutation(api.users.ensureMe, {});
    return (await as.query(api.users.me, {}))?.name;
  }

  it("uses the part before @ when Clerk has no name", async () => {
    expect(
      await nameAfterSignIn({
        subject: "user_papa",
        email: "Papa.Sharma@Example.com",
      }),
    ).toBe("Papa.Sharma");
  });

  it("treats a blank name as no name", async () => {
    expect(
      await nameAfterSignIn({
        subject: "user_blank",
        name: "  ",
        email: "aditi@example.com",
      }),
    ).toBe("aditi");
  });

  it("is Someone with neither a name nor an email", async () => {
    expect(await nameAfterSignIn({ subject: "user_nobody" })).toBe("Someone");
  });

  it("replaces a full email stored as the name before this rule", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_old",
        name: "old.friend@example.com",
        email: "old.friend@example.com",
        imageUrl: null,
        mobilePointing: null,
        keepDontReplyOn: false,
      });
    });
    expect(
      await nameAfterSignIn(
        { subject: "user_old", email: "old.friend@example.com" },
        t,
      ),
    ).toBe("old.friend");
  });
});
