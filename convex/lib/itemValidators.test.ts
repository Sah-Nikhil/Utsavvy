import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../_generated/server";
import { newTest, seedMembership } from "./test.helpers";

// The `items` validator is the shared contract later slices write through, so
// invalid states must be refused at the schema, not left to each slice.

async function insertInspiration(
  ctx: MutationCtx,
  source: Record<string, unknown>,
  seen: unknown = null,
) {
  const { eventId, membershipId } = await seedMembership(ctx, {
    clerkId: "meera",
  });
  const sectionId = await ctx.db.insert("sections", {
    eventId,
    kind: "inspirations",
    name: "Inspirations",
    frame: { x: 0, y: 0, w: 400, h: 300 },
    order: 2,
    version: 1,
    deletedAt: null,
  });
  return await ctx.db.insert("items", {
    eventId,
    sectionId,
    kind: "inspiration",
    position: { x: 0, y: 0 },
    size: null,
    functionKey: null,
    createdBy: { kind: "member", membershipId },
    version: 1,
    deletedAt: null,
    data: { source, addedBy: membershipId, memberNote: null, seen },
  } as never);
}

const seen = {
  description: "Marigold garlands over a pink mandap",
  palette: ["rgb(242 169 0)"],
  decorKeywords: ["marigold"],
};

describe("Reference validator", () => {
  it.each([
    ["pinterest", "pin"],
    ["pinterest", "board"],
    ["pinterest", "pinShort"],
    ["instagram", "post"],
    ["instagram", "reel"],
  ])("accepts a %s %s", async (platform, urlKind) => {
    const t = newTest();
    await expect(
      t.run((ctx) =>
        insertInspiration(ctx, {
          kind: "reference",
          platform,
          urlKind,
          url: "https://example.com/x",
        }),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ["instagram", "board"],
    ["instagram", "pin"],
    ["instagram", "pinShort"],
    ["pinterest", "reel"],
    ["pinterest", "post"],
  ])("refuses a %s %s", async (platform, urlKind) => {
    const t = newTest();
    await expect(
      t.run((ctx) =>
        insertInspiration(ctx, {
          kind: "reference",
          platform,
          urlKind,
          url: "https://example.com/x",
        }),
      ),
    ).rejects.toThrow(/Validator|validator|does not match/);
  });

  it("refuses a Reference with something the Assistant saw", async () => {
    const t = newTest();
    await expect(
      t.run((ctx) =>
        insertInspiration(
          ctx,
          {
            kind: "reference",
            platform: "pinterest",
            urlKind: "pin",
            url: "https://pin.it/abc",
          },
          seen,
        ),
      ),
    ).rejects.toThrow(/Validator|validator|does not match/);
  });

  it("still lets a stock photo carry what the Assistant saw", async () => {
    const t = newTest();
    await expect(
      t.run((ctx) =>
        insertInspiration(
          ctx,
          {
            kind: "pexels",
            pexelsId: 1,
            localPath: "/inspirations/x.jpg",
            photographer: "A",
            photographerUrl: "https://www.pexels.com/@a",
            pageUrl: "https://www.pexels.com/photo/1",
            alt: "A mandap",
            tags: [],
          },
          seen,
        ),
      ),
    ).resolves.toBeDefined();
  });
});
