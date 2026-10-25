/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { COMMENT_MAX, MAX_COMMENTS_PER_ITEM } from "./comments";
import {
  identityFor,
  insertEvent,
  newTest,
  seedMembership,
} from "./lib/test.helpers";

type Role = Doc<"memberships">["role"];

async function insertSection(ctx: MutationCtx, eventId: Id<"events">) {
  return await ctx.db.insert("sections", {
    eventId,
    kind: "notes",
    name: "Notes",
    frame: { x: 0, y: 0, w: 1200, h: 800 },
    order: 0,
    version: 1,
    deletedAt: null,
  });
}

async function insertNote(
  ctx: MutationCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
): Promise<Id<"items">> {
  const sectionId = await insertSection(ctx, eventId);
  return await ctx.db.insert("items", {
    eventId,
    sectionId,
    kind: "note",
    position: { x: 0, y: 0 },
    size: { w: 300, h: 200 },
    functionKey: null,
    data: { text: "Book the hall", citations: [] },
    createdBy: { kind: "member", membershipId },
    version: 1,
    deletedAt: null,
  });
}

async function insertChecklistEntry(
  ctx: MutationCtx,
  eventId: Id<"events">,
  itemId: Id<"items">,
  membershipId: Id<"memberships">,
): Promise<Id<"entries">> {
  return await ctx.db.insert("entries", {
    eventId,
    itemId,
    kind: "checklist",
    order: 0,
    functionKey: null,
    assumed: [],
    createdBy: { kind: "member", membershipId },
    version: 1,
    deletedAt: null,
    fields: {
      vendorCategory: "caterer",
      freeLabel: null,
      functionKeys: [],
      bookByEntryId: null,
      budgetEntryIds: [],
    },
  });
}

/**
 * Meera (Owner) and Papa in the given role in one Event, with a Note Item and
 * one checklist Entry on another Item.
 */
async function setUp(papaRole: Role = "viewer") {
  const t = newTest();
  const ids = await t.run(async (ctx) => {
    const meera = await seedMembership(ctx, {
      clerkId: "meera",
      role: "owner",
    });
    const papa = await seedMembership(ctx, {
      clerkId: "papa",
      role: papaRole,
      eventId: meera.eventId,
    });
    const itemId = await insertNote(ctx, meera.eventId, meera.membershipId);
    const checklistId = await insertNote(
      ctx,
      meera.eventId,
      meera.membershipId,
    );
    const entryId = await insertChecklistEntry(
      ctx,
      meera.eventId,
      checklistId,
      meera.membershipId,
    );
    return {
      meera,
      papa,
      eventId: meera.eventId,
      itemId,
      checklistId,
      entryId,
    };
  });
  const asMeera = t.withIdentity(identityFor("meera"));
  const asPapa = t.withIdentity(identityFor("papa"));
  return { t, ...ids, asMeera, asPapa };
}

function refusal(problem: string) {
  return expect.objectContaining({
    data: expect.objectContaining({ kind: "CommentRefused", problem }),
  });
}

function denied(reason: string) {
  return expect.objectContaining({
    data: expect.objectContaining({ kind: "AccessDenied", reason }),
  });
}

describe("a Viewer and their own Comments", () => {
  it("can add a Comment on an Item and see it with their name", async () => {
    const { asPapa, itemId } = await setUp("viewer");
    await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Is this hall big enough for our relatives from Kota?",
      rootId: null,
    });
    const comments = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      body: "Is this hall big enough for our relatives from Kota?",
      target: { kind: "item", itemId },
      rootId: null,
      resolved: false,
      editedAt: null,
      authorName: "papa",
      byYou: true,
      canEdit: true,
      canResolve: true,
    });
  });

  it("can edit their own Comment", async () => {
    const { asPapa, itemId } = await setUp("viewer");
    const commentId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Is this hall big enogh?",
      rootId: null,
    });
    await asPapa.mutation(api.comments.edit, {
      commentId,
      body: "Is this hall big enough?",
    });
    const [comment] = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comment!.body).toBe("Is this hall big enough?");
    expect(comment!.editedAt).toEqual(expect.any(Number));
  });

  it("can resolve their own Comment and open it again", async () => {
    const { asPapa, itemId } = await setUp("viewer");
    const commentId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Is the hall booked?",
      rootId: null,
    });
    await asPapa.mutation(api.comments.resolve, { commentId, resolved: true });
    let [comment] = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comment!.resolved).toBe(true);
    await asPapa.mutation(api.comments.resolve, { commentId, resolved: false });
    [comment] = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comment!.resolved).toBe(false);
  });

  it("can't edit or resolve someone else's Comment", async () => {
    const { asMeera, asPapa, itemId } = await setUp("viewer");
    const commentId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Hall is booked for the sangeet.",
      rootId: null,
    });
    await expect(
      asPapa.mutation(api.comments.edit, { commentId, body: "Not booked" }),
    ).rejects.toThrow();
    await expect(
      asPapa.mutation(api.comments.edit, { commentId, body: "Not booked" }),
    ).rejects.toEqual(refusal("notYours"));
    await expect(
      asPapa.mutation(api.comments.resolve, { commentId, resolved: true }),
    ).rejects.toEqual(refusal("notYours"));
    const [comment] = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comment).toMatchObject({
      body: "Hall is booked for the sangeet.",
      resolved: false,
      byYou: false,
      canEdit: false,
      canResolve: false,
    });
  });

  it("an Owner can't edit a Viewer's Comment either", async () => {
    const { asMeera, asPapa, itemId } = await setUp("viewer");
    const commentId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Too small?",
      rootId: null,
    });
    await expect(
      asMeera.mutation(api.comments.edit, { commentId, body: "Fine" }),
    ).rejects.toEqual(refusal("notYours"));
  });
});

describe("targets", () => {
  it("refuses a passage target until X10", async () => {
    const { asMeera, itemId } = await setUp();
    await expect(
      asMeera.mutation(api.comments.add, {
        target: {
          kind: "passage",
          itemId,
          entryId: null,
          field: "text",
          start: 0,
          end: 4,
          quote: "Book",
          textChanged: false,
        },
        body: "Which hall?",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("passage"));
  });

  it("adds a Comment on an Entry, listed under the Entry's Item", async () => {
    const { asPapa, checklistId, entryId } = await setUp("viewer");
    await asPapa.mutation(api.comments.add, {
      target: { kind: "entry", itemId: checklistId, entryId },
      body: "Which caterer did we call?",
      rootId: null,
    });
    const comments = await asPapa.query(api.comments.listForItem, {
      itemId: checklistId,
    });
    expect(comments.map((c) => c.target)).toEqual([
      { kind: "entry", itemId: checklistId, entryId },
    ]);
  });

  it("names the Entry each Comment is on, so the sheet can say which (review of #91)", async () => {
    const { t, asPapa, asMeera, checklistId, entryId, eventId, meera } =
      await setUp("viewer");
    const dhol = await t.run(async (ctx) => {
      const id = await insertChecklistEntry(
        ctx,
        eventId,
        checklistId,
        meera.membershipId,
      );
      await ctx.db.patch("entries", id, {
        fields: {
          vendorCategory: null,
          freeLabel: "Dhol player",
          functionKeys: [],
          bookByEntryId: null,
          budgetEntryIds: [],
        },
      });
      return id;
    });
    for (const [target, body] of [
      [{ kind: "entry" as const, itemId: checklistId, entryId }, "Called?"],
      [{ kind: "entry" as const, itemId: checklistId, entryId: dhol }, "Who?"],
      [{ kind: "item" as const, itemId: checklistId }, "All booked?"],
    ] as const) {
      await asPapa.mutation(api.comments.add, { target, body, rootId: null });
    }
    const comments = await asMeera.query(api.comments.listForItem, {
      itemId: checklistId,
    });
    expect(comments.map((c) => [c.body, c.entryLabel])).toEqual([
      ["Called?", "Caterer"],
      ["Who?", "Dhol player"],
      ["All booked?", null],
    ]);
  });

  it("refuses an Entry paired with another Item", async () => {
    const { asMeera, itemId, entryId } = await setUp();
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "entry", itemId, entryId },
        body: "Mismatch",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("noTarget"));
  });

  it("refuses a deleted Item", async () => {
    const { t, asMeera, itemId } = await setUp();
    await t.run(async (ctx) => {
      await ctx.db.patch("items", itemId, { deletedAt: 5 });
    });
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "Gone?",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("noTarget"));
  });

  it("refuses someone from another Event, in add and in listForItem", async () => {
    const { t, itemId } = await setUp();
    await t.run(async (ctx) => {
      const otherEvent = await insertEvent(ctx, "Other");
      await seedMembership(ctx, {
        clerkId: "stranger",
        role: "owner",
        eventId: otherEvent,
      });
    });
    const asStranger = t.withIdentity(identityFor("stranger"));
    await expect(
      asStranger.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "Hello",
        rootId: null,
      }),
    ).rejects.toEqual(denied("notAMember"));
    await expect(
      asStranger.query(api.comments.listForItem, { itemId }),
    ).rejects.toEqual(denied("notAMember"));
  });
});

describe("bodies", () => {
  it("refuses an empty Comment", async () => {
    const { asMeera, itemId } = await setUp();
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "   ",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("empty"));
  });

  it("counts Hindi by the characters a person sees", async () => {
    const { asMeera, itemId } = await setUp();
    // "मेहंदी" is 3 characters as read but 6 code points; "कल" is 2.
    const fits = "मेहंदी".repeat((COMMENT_MAX - 2) / 3) + "कल";
    expect(fits.length).toBeGreaterThan(COMMENT_MAX);
    await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: fits,
      rootId: null,
    });
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: fits + "क",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("tooLong"));
  });

  it("trims the body it stores", async () => {
    const { asMeera, itemId } = await setUp();
    await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "  Call the caterer  ",
      rootId: null,
    });
    const [comment] = await asMeera.query(api.comments.listForItem, {
      itemId,
    });
    expect(comment!.body).toBe("Call the caterer");
  });
});

describe("threads", () => {
  it("replies join the root's thread on the same target", async () => {
    const { asMeera, asPapa, itemId } = await setUp("viewer");
    const rootId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Is this hall big enough?",
      rootId: null,
    });
    await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "It seats 300.",
      rootId,
    });
    const comments = await asPapa.query(api.comments.listForItem, { itemId });
    expect(comments.map((c) => [c.body, c.rootId])).toEqual([
      ["Is this hall big enough?", null],
      ["It seats 300.", rootId],
    ]);
  });

  it("refuses a reply to a reply, or on another target", async () => {
    const { asMeera, itemId, checklistId, entryId } = await setUp();
    const rootId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Root",
      rootId: null,
    });
    const replyId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Reply",
      rootId,
    });
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "Nested",
        rootId: replyId,
      }),
    ).rejects.toEqual(refusal("badReply"));
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "entry", itemId: checklistId, entryId },
        body: "Elsewhere",
        rootId,
      }),
    ).rejects.toEqual(refusal("badReply"));
  });

  it("only a thread's first Comment can be resolved", async () => {
    const { asMeera, itemId } = await setUp();
    const rootId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Root",
      rootId: null,
    });
    const replyId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Reply",
      rootId,
    });
    await expect(
      asMeera.mutation(api.comments.resolve, {
        commentId: replyId,
        resolved: true,
      }),
    ).rejects.toEqual(refusal("notRoot"));
  });
});

describe("people who left", () => {
  it('shows a Comment by someone who left with "(left)"', async () => {
    const { t, asMeera, asPapa, papa, itemId } = await setUp("member");
    await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Is this hall big enough?",
      rootId: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("memberships", papa.membershipId, {
        status: "left",
        endedAt: 10,
      });
    });
    const [comment] = await asMeera.query(api.comments.listForItem, {
      itemId,
    });
    expect(comment!.authorName).toBe("papa (left)");
  });

  it("refuses a removed person's add, edit and listing", async () => {
    const { t, asPapa, papa, itemId } = await setUp("member");
    const commentId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Mine",
      rootId: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("memberships", papa.membershipId, {
        status: "removed",
        blocked: true,
        endedAt: 10,
      });
    });
    await expect(
      asPapa.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "Again",
        rootId: null,
      }),
    ).rejects.toEqual(denied("blocked"));
    await expect(
      asPapa.mutation(api.comments.edit, { commentId, body: "Edited" }),
    ).rejects.toEqual(denied("blocked"));
    await expect(
      asPapa.query(api.comments.listForItem, { itemId }),
    ).rejects.toEqual(denied("blocked"));
  });
});

describe("review fixes", () => {
  it("drops Comments on a deleted Entry from the list, and keeps the Item's", async () => {
    const { t, asPapa, asMeera, checklistId, entryId } = await setUp("viewer");
    const rootId = await asPapa.mutation(api.comments.add, {
      target: { kind: "entry", itemId: checklistId, entryId },
      body: "Which caterer did we call?",
      rootId: null,
    });
    await asMeera.mutation(api.comments.add, {
      target: { kind: "entry", itemId: checklistId, entryId },
      body: "Shree Caterers",
      rootId,
    });
    await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId: checklistId },
      body: "Is the checklist done?",
      rootId: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("entries", entryId, { deletedAt: 5 });
    });
    const listed = await asPapa.query(api.comments.listForItem, {
      itemId: checklistId,
    });
    expect(listed.map((c) => c.body)).toEqual(["Is the checklist done?"]);
  });

  it("brings an Entry's Comments back when the Entry is restored", async () => {
    const { t, asPapa, checklistId, entryId } = await setUp("viewer");
    await asPapa.mutation(api.comments.add, {
      target: { kind: "entry", itemId: checklistId, entryId },
      body: "Which caterer?",
      rootId: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("entries", entryId, { deletedAt: 5 });
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("entries", entryId, { deletedAt: null });
    });
    const listed = await asPapa.query(api.comments.listForItem, {
      itemId: checklistId,
    });
    expect(listed.map((c) => c.body)).toEqual(["Which caterer?"]);
  });

  it("refuses a body of only invisible characters as empty", async () => {
    const { asMeera, itemId } = await setUp();
    for (const body of ["​", "‌‍", "﻿", " ⁠ ​ "])
      await expect(
        asMeera.mutation(api.comments.add, {
          target: { kind: "item", itemId },
          body,
          rootId: null,
        }),
      ).rejects.toEqual(refusal("empty"));
  });

  it("keeps the joiners Hindi needs inside real text", async () => {
    const { asMeera, itemId } = await setUp();
    // "क्‍ष" has a zero-width joiner and "किसी‌ने" a zero-width non-joiner.
    for (const body of ["क्‍ष", "किसी‌ने"])
      await asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body,
        rootId: null,
      });
    const listed = await asMeera.query(api.comments.listForItem, { itemId });
    expect(listed.map((c) => c.body)).toEqual(["क्‍ष", "किसी‌ने"]);
  });

  it("refuses an edit to only invisible characters", async () => {
    const { asMeera, itemId } = await setUp();
    const commentId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Call the caterer",
      rootId: null,
    });
    await expect(
      asMeera.mutation(api.comments.edit, { commentId, body: "​" }),
    ).rejects.toEqual(refusal("empty"));
  });

  it("refuses the 501st Comment on one Item", async () => {
    const { t, asMeera, meera, eventId, itemId } = await setUp();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_COMMENTS_PER_ITEM; i++)
        await ctx.db.insert("comments", {
          eventId,
          itemId,
          target: { kind: "item", itemId },
          rootId: null,
          author: { kind: "member", membershipId: meera.membershipId },
          body: `#${i}`,
          resolved: true,
          createdAt: i,
          editedAt: null,
        });
    });
    await expect(
      asMeera.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "One more",
        rootId: null,
      }),
    ).rejects.toEqual(refusal("tooMany"));
  });

  it("an Owner can't resolve a Viewer's thread", async () => {
    const { asMeera, asPapa, itemId } = await setUp("viewer");
    const commentId = await asPapa.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Too small?",
      rootId: null,
    });
    await expect(
      asMeera.mutation(api.comments.resolve, { commentId, resolved: true }),
    ).rejects.toEqual(refusal("notYours"));
  });

  it("refuses someone from another Event editing or resolving by ID", async () => {
    const { t, asMeera, itemId } = await setUp();
    const commentId = await asMeera.mutation(api.comments.add, {
      target: { kind: "item", itemId },
      body: "Mine",
      rootId: null,
    });
    await t.run(async (ctx) => {
      await seedMembership(ctx, { clerkId: "stranger", role: "owner" });
    });
    const asStranger = t.withIdentity(identityFor("stranger"));
    await expect(
      asStranger.mutation(api.comments.edit, { commentId, body: "Theirs" }),
    ).rejects.toEqual(denied("notAMember"));
    await expect(
      asStranger.mutation(api.comments.resolve, { commentId, resolved: true }),
    ).rejects.toEqual(denied("notAMember"));
  });

  it("refuses someone who left adding a Comment", async () => {
    const { t, asPapa, papa, itemId } = await setUp("member");
    await t.run(async (ctx) => {
      await ctx.db.patch("memberships", papa.membershipId, {
        status: "left",
        endedAt: 10,
      });
    });
    await expect(
      asPapa.mutation(api.comments.add, {
        target: { kind: "item", itemId },
        body: "Back?",
        rootId: null,
      }),
    ).rejects.toEqual(denied("left"));
  });
});
