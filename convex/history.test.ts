/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createStartingSections } from "./canvas";
import { identityFor, newTest, seedMembership } from "./lib/test.helpers";
import {
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
