/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import presenceTest from "@convex-dev/presence/test";
import { describe, expect, it } from "vitest";
import { itemOffsetInBox, layoutSections } from "../lib/canvas/layout";
import { FALLBACK_ITEM_SIZE } from "../lib/canvas/placement";
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

// ---------------------------------------------------------------------------
// Review fixes: presence access (H1), layout (H2) and the Low findings

/** A test with the presence component registered. */
function presenceT() {
  const t = newTest();
  presenceTest.register(t);
  return t;
}

/** Meera and Rohan, both Members, on one Event with the starting Sections. */
async function twoPeople(ctx: MutationCtx) {
  const meera = await setUp(ctx);
  const rohan = await seedMembership(ctx, {
    clerkId: "rohan",
    eventId: meera.eventId,
  });
  return { ...meera, rohanMembershipId: rohan.membershipId };
}

async function heartbeatAs(
  t: ReturnType<typeof newTest>,
  clerkId: string,
  eventId: Id<"events">,
) {
  return await t
    .withIdentity(identityFor(clerkId))
    .mutation(api.canvas.heartbeat, {
      roomId: eventId,
      userId: "ignored",
      sessionId: `${clerkId}-session`,
      interval: 10_000,
    });
}

describe("presence access", () => {
  it("lists the room for an active person", async () => {
    const t = presenceT();
    const setup = await t.run((ctx) => twoPeople(ctx));
    const { roomToken } = await heartbeatAs(t, "meera", setup.eventId);
    await heartbeatAs(t, "rohan", setup.eventId);
    const rows = await t
      .withIdentity(identityFor("meera"))
      .query(api.canvas.list, { roomToken });
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [setup.membershipId, setup.rohanMembershipId].sort(),
    );
  });

  for (const [label, change] of [
    ["removed", { status: "removed" as const }],
    ["blocked", { blocked: true }],
  ] as const) {
    it(`gives a ${label} person nothing, even with a saved room token`, async () => {
      const t = presenceT();
      const setup = await t.run((ctx) => twoPeople(ctx));
      await heartbeatAs(t, "meera", setup.eventId);
      const { roomToken } = await heartbeatAs(t, "rohan", setup.eventId);
      await t.run((ctx) =>
        ctx.db.patch("memberships", setup.rohanMembershipId, change),
      );
      const rohan = t.withIdentity(identityFor("rohan"));
      await expect(rohan.query(api.canvas.list, { roomToken })).rejects.toThrow(
        /AccessDenied/,
      );
      await expect(heartbeatAs(t, "rohan", setup.eventId)).rejects.toThrow(
        /AccessDenied/,
      );
      await expect(
        rohan.mutation(api.canvas.setPresenceSelection, {
          eventId: setup.eventId,
          target: null,
        }),
      ).rejects.toThrow(/AccessDenied/);
    });
  }

  it("shares only which Item and Entry someone has selected, never quoted text", async () => {
    const t = presenceT();
    const setup = await t.run((ctx) => twoPeople(ctx));
    const itemId = await t.run((ctx) =>
      insertNote(ctx, {
        ...setup,
        sectionId: setup.sections.notes,
        x: 0,
        y: 0,
      }),
    );
    const { roomToken } = await heartbeatAs(t, "meera", setup.eventId);
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.canvas.setPresenceSelection, {
      eventId: setup.eventId,
      target: { itemId, entryId: null },
    });
    const rows = await meera.query(api.canvas.list, { roomToken });
    expect(rows.find((r) => r.userId === setup.membershipId)?.data).toEqual({
      selection: { itemId, entryId: null },
    });
  });

  it("refuses a selection on an Item of another Event", async () => {
    const t = presenceT();
    const setup = await t.run((ctx) => twoPeople(ctx));
    const otherItem = await t.run(async (ctx) => {
      const other = await seedMembership(ctx, { clerkId: "stranger" });
      const sections = await createStartingSections(ctx, other.eventId, {
        kind: "member",
        membershipId: other.membershipId,
      });
      return await insertNote(ctx, {
        eventId: other.eventId,
        membershipId: other.membershipId,
        sectionId: sections.notes,
        x: 0,
        y: 0,
      });
    });
    await expect(
      t
        .withIdentity(identityFor("meera"))
        .mutation(api.canvas.setPresenceSelection, {
          eventId: setup.eventId,
          target: { itemId: otherItem, entryId: null },
        }),
    ).rejects.toThrow(/wrongEvent/);
  });
});

describe("positions from the client", () => {
  it("refuses a position that isn't a finite number, and keeps others within bounds", async () => {
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
    const meera = t.withIdentity(identityFor("meera"));
    for (const x of [Number.POSITIVE_INFINITY, Number.NaN]) {
      await expect(
        meera.mutation(api.canvas.moveItem, {
          itemId,
          sectionId: setup.sections.notes,
          position: { x, y: 0 },
        }),
      ).rejects.toThrow(/badPosition/);
      await expect(
        meera.mutation(api.canvas.moveSection, {
          sectionId: setup.sections.notes,
          position: { x, y: 0 },
        }),
      ).rejects.toThrow(/badPosition/);
    }
    await meera.mutation(api.canvas.moveItem, {
      itemId,
      sectionId: setup.sections.notes,
      position: { x: -40, y: 9_000_000 },
    });
    const item = await t.run((ctx) => ctx.db.get("items", itemId));
    expect(item?.position).toEqual({ x: 0, y: 50_000 });
  });
});

describe("Section limits", () => {
  it("allows at most 30 custom Sections", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const meera = t.withIdentity(identityFor("meera"));
    for (let i = 0; i < 30; i++)
      await meera.mutation(api.canvas.createSection, {
        eventId: setup.eventId,
        name: `Section ${i}`,
      });
    await expect(
      meera.mutation(api.canvas.createSection, {
        eventId: setup.eventId,
        name: "One too many",
      }),
    ).rejects.toThrow(/tooMany/);
  });

  it("never deletes the last starting Section", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx, "owner"));
    const owner = t.withIdentity(identityFor("meera"));
    for (const kind of ["money", "vendors", "inspirations"] as const)
      await owner.mutation(api.canvas.deleteSection, {
        sectionId: setup.sections[kind],
      });
    await expect(
      owner.mutation(api.canvas.deleteSection, {
        sectionId: setup.sections.notes,
      }),
    ).rejects.toThrow(/lastStarting/);
  });

  it("sends a Vendor checklist back to Vendors, where S1 puts it", async () => {
    const t = newTest();
    const setup = await t.run((ctx) => setUp(ctx));
    const meera = t.withIdentity(identityFor("meera"));
    const customId = await meera.mutation(api.canvas.createSection, {
      eventId: setup.eventId,
      name: "Wedding day",
    });
    const checklist = await t.run((ctx) =>
      ctx.db.insert("items", {
        eventId: setup.eventId,
        sectionId: customId,
        kind: "checklist",
        position: { x: 0, y: 0 },
        size: null,
        functionKey: null,
        data: { note: null },
        createdBy: setup.actor,
        version: 1,
        deletedAt: null,
      }),
    );
    await meera.mutation(api.canvas.deleteSection, { sectionId: customId });
    const item = await t.run((ctx) => ctx.db.get("items", checklist));
    expect(item?.sectionId).toBe(setup.sections.vendors);
  });
});

describe("a real Event from S1", () => {
  it("draws no Item on top of an Item in another Section after 3 Suggestions and an Inspiration", async () => {
    const t = newTest();
    agentTest.register(t);
    const meera = t.withIdentity({
      subject: "user_meera",
      name: "Meera",
      email: "meera@example.com",
    });
    await meera.mutation(api.users.ensureMe, {});
    const eventId = await meera.mutation(api.events.create, {
      name: "Meera weds Rohan",
      eventType: "wedding",
    });
    const membershipId = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("memberships")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .first())!._id,
    );

    await t.run(async (ctx) => {
      const actor = { kind: "member" as const, membershipId };
      const size = { w: 300, h: 200 };
      for (const kind of [
        "suggestion",
        "suggestion",
        "suggestion",
        "inspiration",
      ] as const) {
        const { sectionId, position } = await placeNewItem(ctx, {
          eventId,
          kind,
          size,
        });
        const common = {
          eventId,
          sectionId,
          position,
          size,
          functionKey: null,
          createdBy: actor,
          version: 1,
          deletedAt: null,
        };
        if (kind === "suggestion") {
          await ctx.db.insert("items", {
            ...common,
            kind,
            data: {
              title: "Folk musicians",
              body: "At the sangeet dinner",
              costCategory: null,
              quantity: null,
              estimate: null,
              status: "open",
            },
          });
        } else {
          await ctx.db.insert("items", {
            ...common,
            kind,
            data: {
              addedBy: membershipId,
              memberNote: null,
              source: {
                kind: "pexels",
                pexelsId: 1,
                localPath: "/inspirations/x.webp",
                photographer: "A",
                photographerUrl: "https://www.pexels.com/@a",
                pageUrl: "https://www.pexels.com/photo/1",
                alt: "Marigolds",
                tags: [],
              },
              seen: null,
            },
          });
        }
      }
    });

    const canvas = await meera.query(api.canvas.get, { eventId });
    const boxes = layoutSections(canvas.sections, (s) =>
      canvas.items.filter((i) => i.sectionId === s._id),
    );
    const drawn = canvas.items.map((item) => {
      const box = boxes.get(item.sectionId)!;
      const at = itemOffsetInBox(item.position);
      const size = item.size ?? FALLBACK_ITEM_SIZE;
      return { x: box.x + at.x, y: box.y + at.y, w: size.w, h: size.h };
    });
    // S1's Budget, Timeline and checklist, plus the four new Items.
    expect(drawn).toHaveLength(7);
    for (const [i, a] of drawn.entries())
      for (const b of drawn.slice(i + 1))
        expect(
          a.x < b.x + b.w &&
            b.x < a.x + a.w &&
            a.y < b.y + b.h &&
            b.y < a.y + a.h,
        ).toBe(false);
  });
});
