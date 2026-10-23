/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { createStartingSections } from "./canvas";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

type Role = Doc<"memberships">["role"];
type T = ReturnType<typeof newTest>;

async function setUp(role: Role = "member") {
  const t = newTest();
  const ids = await t.run(async (ctx) => {
    const { eventId, membershipId } = await seedMembership(ctx, {
      clerkId: "meera",
      role,
    });
    const sections = await createStartingSections(ctx, eventId, {
      kind: "member",
      membershipId,
    });
    await ctx.db.insert("eventFunctions", {
      eventId,
      key: "mehendi",
      name: "Mehendi",
      date: null,
      guests: null,
      assumed: [],
      order: 0,
      version: 1,
    });
    return { eventId, membershipId, sections };
  });
  return { t, ids, meera: t.withIdentity(identityFor("meera")) };
}

const item = (t: T, id: Id<"items">) =>
  t.run(async (ctx) => (await ctx.db.get("items", id))!);

describe("notes.add", () => {
  it("places a Note in free space in the Notes Section, in the same write", async () => {
    const { t, ids, meera } = await setUp();
    const first = await meera.mutation(api.notes.add, {
      eventId: ids.eventId,
      text: "मेहंदी के लिए ₹2,40,000 रखें",
      functionKey: "mehendi",
    });
    const second = await meera.mutation(api.notes.add, {
      eventId: ids.eventId,
      text: "Ask about parking",
      functionKey: null,
    });
    const a = await item(t, first);
    const b = await item(t, second);
    expect(a).toMatchObject({
      kind: "note",
      sectionId: ids.sections.notes,
      functionKey: "mehendi",
      data: { text: "मेहंदी के लिए ₹2,40,000 रखें", citations: [] },
      createdBy: { kind: "member", membershipId: ids.membershipId },
    });
    expect(b.sectionId).toBe(ids.sections.notes);
    expect(b.position).not.toEqual(a.position);
  });

  it("refuses an empty Note and a Viewer", async () => {
    const { ids, meera } = await setUp();
    await expect(
      meera.mutation(api.notes.add, {
        eventId: ids.eventId,
        text: "  ",
        functionKey: null,
      }),
    ).rejects.toThrow(/InvalidInput/);
    const viewer = await setUp("viewer");
    await expect(
      viewer.meera.mutation(api.notes.add, {
        eventId: viewer.ids.eventId,
        text: "Hello",
        functionKey: null,
      }),
    ).rejects.toThrow(/AccessDenied/);
  });
});

describe("notes.update", () => {
  it("changes the text and keeps its citations, with history", async () => {
    const { t, ids, meera } = await setUp();
    const id = await meera.mutation(api.notes.add, {
      eventId: ids.eventId,
      text: "Ask about parking",
      functionKey: null,
    });
    await t.run((ctx) =>
      ctx.db.patch("items", id, {
        data: {
          text: "Ask about parking",
          citations: [{ url: "https://example.in", title: "Example" }],
        },
      }),
    );
    await meera.mutation(api.notes.update, {
      itemId: id,
      text: "Ask about parking for 80 cars",
    });
    const after = await item(t, id);
    expect(after.data).toEqual({
      text: "Ask about parking for 80 cars",
      citations: [{ url: "https://example.in", title: "Example" }],
    });
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", id))
        .collect(),
    );
    expect(changes.map((c) => c.op)).toEqual(["create", "update"]);
  });

  it("refuses an Item that isn't a Note", async () => {
    const { t, ids, meera } = await setUp();
    const suggestion = await t.run((ctx) =>
      ctx.db.insert("items", {
        eventId: ids.eventId,
        sectionId: ids.sections.notes,
        kind: "suggestion",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: {
          title: "x",
          body: "y",
          costCategory: null,
          quantity: null,
          estimate: null,
          status: "open",
        },
        createdBy: { kind: "member", membershipId: ids.membershipId },
        version: 1,
        deletedAt: null,
      }),
    );
    await expect(
      meera.mutation(api.notes.update, { itemId: suggestion, text: "z" }),
    ).rejects.toThrow(/InvalidInput/);
  });
});
