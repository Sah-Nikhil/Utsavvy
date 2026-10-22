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
