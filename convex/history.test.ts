/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";
import {
  assistantInsert,
  assistantSoftDelete,
  assistantWrite,
  memberSoftDelete,
  memberWrite,
  recordPeopleChange,
} from "./lib/write";

type Role = Doc<"memberships">["role"];
const firstPage = { numItems: 50, cursor: null };

/** Adds someone to an existing Event, with their own user row. */
async function addPerson(
  ctx: MutationCtx,
  eventId: Id<"events">,
  clerkId: string,
  role: Role,
  status: Doc<"memberships">["status"] = "active",
) {
  const { membershipId } = await seedMembership(ctx, {
    clerkId,
    role,
    status,
    eventId,
  });
  return membershipId;
}

/**
 * Meera's wedding: Meera (Owner), Rohan (Member) and Papa (Viewer), the
 * starting Sections and one Note "Ask the pandit" in the Notes Section.
 */
async function setUp(ctx: MutationCtx) {
  const { eventId, membershipId: meera } = await seedMembership(ctx, {
    clerkId: "meera",
    role: "owner",
  });
  const rohan = await addPerson(ctx, eventId, "rohan", "member");
  const papa = await addPerson(ctx, eventId, "papa", "viewer");
  const sections = await createStartingSections(ctx, eventId, {
    kind: "member",
    membershipId: meera,
  });
  const noteId = await ctx.db.insert("items", {
    eventId,
    sectionId: sections.notes,
    kind: "note",
    position: { x: 0, y: 0 },
    size: { w: 300, h: 200 },
    functionKey: null,
    data: { text: "Ask the pandit", citations: [] },
    createdBy: { kind: "member", membershipId: meera },
    version: 1,
    deletedAt: null,
  });
  return { eventId, meera, rohan, papa, sections, noteId };
}

async function changesOf(ctx: MutationCtx, docId: Id<"items">) {
  return await ctx.db
    .query("changes")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .collect();
}

describe("restore", () => {
  it("puts back the before value of an edit as a new change", async () => {
    const t = newTest();
    const { noteId, meera } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: {
          data: { text: "Ask the pandit about muhurat", citations: [] },
        },
        actor: { kind: "member", membershipId: s.meera },
      });
      return s;
    });
    const edit = await t.run(async (ctx) => (await changesOf(ctx, noteId))[0]!);

    await t
      .withIdentity(identityFor("rohan"))
      .mutation(api.history.restore, { changeId: edit._id });

    const { note, changes } = await t.run(async (ctx) => ({
      note: await ctx.db.get("items", noteId),
      changes: await changesOf(ctx, noteId),
    }));
    expect(note?.kind === "note" && note.data.text).toBe("Ask the pandit");
    expect(note?.version).toBe(3);
    expect(changes).toHaveLength(2);
    const restore = changes[1]!;
    expect(restore.op).toBe("restore");
    expect(restore.actor).not.toEqual({ kind: "member", membershipId: meera });
    expect(restore.before.data.text).toBe("Ask the pandit about muhurat");
    expect(restore.after.data.text).toBe("Ask the pandit");
  });

  it("brings back a soft-deleted Item", async () => {
    const t = newTest();
    const { noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberSoftDelete(ctx, {
        table: "items",
        id: s.noteId,
        actor: { kind: "member", membershipId: s.rohan },
      });
      return s;
    });
    const deletion = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );
    expect(deletion.op).toBe("delete");

    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.restore, { changeId: deletion._id });

    const { note, changes } = await t.run(async (ctx) => ({
      note: await ctx.db.get("items", noteId),
      changes: await changesOf(ctx, noteId),
    }));
    expect(note?.deletedAt).toBeNull();
    expect(changes.map((c) => c.op)).toEqual(["delete", "restore"]);
  });

  it("puts back only what that change changed, keeping later edits to other fields", async () => {
    const t = newTest();
    const { noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const actor = { kind: "member" as const, membershipId: s.rohan };
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: { data: { text: "Ask the pandit, twice", citations: [] } },
        actor,
      });
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: { position: { x: 400, y: 120 } },
        actor,
      });
      return s;
    });
    const textEdit = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );

    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.restore, { changeId: textEdit._id });

    const note = await t.run((ctx) => ctx.db.get("items", noteId));
    expect(note?.kind === "note" && note.data.text).toBe("Ask the pandit");
    expect(note?.position).toEqual({ x: 400, y: 120 });
  });

  it("refuses a Viewer, who can still list the history", async () => {
    const t = newTest();
    const { eventId, noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberSoftDelete(ctx, {
        table: "items",
        id: s.noteId,
        actor: { kind: "member", membershipId: s.rohan },
      });
      return s;
    });
    const deletion = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );
    const papa = t.withIdentity(identityFor("papa"));

    const listed = await papa.query(api.history.list, {
      eventId,
      paginationOpts: firstPage,
    });
    expect(listed.page.some((row) => row.changeId === deletion._id)).toBe(true);
    await expect(
      papa.mutation(api.history.restore, { changeId: deletion._id }),
    ).rejects.toThrow(/notAllowed/);
    const note = await t.run((ctx) => ctx.db.get("items", noteId));
    expect(note?.deletedAt).not.toBeNull();
  });

  it("refuses a Member of another Event", async () => {
    const t = newTest();
    const { noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberSoftDelete(ctx, {
        table: "items",
        id: s.noteId,
        actor: { kind: "member", membershipId: s.rohan },
      });
      // Kabir plans a different Event.
      await seedMembership(ctx, { clerkId: "kabir", role: "owner" });
      return s;
    });
    const deletion = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );
    await expect(
      t
        .withIdentity(identityFor("kabir"))
        .mutation(api.history.restore, { changeId: deletion._id }),
    ).rejects.toThrow(/notAMember/);
  });

  it("refuses a removed person, for listing and for Restore", async () => {
    const t = newTest();
    const { eventId, noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await addPerson(ctx, s.eventId, "aditi", "member", "removed");
      await memberSoftDelete(ctx, {
        table: "items",
        id: s.noteId,
        actor: { kind: "member", membershipId: s.rohan },
      });
      return s;
    });
    const deletion = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );
    const aditi = t.withIdentity(identityFor("aditi"));
    await expect(
      aditi.query(api.history.list, { eventId, paginationOpts: firstPage }),
    ).rejects.toThrow(/removed/);
    await expect(
      aditi.mutation(api.history.restore, { changeId: deletion._id }),
    ).rejects.toThrow(/removed/);
  });

  it("refuses a Member restoring an Owner-only setting", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => setUp(ctx));
    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.events.setUploadRights, { eventId, on: true });
    const change = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("changes")
          .withIndex("by_doc", (q) => q.eq("docId", eventId))
          .collect()
      ).at(-1)!,
    );
    await expect(
      t
        .withIdentity(identityFor("rohan"))
        .mutation(api.history.restore, { changeId: change._id }),
    ).rejects.toThrow(/notAllowed/);

    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.restore, { changeId: change._id });
    const event = await t.run((ctx) => ctx.db.get("events", eventId));
    expect(event?.uploadRightsOn).toBe(false);
  });

  it("refuses to bring back an Item into a deleted Section", async () => {
    const t = newTest();
    const { noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const actor = { kind: "member" as const, membershipId: s.rohan };
      await memberSoftDelete(ctx, { table: "items", id: s.noteId, actor });
      await memberSoftDelete(ctx, {
        table: "sections",
        id: s.sections.notes,
        actor,
      });
      return s;
    });
    const deletion = await t.run(
      async (ctx) => (await changesOf(ctx, noteId))[0]!,
    );
    await expect(
      t
        .withIdentity(identityFor("meera"))
        .mutation(api.history.restore, { changeId: deletion._id }),
    ).rejects.toThrow(/sectionDeleted/);
  });

  it("offers no Restore for a people change and refuses one", async () => {
    const t = newTest();
    const { eventId, papa } = await t.run((ctx) => setUp(ctx));
    await t.withIdentity(identityFor("meera")).mutation(api.people.setRole, {
      eventId,
      membershipId: papa,
      role: "member",
    });
    const listed = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    const row = listed.page.find((r) => r.kind === "people")!;
    expect(row.canRestore).toBe(false);
    await expect(
      t
        .withIdentity(identityFor("meera"))
        .mutation(api.history.restore, { changeId: row.changeId }),
    ).rejects.toThrow(/notRestorable/);
  });
});

describe("list labels", () => {
  /** Two Assistant changes in one run for Meera, labelled "Plan the sangeet". */
  async function assistantRun(
    ctx: MutationCtx,
    s: Awaited<ReturnType<typeof setUp>>,
    opts: { source: "chat" | "comment"; fromComment: boolean },
  ) {
    const runId = await ctx.db.insert("runs", {
      eventId: s.eventId,
      requestedBy: s.meera,
      source: opts.source,
      messageId: null,
      commentId: null,
      status: "done",
      stoppedBy: null,
      model: "stub-utsavvy",
      createdAt: 0,
      startedAt: 0,
      endedAt: 1,
    });
    const common = {
      runId,
      forMembershipId: s.meera,
      groupLabel: "Plan the sangeet",
      fromComment: opts.fromComment,
    };
    await assistantWrite(ctx, {
      ...common,
      table: "items",
      id: s.noteId,
      expectedVersion: 1,
      toolCallId: "toolu_01#1",
      patch: { data: { text: "Sangeet DJ till 11", citations: [] } },
    });
    await assistantWrite(ctx, {
      ...common,
      table: "items",
      id: s.noteId,
      expectedVersion: 2,
      toolCallId: "toolu_01#2",
      patch: { position: { x: 40, y: 40 } },
    });
    return runId;
  }

  it('labels an Assistant reply\'s group "Utsavvy for <Member>: <label> (n changes)"', async () => {
    const t = newTest();
    const { eventId, runId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const runId = await assistantRun(ctx, s, {
        source: "chat",
        fromComment: false,
      });
      return { ...s, runId };
    });
    const { page } = await t
      .withIdentity(identityFor("papa"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    const rows = page.filter((r) => r.groupKey === runId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.who).toBe("Utsavvy for meera");
      expect(row.groupTitle).toBe(
        "Utsavvy for meera: Plan the sangeet (2 changes)",
      );
    }
  });

  it('adds "(from a Comment)" to a group asked for in a Comment', async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await assistantRun(ctx, s, { source: "comment", fromComment: true });
      return s;
    });
    const { page } = await t
      .withIdentity(identityFor("rohan"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    const row = page.find((r) => r.groupKey !== null)!;
    expect(row.groupTitle).toBe(
      "Utsavvy for meera: Plan the sangeet (2 changes) (from a Comment)",
    );
  });

  it('labels an accepted Proposal "Utsavvy for Rohan, accepted by Meera"', async () => {
    const t = newTest();
    const { eventId, proposalId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const proposalId = await ctx.db.insert("proposals", {
        eventId: s.eventId,
        runId: null,
        requestedBy: s.rohan,
        origin: { kind: "chat" },
        summary: "Cut decor",
        changes: [],
        status: "accepted",
        decidedBy: s.meera,
        decidedAt: 1,
        replacedBy: null,
        expiresAt: 2,
        createdAt: 0,
      } as never);
      await assistantWrite(ctx, {
        table: "items",
        id: s.noteId,
        expectedVersion: 1,
        patch: { data: { text: "Decor ₹2,20,000", citations: [] } },
        runId: null,
        proposalId,
        toolCallId: "change#1",
        forMembershipId: s.rohan,
        acceptedBy: s.meera,
      });
      return { ...s, proposalId };
    });
    const { page } = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    const row = page.find((r) => r.groupKey === proposalId)!;
    expect(row.who).toBe("Utsavvy for rohan, accepted by meera");
    expect(row.groupTitle).toBe(
      "Utsavvy for rohan, accepted by meera (1 change)",
    );
  });

  it("names a Member's own edit by them, with (left) once they left, and points at the Item", async () => {
    const t = newTest();
    const { eventId, noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: { data: { text: "Ask the pandit, twice", citations: [] } },
        actor: { kind: "member", membershipId: s.rohan },
      });
      await ctx.db.patch("memberships", s.rohan, { status: "left" });
      return s;
    });
    const { page } = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    const row = page.find((r) => r.target?.kind === "item")!;
    expect(row.who).toBe("rohan (left)");
    expect(row.groupKey).toBeNull();
    expect(row.groupTitle).toBeNull();
    expect(row.summary).toBe("Edited a Note");
    expect(row.target).toEqual({ kind: "item", itemId: noteId });
    expect(row.canRestore).toBe(true);
  });

  it("lists people changes with who did them, and never an invite token", async () => {
    const t = newTest();
    const { eventId, papa, rohan } = await t.run((ctx) => setUp(ctx));
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.people.setRole, {
      eventId,
      membershipId: papa,
      role: "member",
    });
    await meera.mutation(api.people.remove, { eventId, membershipId: rohan });
    await meera.mutation(api.people.resetLink, { eventId, role: "viewer" });
    const tokens = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("inviteLinks")
          .withIndex("by_event_role", (q) => q.eq("eventId", eventId))
          .collect()
      ).map((l) => l.token),
    );

    const listed = await meera.query(api.history.list, {
      eventId,
      paginationOpts: firstPage,
    });
    const people = listed.page.filter((r) => r.kind === "people");
    expect(people.map((r) => [r.who, r.summary])).toEqual([
      ["meera", "Reset the Viewer link"],
      ["meera", "Removed rohan"],
      ["meera", "Made papa a Member"],
    ]);
    const text = JSON.stringify(listed);
    for (const token of tokens) expect(text).not.toContain(token);
  });

  it("lists newest first", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const actor = { kind: "member" as const, membershipId: s.meera };
      await recordPeopleChange(ctx, {
        eventId: s.eventId,
        actor,
        membershipId: s.rohan,
        before: { role: "viewer", status: "active", blocked: false },
        after: { role: "member", status: "active", blocked: false },
      });
      await memberSoftDelete(ctx, { table: "items", id: s.noteId, actor });
      return s;
    });
    const { page } = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    expect(page.map((r) => r.summary).slice(0, 2)).toEqual([
      "Deleted a Note",
      "Made rohan a Member",
    ]);
  });
});

describe("review fixes (PR #90)", () => {
  /** The newest change to a document. */
  async function lastChange(
    ctx: MutationCtx,
    docId: Id<"sections"> | Id<"items">,
  ) {
    return (
      await ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", docId))
        .collect()
    ).at(-1)!;
  }

  it("refuses to Restore a Restore that would delete a custom Section again, so its Items are never orphaned", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => setUp(ctx));
    const rohan = t.withIdentity(identityFor("rohan"));
    const sectionId = await rohan.mutation(api.canvas.createSection, {
      eventId,
      name: "Sangeet night",
    });
    await rohan.mutation(api.canvas.deleteSection, { sectionId });
    const deletion = await t.run((ctx) => lastChange(ctx, sectionId));
    await rohan.mutation(api.history.restore, { changeId: deletion._id });
    const restored = await t.run((ctx) => lastChange(ctx, sectionId));
    expect(restored.op).toBe("restore");

    const { page } = await rohan.query(api.history.list, {
      eventId,
      paginationOpts: firstPage,
    });
    expect(page.find((r) => r.changeId === restored._id)?.canRestore).toBe(
      false,
    );
    await expect(
      rohan.mutation(api.history.restore, { changeId: restored._id }),
    ).rejects.toThrow(/useDelete/);
    const section = await t.run((ctx) => ctx.db.get("sections", sectionId));
    expect(section?.deletedAt).toBeNull();
  });

  it("refuses to Restore a Restore that would delete a non-empty starting Section", async () => {
    const t = newTest();
    const { sections, noteId } = await t.run((ctx) => setUp(ctx));
    // Meera (Owner) empties the Notes Section, deletes it and restores it.
    await t.run((ctx) =>
      ctx.db.patch("items", noteId, { sectionId: sections.money }),
    );
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.canvas.deleteSection, {
      sectionId: sections.notes,
    });
    const deletion = await t.run((ctx) => lastChange(ctx, sections.notes));
    await meera.mutation(api.history.restore, { changeId: deletion._id });
    await t.run((ctx) =>
      ctx.db.patch("items", noteId, { sectionId: sections.notes }),
    );
    const restored = await t.run((ctx) => lastChange(ctx, sections.notes));

    await expect(
      meera.mutation(api.history.restore, { changeId: restored._id }),
    ).rejects.toThrow(/useDelete/);
    const section = await t.run((ctx) =>
      ctx.db.get("sections", sections.notes),
    );
    expect(section?.deletedAt).toBeNull();
  });

  it("refuses to Restore a Restore that would delete an Item again", async () => {
    const t = newTest();
    const { eventId, noteId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      await memberSoftDelete(ctx, {
        table: "items",
        id: s.noteId,
        actor: { kind: "member", membershipId: s.rohan },
      });
      return s;
    });
    const meera = t.withIdentity(identityFor("meera"));
    const deletion = await t.run((ctx) => lastChange(ctx, noteId));
    await meera.mutation(api.history.restore, { changeId: deletion._id });
    const restored = await t.run((ctx) => lastChange(ctx, noteId));

    const { page } = await meera.query(api.history.list, {
      eventId,
      paginationOpts: firstPage,
    });
    expect(page.find((r) => r.changeId === restored._id)?.canRestore).toBe(
      false,
    );
    await expect(
      meera.mutation(api.history.restore, { changeId: restored._id }),
    ).rejects.toThrow(/useDelete/);
    const note = await t.run((ctx) => ctx.db.get("items", noteId));
    expect(note?.deletedAt).toBeNull();
  });

  it("returns at most 50 rows a page, whatever page size the client asks for", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      for (let x = 1; x <= 60; x++) {
        await memberWrite(ctx, {
          table: "items",
          id: s.noteId,
          patch: { position: { x, y: 0 } },
          actor: { kind: "member", membershipId: s.rohan },
        });
      }
      return s;
    });
    const { page, isDone } = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, {
        eventId,
        paginationOpts: { numItems: 100_000, cursor: null },
      });
    expect(page).toHaveLength(50);
    expect(isDone).toBe(false);
  });

  it("puts back only a shared Vendor's Marker, never its other facts", async () => {
    const t = newTest();
    const marker = (lat: number) => ({
      lat,
      lng: 75.8,
      confidence: 0.9,
      matchType: "street",
      approximate: false,
      provider: "geoapify",
      attribution: "© OpenStreetMap contributors",
    });
    const { vendorId, changeId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const vendorId = await ctx.db.insert("vendors", {
        domain: "mlcaterers.in",
        name: "M L Caterers",
        category: "caterer",
        website: "https://mlcaterers.in",
        phone: "+91 141 000 0000",
        marker: marker(26.9),
        summary: "Caterer in Jaipur.",
        provenance: [],
        factsSeenAt: "2026-10-21",
        source: "starterSet",
        version: 1,
      });
      await memberWrite(ctx, {
        table: "vendors",
        id: vendorId,
        patch: { marker: marker(26.95), phone: "+91 141 999 9999" },
        actor: { kind: "member", membershipId: s.rohan },
      });
      const change = (
        await ctx.db
          .query("changes")
          .withIndex("by_doc", (q) => q.eq("docId", vendorId))
          .collect()
      ).at(-1)!;
      return { vendorId, changeId: change._id };
    });

    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.restore, { changeId });

    const vendor = await t.run((ctx) => ctx.db.get("vendors", vendorId));
    expect(vendor?.marker?.lat).toBe(26.9);
    expect(vendor?.phone).toBe("+91 141 999 9999");
  });

  it("refuses to bring back a custom Section past the 30 custom Section cap", async () => {
    const t = newTest();
    const { eventId } = await t.run((ctx) => setUp(ctx));
    const rohan = t.withIdentity(identityFor("rohan"));
    const first = await rohan.mutation(api.canvas.createSection, {
      eventId,
      name: "Haldi",
    });
    await rohan.mutation(api.canvas.deleteSection, { sectionId: first });
    const deletion = await t.run((ctx) => lastChange(ctx, first));
    for (let n = 1; n <= 30; n++) {
      await rohan.mutation(api.canvas.createSection, {
        eventId,
        name: `Section ${n}`,
      });
    }
    await expect(
      rohan.mutation(api.history.restore, { changeId: deletion._id }),
    ).rejects.toThrow(/tooManySections/);
  });

  it("grows the Section's frame to hold an Item a Restore puts back, as a move does", async () => {
    const t = newTest();
    const { noteId, sections } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      const actor = { kind: "member" as const, membershipId: s.rohan };
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: { position: { x: 5000, y: 0 } },
        actor,
      });
      await memberWrite(ctx, {
        table: "items",
        id: s.noteId,
        patch: { position: { x: 0, y: 0 } },
        actor,
      });
      return s;
    });
    const backHome = await t.run((ctx) => lastChange(ctx, noteId));

    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.restore, { changeId: backHome._id });

    const { note, section } = await t.run(async (ctx) => ({
      note: await ctx.db.get("items", noteId),
      section: await ctx.db.get("sections", sections.notes),
    }));
    expect(note?.position).toEqual({ x: 5000, y: 0 });
    expect(section!.frame.w).toBeGreaterThanOrEqual(5300);
  });

  it("shortens a long Hindi name by whole characters, never mid-character", async () => {
    const t = newTest();
    const { eventId } = await t.run(async (ctx) => {
      const s = await setUp(ctx);
      // "कि" is one character on screen: क plus the ि matra.
      await memberWrite(ctx, {
        table: "sections",
        id: s.sections.notes,
        patch: { name: "कि".repeat(45) },
        actor: { kind: "member", membershipId: s.rohan },
      });
      return s;
    });
    const { page } = await t
      .withIdentity(identityFor("meera"))
      .query(api.history.list, { eventId, paginationOpts: firstPage });
    expect(page[0]!.summary).toBe(`Renamed the Section "${"कि".repeat(39)}…"`);
  });

  describe("where the runtime has no Intl.Segmenter", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("still shortens long names, by code point, never splitting an emoji", async () => {
      // Intl as it is, minus Segmenter.
      const { Segmenter: _segmenter, ...rest } =
        Object.getOwnPropertyDescriptors(Intl);
      vi.stubGlobal("Intl", Object.create(Object.getPrototypeOf(Intl), rest));
      expect("Segmenter" in Intl).toBe(false);

      const t = newTest();
      const { eventId } = await t.run(async (ctx) => {
        const s = await setUp(ctx);
        const actor = { kind: "member" as const, membershipId: s.rohan };
        await memberWrite(ctx, {
          table: "sections",
          id: s.sections.money,
          patch: { name: "कि".repeat(45) },
          actor,
        });
        await memberWrite(ctx, {
          table: "sections",
          id: s.sections.notes,
          patch: { name: `a${"🎉".repeat(45)}` },
          actor,
        });
        return s;
      });
      const { page } = await t
        .withIdentity(identityFor("meera"))
        .query(api.history.list, { eventId, paginationOpts: firstPage });

      // 39 code points: a Hindi cluster may lose its matra, an emoji is never halved.
      expect(page[0]!.summary).toBe(
        `Renamed the Section "a${"🎉".repeat(38)}…"`,
      );
      expect(page[1]!.summary).toBe(
        `Renamed the Section "${"कि".repeat(19)}क…"`,
      );
      const loneSurrogate =
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
      expect(page[0]!.summary).not.toMatch(loneSurrogate);
    });
  });
});

describe("undoGroup (X11)", () => {
  const LABELS = [
    "Sangeet DJ",
    "Caterer",
    "Decor",
    "Mehendi artist",
    "Photographer",
    "Sound",
    "Lighting",
    "Venue",
  ];

  function line(label: string, planned: number) {
    return {
      label,
      category: null,
      quantity: 1,
      unit: "per_event" as const,
      estimate: null,
      plannedAmount: planned,
      role: "line" as const,
      belowUsualRange: false,
      editedByMember: false,
    };
  }

  /**
   * Meera's wedding with Meera (Owner), Rohan (Member) and Papa (Viewer) named
   * as people see them, a Budget with 8 sangeet lines at ₹10,000, and one
   * Assistant reply for Meera, "Plan the sangeet", that raised all 8 to ₹20,000.
   */
  async function sangeet(ctx: MutationCtx) {
    const s = await setUp(ctx);
    await ctx.db.patch("memberships", s.meera, { displayName: "Meera" });
    await ctx.db.patch("memberships", s.rohan, { displayName: "Rohan" });
    await ctx.db.patch("memberships", s.papa, { displayName: "Papa" });
    const budgetId = await ctx.db.insert("items", {
      eventId: s.eventId,
      sectionId: s.sections.money,
      kind: "budget",
      position: { x: 0, y: 0 },
      size: null,
      functionKey: null,
      data: { note: null },
      createdBy: { kind: "member", membershipId: s.meera },
      version: 1,
      deletedAt: null,
    });
    const lines: Id<"entries">[] = [];
    for (const [order, label] of LABELS.entries()) {
      lines.push(
        await ctx.db.insert("entries", {
          eventId: s.eventId,
          itemId: budgetId,
          kind: "budget",
          order,
          functionKey: "sangeet",
          fields: line(label, 10_000),
          assumed: [],
          createdBy: { kind: "member", membershipId: s.meera },
          version: 1,
          deletedAt: null,
        }),
      );
    }
    const runId = await ctx.db.insert("runs", {
      eventId: s.eventId,
      requestedBy: s.meera,
      source: "chat",
      messageId: null,
      commentId: null,
      status: "done",
      stoppedBy: null,
      model: "stub-utsavvy",
      createdAt: 0,
      startedAt: 0,
      endedAt: 1,
    });
    for (const [i, id] of lines.entries()) {
      await assistantWrite(ctx, {
        table: "entries",
        id,
        expectedVersion: 1,
        patch: { fields: line(LABELS[i]!, 20_000) },
        runId,
        toolCallId: `toolu_01#${i + 1}`,
        forMembershipId: s.meera,
        groupLabel: "Plan the sangeet",
      });
    }
    return { ...s, budgetId, lines, runId };
  }

  async function plannedAmounts(ctx: MutationCtx, ids: Id<"entries">[]) {
    const out: number[] = [];
    for (const id of ids) {
      const entry = await ctx.db.get("entries", id);
      out.push(
        entry?.kind === "budget" ? (entry.fields.plannedAmount ?? -1) : -1,
      );
    }
    return out;
  }

  async function countChanges(ctx: MutationCtx, eventId: Id<"events">) {
    return (
      await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
        .collect()
    ).length;
  }

  /** The history group of the Event's newest change, such as the last Undo all. */
  async function newestGroupKey(ctx: MutationCtx, eventId: Id<"events">) {
    const row = await ctx.db
      .query("changes")
      .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
      .order("desc")
      .first();
    return row!.groupKey!;
  }

  /** Rohan sets the Sangeet DJ line to ₹25,000 after the reply. */
  async function rohanEditsTheDj(
    ctx: MutationCtx,
    s: Awaited<ReturnType<typeof sangeet>>,
  ) {
    await memberWrite(ctx, {
      table: "entries",
      id: s.lines[0]!,
      patch: { fields: line("Sangeet DJ", 25_000) },
      actor: { kind: "member", membershipId: s.rohan },
    });
  }

  it('undoes the 7 changes nobody touched since and says "Undid 7 of 8; Rohan has since edited Sangeet DJ"', async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      await rohanEditsTheDj(ctx, s);
      return s;
    });

    const result = await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.undoGroup, { groupKey: s.runId });

    expect(result).toEqual({
      undone: 7,
      total: 8,
      message: "Undid 7 of 8; Rohan has since edited Sangeet DJ",
    });
    const amounts = await t.run((ctx) => plannedAmounts(ctx, s.lines));
    expect(amounts).toEqual([
      25_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
    ]);
  });

  it("refuses a Viewer and changes nothing", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const before = await t.run((ctx) => countChanges(ctx, s.eventId));

    await expect(
      t
        .withIdentity(identityFor("papa"))
        .mutation(api.history.undoGroup, { groupKey: s.runId }),
    ).rejects.toMatchObject({
      data: {
        kind: "AccessDenied",
        reason: "notAllowed",
        action: "history.restore",
      },
    });

    const after = await t.run(async (ctx) => ({
      amounts: await plannedAmounts(ctx, s.lines),
      changes: await countChanges(ctx, s.eventId),
    }));
    expect(after.amounts).toEqual(Array(8).fill(20_000));
    expect(after.changes).toBe(before);
  });

  it("refuses a Member of another Event, whose group it isn't", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      await seedMembership(ctx, { clerkId: "stranger", role: "owner" });
      return s;
    });

    await expect(
      t
        .withIdentity(identityFor("stranger"))
        .mutation(api.history.undoGroup, { groupKey: s.runId }),
    ).rejects.toMatchObject({
      data: {
        kind: "AccessDenied",
        reason: "notAMember",
        action: "history.restore",
      },
    });

    const amounts = await t.run((ctx) => plannedAmounts(ctx, s.lines));
    expect(amounts).toEqual(Array(8).fill(20_000));
  });

  it("refuses a group with no changes", async () => {
    const t = newTest();
    await t.run(sangeet);
    await expect(
      t
        .withIdentity(identityFor("meera"))
        .mutation(api.history.undoGroup, { groupKey: "no-such-group" }),
    ).rejects.toMatchObject({
      data: { kind: "HistoryRefused", problem: "notFound" },
    });
  });

  it("does nothing new on a second tap, and says so", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const meera = t.withIdentity(identityFor("meera"));

    const first = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(first.message).toBe("Undid 8 of 8");
    const written = await t.run((ctx) => countChanges(ctx, s.eventId));

    const second = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(second).toEqual({ undone: 0, total: 8, message: "Already undone" });
    expect(await t.run((ctx) => countChanges(ctx, s.eventId))).toBe(written);
  });

  it("says what is still left on a second tap after a skipped change", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      await rohanEditsTheDj(ctx, s);
      return s;
    });
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.history.undoGroup, { groupKey: s.runId });
    const second = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(second.message).toBe(
      "Nothing more to undo; Rohan has since edited Sangeet DJ",
    );
  });

  it("writes the undo as one new group of Restores by the Member, and marks each change undone", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.undoGroup, { groupKey: s.runId });

    const { undos, originals } = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("changes")
        .withIndex("by_event_at", (q) => q.eq("eventId", s.eventId))
        .collect();
      return {
        undos: all.filter((c) => c.op === "restore"),
        originals: all.filter((c) => c.groupKey === s.runId),
      };
    });
    expect(undos).toHaveLength(8);
    const keys = [...new Set(undos.map((c) => c.groupKey))];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBeNull();
    expect(keys[0]).not.toBe(s.runId);
    for (const undo of undos) {
      expect(undo.actor).toEqual({ kind: "member", membershipId: s.meera });
    }
    for (const original of originals) {
      expect(undos.map((u) => u._id)).toContain(original.undoneBy);
    }

    const { page } = await t
      .withIdentity(identityFor("papa"))
      .query(api.history.list, {
        eventId: s.eventId,
        paginationOpts: firstPage,
      });
    const undoRow = page.find((r) => r.groupKey === keys[0])!;
    expect(undoRow.byAssistant).toBe(false);
    expect(undoRow.groupTitle).toBe(
      "Meera: Undo all of Plan the sangeet (8 changes)",
    );
  });

  it("removes what the reply added and brings back what it deleted", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      const common = {
        runId: s.runId,
        forMembershipId: s.meera,
        groupLabel: "Plan the sangeet",
      };
      const { id: added } = await assistantInsert(ctx, {
        ...common,
        table: "entries",
        toolCallId: "toolu_02",
        value: {
          eventId: s.eventId,
          itemId: s.budgetId,
          kind: "budget",
          order: 8,
          functionKey: "sangeet",
          fields: line("Dhol", 8_000),
          assumed: [],
          createdBy: { kind: "member", membershipId: s.meera },
        },
      });
      await assistantSoftDelete(ctx, {
        ...common,
        table: "items",
        id: s.noteId,
        expectedVersion: 1,
        toolCallId: "toolu_03",
      });
      return { ...s, added };
    });

    const result = await t
      .withIdentity(identityFor("rohan"))
      .mutation(api.history.undoGroup, { groupKey: s.runId });
    expect(result.message).toBe("Undid 10 of 10");

    const { added, note } = await t.run(async (ctx) => ({
      added: await ctx.db.get("entries", s.added),
      note: await ctx.db.get("items", s.noteId),
    }));
    expect(added?.deletedAt).not.toBeNull();
    expect(note?.deletedAt).toBeNull();
  });

  it("lets any Member undo an accepted Proposal, not only the one who accepted it", async () => {
    const t = newTest();
    const { proposalId, lines } = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      const proposalId = await ctx.db.insert("proposals", {
        eventId: s.eventId,
        runId: null,
        requestedBy: s.rohan,
        origin: { kind: "chat" },
        summary: "Cut decor",
        changes: [],
        status: "accepted",
        decidedBy: s.meera,
        decidedAt: 1,
        replacedBy: null,
        expiresAt: 2,
        createdAt: 0,
      } as never);
      await assistantWrite(ctx, {
        table: "entries",
        id: s.lines[2]!,
        expectedVersion: 2,
        patch: { fields: line("Decor", 5_000) },
        runId: null,
        proposalId,
        toolCallId: "change#1",
        forMembershipId: s.rohan,
        acceptedBy: s.meera,
      });
      return { ...s, proposalId };
    });

    const result = await t
      .withIdentity(identityFor("rohan"))
      .mutation(api.history.undoGroup, { groupKey: proposalId });
    expect(result.message).toBe("Undid 1 of 1");
    const amounts = await t.run((ctx) => plannedAmounts(ctx, lines));
    expect(amounts[2]).toBe(20_000);
  });

  it("runs the post-write hooks, so a Nudge check is scheduled as for any Member edit", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const nudgeChecks = () =>
      t.run(
        async (ctx) =>
          (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (f) => f.name.includes("nudges"),
          ).length,
      );
    const before = await nudgeChecks();
    await t
      .withIdentity(identityFor("meera"))
      .mutation(api.history.undoGroup, { groupKey: s.runId });
    expect(await nudgeChecks()).toBe(before + 1);
  });

  it("redoes a reply by undoing its Undo all, which makes the reply undoable again", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.history.undoGroup, { groupKey: s.runId });

    const redo = await meera.mutation(api.history.undoGroup, {
      groupKey: await t.run((ctx) => newestGroupKey(ctx, s.eventId)),
    });
    expect(redo.message).toBe("Redid 8 of 8");
    expect(await t.run((ctx) => plannedAmounts(ctx, s.lines))).toEqual(
      Array(8).fill(20_000),
    );
    expect(
      await meera.query(api.history.groupStatus, { groupKey: s.runId }),
    ).toEqual({ canUndo: true, left: 8, total: 8 });

    const again = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(again.message).toBe("Undid 8 of 8");
    expect(await t.run((ctx) => plannedAmounts(ctx, s.lines))).toEqual(
      Array(8).fill(10_000),
    );
  });

  it("keeps each tap as its own history group, so undo, redo and undo again read as three", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.history.undoGroup, { groupKey: s.runId });
    const firstUndo = await t.run((ctx) => newestGroupKey(ctx, s.eventId));
    await meera.mutation(api.history.undoGroup, { groupKey: firstUndo });
    const redo = await t.run((ctx) => newestGroupKey(ctx, s.eventId));
    await meera.mutation(api.history.undoGroup, { groupKey: s.runId });
    const secondUndo = await t.run((ctx) => newestGroupKey(ctx, s.eventId));

    expect(new Set([firstUndo, redo, secondUndo]).size).toBe(3);
    expect(await t.run((ctx) => plannedAmounts(ctx, s.lines))).toEqual(
      Array(8).fill(10_000),
    );
    const { page } = await meera.query(api.history.list, {
      eventId: s.eventId,
      paginationOpts: firstPage,
    });
    const titles = [
      ...new Set(
        page
          .filter((r) => r.groupKey !== null && r.groupKey !== s.runId)
          .map((r) => `${r.groupKey}|${r.groupTitle}`),
      ),
    ].map((key) => key.split("|")[1]);
    expect(titles).toEqual([
      "Meera: Undo all of Plan the sangeet (8 changes)",
      "Meera: Redo Plan the sangeet (8 changes)",
      "Meera: Undo all of Plan the sangeet (8 changes)",
    ]);
  });

  it("lets Undo all finish after a Restore of one of its own rows (probe P1)", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const meera = t.withIdentity(identityFor("meera"));
    await meera.mutation(api.history.undoGroup, { groupKey: s.runId });
    const undoRow = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("changes")
          .withIndex("by_doc", (q) => q.eq("docId", s.lines[0]!))
          .order("desc")
          .first())!,
    );
    await meera.mutation(api.history.restore, { changeId: undoRow._id });
    expect(await t.run((ctx) => plannedAmounts(ctx, [s.lines[0]!]))).toEqual([
      20_000,
    ]);
    expect(
      await meera.query(api.history.groupStatus, { groupKey: s.runId }),
    ).toEqual({ canUndo: true, left: 1, total: 8 });

    const again = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(again.message).toBe("Undid 1 of 8");
    expect(await t.run((ctx) => plannedAmounts(ctx, [s.lines[0]!]))).toEqual([
      10_000,
    ]);
    expect(
      await meera.query(api.history.groupStatus, { groupKey: s.runId }),
    ).toEqual({ canUndo: true, left: 0, total: 8 });
  });

  it("counts a change someone already Restored by hand as undone, not as edited since (probe P2)", async () => {
    const t = newTest();
    const s = await t.run(sangeet);
    const caterer = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("changes")
          .withIndex("by_doc", (q) => q.eq("docId", s.lines[1]!))
          .first())!,
    );
    await t
      .withIdentity(identityFor("rohan"))
      .mutation(api.history.restore, { changeId: caterer._id });

    const meera = t.withIdentity(identityFor("meera"));
    const result = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(result.message).toBe("Undid 8 of 8");
    expect(await t.run((ctx) => plannedAmounts(ctx, s.lines))).toEqual(
      Array(8).fill(10_000),
    );
    expect(
      await meera.query(api.history.groupStatus, { groupKey: s.runId }),
    ).toEqual({ canUndo: true, left: 0, total: 8 });
  });

  it("names what it can never undo, keeps plan Items and Contingency lines, and lets the button reach Undone", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const s = await sangeet(ctx);
      const common = {
        runId: s.runId,
        forMembershipId: s.meera,
        groupLabel: "Plan the sangeet",
      };
      await assistantInsert(ctx, {
        ...common,
        table: "eventFunctions",
        toolCallId: "toolu_04",
        value: {
          eventId: s.eventId,
          key: "sangeet",
          name: "Sangeet",
          date: null,
          guests: null,
          assumed: [],
          order: 0,
        },
      });
      const { id: timelineId } = await assistantInsert(ctx, {
        ...common,
        table: "items",
        toolCallId: "toolu_05",
        value: {
          eventId: s.eventId,
          sectionId: s.sections.money,
          kind: "timeline",
          position: { x: 400, y: 0 },
          size: null,
          functionKey: null,
          data: { note: null },
          createdBy: { kind: "member", membershipId: s.meera },
        },
      });
      const { id: contingencyId } = await assistantInsert(ctx, {
        ...common,
        table: "entries",
        toolCallId: "toolu_06",
        value: {
          eventId: s.eventId,
          itemId: s.budgetId,
          kind: "budget",
          order: 9,
          functionKey: null,
          fields: { ...line("Contingency", 30_000), role: "contingency" },
          assumed: [],
          createdBy: { kind: "member", membershipId: s.meera },
        },
      });
      return { ...s, timelineId, contingencyId };
    });
    const meera = t.withIdentity(identityFor("meera"));

    const first = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(first.message).toBe(
      "Undid 8 of 11; Sangeet, the Timeline and Contingency can't be undone here",
    );
    const kept = await t.run(async (ctx) => ({
      timeline: await ctx.db.get("items", s.timelineId),
      contingency: await ctx.db.get("entries", s.contingencyId),
    }));
    expect(kept.timeline?.deletedAt).toBeNull();
    expect(kept.contingency?.deletedAt).toBeNull();
    expect(
      await meera.query(api.history.groupStatus, { groupKey: s.runId }),
    ).toEqual({ canUndo: true, left: 0, total: 11 });

    const second = await meera.mutation(api.history.undoGroup, {
      groupKey: s.runId,
    });
    expect(second.message).toBe(
      "Already undone; Sangeet, the Timeline and Contingency can't be undone here",
    );
  });

  describe("groupStatus", () => {
    it("tells a Member how many changes are left to undo, and a Viewer that they can't", async () => {
      const t = newTest();
      const s = await t.run(sangeet);
      const meera = t.withIdentity(identityFor("meera"));

      expect(
        await meera.query(api.history.groupStatus, { groupKey: s.runId }),
      ).toEqual({ canUndo: true, left: 8, total: 8 });
      expect(
        await t
          .withIdentity(identityFor("papa"))
          .query(api.history.groupStatus, { groupKey: s.runId }),
      ).toEqual({ canUndo: false, left: 8, total: 8 });

      await meera.mutation(api.history.undoGroup, { groupKey: s.runId });
      expect(
        await meera.query(api.history.groupStatus, { groupKey: s.runId }),
      ).toEqual({ canUndo: true, left: 0, total: 8 });
    });

    it("is null for a reply that changed nothing, and for someone outside the Event", async () => {
      const t = newTest();
      const s = await t.run(async (ctx) => {
        const s = await sangeet(ctx);
        await seedMembership(ctx, { clerkId: "stranger", role: "owner" });
        return s;
      });
      expect(
        await t
          .withIdentity(identityFor("meera"))
          .query(api.history.groupStatus, { groupKey: "chat-only-run" }),
      ).toBeNull();
      expect(
        await t
          .withIdentity(identityFor("stranger"))
          .query(api.history.groupStatus, { groupKey: s.runId }),
      ).toBeNull();
    });
  });
});
