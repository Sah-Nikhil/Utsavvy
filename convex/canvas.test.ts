import { describe, expect, it } from "vitest";
import { STARTING_SECTIONS } from "../lib/canvas/starting";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections, placeNewItem } from "./canvas";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";

type Role = Doc<"memberships">["role"];

/** An Event with its four starting Sections and Meera in the given role. */
async function setUp(ctx: MutationCtx, role: Role = "member") {
  const { eventId, membershipId } = await seedMembership(ctx, {
    clerkId: "meera",
    role,
  });
  const actor = { kind: "member" as const, membershipId };
  const sections = await createStartingSections(ctx, eventId, actor);
  return { eventId, membershipId, actor, sections };
}

async function insertNote(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    sectionId: Id<"sections">;
    membershipId: Id<"memberships">;
    x: number;
    y: number;
  },
): Promise<Id<"items">> {
  return await ctx.db.insert("items", {
    eventId: args.eventId,
    sectionId: args.sectionId,
    kind: "note",
    position: { x: args.x, y: args.y },
    size: { w: 300, h: 200 },
    functionKey: null,
    data: { text: "Ask the pandit", citations: [] },
    createdBy: { kind: "member", membershipId: args.membershipId },
    version: 1,
    deletedAt: null,
  });
}

describe("createStartingSections", () => {
  it("makes the four starting Sections at their starting frames", async () => {
    const t = newTest();
    const sections = await t.run(async (ctx) => {
      const { eventId } = await setUp(ctx);
      return await ctx.db
        .query("sections")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
    });
    expect(
      sections.map((s) => [s.kind, s.name, s.order, s.frame]).sort(),
    ).toEqual(
      STARTING_SECTIONS.map((s) => [s.kind, s.name, s.order, s.frame]).sort(),
    );
  });
});

describe("renameSection", () => {
  it("lets a Member rename a starting Section", async () => {
    const t = newTest();
    const { sections } = await t.run((ctx) => setUp(ctx));
    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.canvas.renameSection, {
        sectionId: sections.notes,
        name: "  Ideas  for the  haldi ",
      });
    const section = await t.run((ctx) =>
      ctx.db.get("sections", sections.notes),
    );
    expect(section?.name).toBe("Ideas for the haldi");
    expect(section?.version).toBe(2);
  });

  it("refuses a Member renaming a starting Section when renaming is blocked", async () => {
    const t = newTest();
    const { sections } = await t.run(async (ctx) => {
      const setup = await setUp(ctx);
      await ctx.db.patch("events", setup.eventId, {
        startingSectionRenameBlocked: true,
      });
      return setup;
    });
    await expect(
      t.withIdentity(identityFor("meera")).mutation(api.canvas.renameSection, {
        sectionId: sections.notes,
        name: "Ideas",
      }),
    ).rejects.toThrow(/AccessDenied/);
  });

  it("still lets a Co-owner rename a starting Section when renaming is blocked", async () => {
    const t = newTest();
    const { sections } = await t.run(async (ctx) => {
      const setup = await setUp(ctx, "coOwner");
      await ctx.db.patch("events", setup.eventId, {
        startingSectionRenameBlocked: true,
      });
      return setup;
    });
    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.canvas.renameSection, {
        sectionId: sections.notes,
        name: "Ideas",
      });
    const section = await t.run((ctx) =>
      ctx.db.get("sections", sections.notes),
    );
    expect(section?.name).toBe("Ideas");
  });

  it("lets a Member rename a custom Section even when renaming is blocked", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const setup = await setUp(ctx);
      await ctx.db.patch("events", setup.eventId, {
        startingSectionRenameBlocked: true,
      });
      return setup;
    });
    const meera = t.withIdentity(identityFor("meera"));
    const sectionId = await meera.mutation(api.canvas.createSection, {
      eventId,
      name: "Sangeet",
    });
    await meera.mutation(api.canvas.renameSection, {
      sectionId,
      name: "Sangeet night",
    });
    const section = await t.run((ctx) => ctx.db.get("sections", sectionId));
    expect(section?.name).toBe("Sangeet night");
  });

  it("refuses a Viewer and an empty name", async () => {
    const t = newTest();
    const { sections } = await t.run((ctx) => setUp(ctx, "viewer"));
    await expect(
      t.withIdentity(identityFor("meera")).mutation(api.canvas.renameSection, {
        sectionId: sections.notes,
        name: "Ideas",
      }),
    ).rejects.toThrow(/AccessDenied/);

    const t2 = newTest();
    const setup2 = await t2.run((ctx) => setUp(ctx));
    await expect(
      t2.withIdentity(identityFor("meera")).mutation(api.canvas.renameSection, {
        sectionId: setup2.sections.notes,
        name: "   ",
      }),
    ).rejects.toThrow(/empty/);
  });
});

describe("deleteSection", () => {
  it("moves a custom Section's Items back to their starting Section, in free space", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const meera = t.withIdentity(identityFor("meera"));
    const customId = await meera.mutation(api.canvas.createSection, {
      eventId: setup.eventId,
      name: "Sangeet",
    });
    const { existing, moved } = await t.run(async (ctx) => {
      // The Notes Section already holds one Note at its top left.
      const existing = await insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      });
      const moved = await insertNote(ctx, {
        ...setup,
        sectionId: customId,
        x: 0,
        y: 0,
      });
      return { existing, moved };
    });

    await meera.mutation(api.canvas.deleteSection, { sectionId: customId });

    const after = await t.run(async (ctx) => ({
      custom: await ctx.db.get("sections", customId),
      existing: await ctx.db.get("items", existing),
      moved: await ctx.db.get("items", moved),
    }));
    expect(after.custom?.deletedAt).not.toBeNull();
    expect(after.moved?.sectionId).toBe(setup.sections.notes);
    // Beside the existing Note, with the 20 px gap, not on top of it.
    expect(after.moved?.position).toEqual({ x: 320, y: 0 });
    expect(after.existing?.position).toEqual({ x: 0, y: 0 });
    expect(after.moved?.deletedAt).toBeNull();
  });

  it("records the delete and the move in the history", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const meera = t.withIdentity(identityFor("meera"));
    const customId = await meera.mutation(api.canvas.createSection, {
      eventId: setup.eventId,
      name: "Sangeet",
    });
    const moved = await t.run((ctx) =>
      insertNote(ctx, { ...setup, sectionId: customId, x: 0, y: 0 }),
    );
    await meera.mutation(api.canvas.deleteSection, { sectionId: customId });
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", setup.eventId))
        .collect(),
    );
    const ops = changes.map((c) => [c.table, c.docId, c.op]);
    expect(ops).toContainEqual(["sections", customId, "delete"]);
    expect(ops).toContainEqual(["items", moved, "update"]);
  });

  it("lets only the Owner and Co-owners delete a starting Section", async () => {
    for (const [role, allowed] of [
      ["owner", true],
      ["coOwner", true],
      ["member", false],
      ["viewer", false],
    ] as const) {
      const t = newTest();
      const { sections } = await t.run((ctx) => setUp(ctx, role));
      const attempt = t
        .withIdentity(identityFor("meera"))
        .mutation(api.canvas.deleteSection, { sectionId: sections.notes });
      if (allowed) {
        await attempt;
        const section = await t.run((ctx) =>
          ctx.db.get("sections", sections.notes),
        );
        expect(section?.deletedAt, role).not.toBeNull();
      } else {
        await expect(attempt, role).rejects.toThrow(/AccessDenied/);
      }
    }
  });

  it("refuses to delete a starting Section that still holds Items", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx, "owner"));
    await t.run((ctx) =>
      insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      }),
    );
    await expect(
      t.withIdentity(identityFor("meera")).mutation(api.canvas.deleteSection, {
        sectionId: setup.sections.notes,
      }),
    ).rejects.toThrow(/notEmpty/);
  });
});

describe("moveItem", () => {
  it("saves the position, bumps the version and records the move", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const itemId = await t.run((ctx) =>
      insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      }),
    );
    await t.withIdentity(identityFor("meera")).mutation(api.canvas.moveItem, {
      itemId,
      sectionId: setup.sections.notes,
      position: { x: 340, y: 40 },
    });
    const { item, changes } = await t.run(async (ctx) => ({
      item: await ctx.db.get("items", itemId),
      changes: await ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", itemId))
        .collect(),
    }));
    expect(item?.position).toEqual({ x: 340, y: 40 });
    expect(item?.version).toBe(2);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.before.position).toEqual({ x: 0, y: 0 });
    expect(changes[0]?.after.position).toEqual({ x: 340, y: 40 });
  });

  it("moves an Item into another Section and grows that Section to hold it", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const itemId = await t.run((ctx) =>
      insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      }),
    );
    const vendors = STARTING_SECTIONS.find((s) => s.kind === "vendors")!;
    await t.withIdentity(identityFor("meera")).mutation(api.canvas.moveItem, {
      itemId,
      sectionId: setup.sections.vendors,
      position: { x: vendors.frame.w - 100, y: 10 },
    });
    const { item, section } = await t.run(async (ctx) => ({
      item: await ctx.db.get("items", itemId),
      section: await ctx.db.get("sections", setup.sections.vendors),
    }));
    expect(item?.sectionId).toBe(setup.sections.vendors);
    expect(section?.frame.w).toBe(vendors.frame.w - 100 + 300);
  });

  it("refuses a Viewer and a Section of another Event", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx, "viewer"));
    const itemId = await t.run((ctx) =>
      insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      }),
    );
    await expect(
      t.withIdentity(identityFor("meera")).mutation(api.canvas.moveItem, {
        itemId,
        sectionId: setup.sections.notes,
        position: { x: 10, y: 10 },
      }),
    ).rejects.toThrow(/AccessDenied/);

    const t2 = newTest();
    const mine = await t2.run((ctx) => setUp(ctx));
    const other = await t2.run(async (ctx) => {
      const rohan = await seedMembership(ctx, { clerkId: "rohan" });
      return await createStartingSections(ctx, rohan.eventId, {
        kind: "member",
        membershipId: rohan.membershipId,
      });
    });
    const myItem = await t2.run((ctx) =>
      insertNote(ctx, { ...mine, sectionId: mine.sections.notes, x: 0, y: 0 }),
    );
    await expect(
      t2.withIdentity(identityFor("meera")).mutation(api.canvas.moveItem, {
        itemId: myItem,
        sectionId: other.notes,
        position: { x: 10, y: 10 },
      }),
    ).rejects.toThrow(/wrongEvent/);
  });
});

describe("placeNewItem", () => {
  it("puts a new Item in free space in its kind's starting Section", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const spot = await t.run(async (ctx) => {
      await insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      });
      return await placeNewItem(ctx, {
        eventId: setup.eventId,
        kind: "note",
        size: { w: 300, h: 200 },
      });
    });
    expect(spot).toEqual({
      sectionId: setup.sections.notes,
      position: { x: 320, y: 0 },
    });
  });
});

describe("get", () => {
  it("returns the Sections and Items for a Viewer, without deleted ones", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx, "viewer"));
    const { kept, gone } = await t.run(async (ctx) => {
      const kept = await insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      });
      const gone = await insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 320,
        y: 0,
      });
      await ctx.db.patch("items", gone, { deletedAt: 1 });
      return { kept, gone };
    });
    const canvas = await t
      .withIdentity(identityFor("meera"))
      .query(api.canvas.get, { eventId: setup.eventId });
    expect(canvas.sections.map((s) => s.name)).toEqual(
      STARTING_SECTIONS.map((s) => s.name),
    );
    expect(canvas.items.map((i) => i._id)).toEqual([kept]);
    expect(canvas.items.map((i) => i._id)).not.toContain(gone);
    expect(canvas.me.role).toBe("viewer");
  });

  it("refuses someone who isn't in the Event", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    await t.run((ctx) => seedMembership(ctx, { clerkId: "stranger" }));
    await expect(
      t
        .withIdentity(identityFor("stranger"))
        .query(api.canvas.get, { eventId: setup.eventId }),
    ).rejects.toThrow(/AccessDenied/);
  });
});
