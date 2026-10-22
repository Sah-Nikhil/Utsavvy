import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { newTest, seedMembership } from "./test.helpers";
import {
  assistantInsert,
  assistantSoftDelete,
  assistantWrite,
  memberInsert,
  memberSoftDelete,
  memberWrite,
} from "./write";

// The two registered post-write hooks are stubs owned by S8 and S17; here they
// are replaced by spies so the test can watch every call.
const hooks = vi.hoisted(() => ({
  passagesAfterWrite: vi.fn(async () => {}),
  nudgesAfterWrite: vi.fn(async () => {}),
}));
vi.mock("../comments", () => ({
  passagesAfterWrite: hooks.passagesAfterWrite,
}));
vi.mock("../nudges", () => ({ nudgesAfterWrite: hooks.nudgesAfterWrite }));

beforeEach(() => {
  hooks.passagesAfterWrite.mockReset();
  hooks.nudgesAfterWrite.mockReset();
  hooks.passagesAfterWrite.mockImplementation(async () => {});
  hooks.nudgesAfterWrite.mockImplementation(async () => {});
});

/** An Event with Meera as a Member and one starting Section. */
async function setUp(ctx: MutationCtx) {
  const { eventId, membershipId } = await seedMembership(ctx, {
    clerkId: "meera",
  });
  const sectionId = await ctx.db.insert("sections", {
    eventId,
    kind: "notes",
    name: "Notes",
    frame: { x: 0, y: 0, w: 400, h: 300 },
    order: 3,
    version: 1,
    deletedAt: null,
  });
  const runId = await ctx.db.insert("runs", {
    eventId,
    requestedBy: membershipId,
    source: "chat",
    messageId: null,
    commentId: null,
    status: "running",
    stoppedBy: null,
    model: "claude-sonnet-5-5",
    createdAt: 0,
    startedAt: 0,
    endedAt: null,
  });
  return { eventId, membershipId, sectionId, runId };
}

const meera = (membershipId: Id<"memberships">) => ({
  kind: "member" as const,
  membershipId,
});

function noteValue(
  eventId: Id<"events">,
  sectionId: Id<"sections">,
  membershipId: Id<"memberships">,
  text: string,
) {
  return {
    eventId,
    sectionId,
    kind: "note" as const,
    position: { x: 10, y: 20 },
    size: null,
    functionKey: null,
    data: { text, citations: [] },
    createdBy: meera(membershipId),
  };
}

async function changesOf(ctx: MutationCtx, docId: string) {
  return await ctx.db
    .query("changes")
    .withIndex("by_doc", (q) => q.eq("docId", docId as Id<"items">))
    .collect();
}

describe("post-write hooks", () => {
  type Helper = {
    name: string;
    op: "create" | "update" | "delete";
    write: (
      ctx: MutationCtx,
      s: Awaited<ReturnType<typeof setUp>> & { noteId: Id<"items"> },
    ) => Promise<{ id: Id<"items"> }>;
  };
  const helpers: Helper[] = [
    {
      name: "memberInsert",
      op: "create",
      write: async (ctx, s) =>
        memberInsert(ctx, {
          table: "items",
          value: noteValue(
            s.eventId,
            s.sectionId,
            s.membershipId,
            "Kota cousins",
          ),
          actor: meera(s.membershipId),
        }),
    },
    {
      name: "memberWrite",
      op: "update",
      write: async (ctx, s) => {
        await memberWrite(ctx, {
          table: "items",
          id: s.noteId,
          patch: { position: { x: 50, y: 60 } },
          actor: meera(s.membershipId),
        });
        return { id: s.noteId };
      },
    },
    {
      name: "memberSoftDelete",
      op: "delete",
      write: async (ctx, s) => {
        await memberSoftDelete(ctx, {
          table: "items",
          id: s.noteId,
          actor: meera(s.membershipId),
        });
        return { id: s.noteId };
      },
    },
    {
      name: "assistantInsert",
      op: "create",
      write: async (ctx, s) =>
        assistantInsert(ctx, {
          table: "items",
          value: noteValue(
            s.eventId,
            s.sectionId,
            s.membershipId,
            "Ask about parking",
          ),
          runId: s.runId,
          toolCallId: "call-insert",
          forMembershipId: s.membershipId,
        }),
    },
    {
      name: "assistantWrite",
      op: "update",
      write: async (ctx, s) => {
        await assistantWrite(ctx, {
          table: "items",
          id: s.noteId,
          expectedVersion: 1,
          patch: { position: { x: 70, y: 80 } },
          runId: s.runId,
          toolCallId: "call-write",
          forMembershipId: s.membershipId,
        });
        return { id: s.noteId };
      },
    },
    {
      name: "assistantSoftDelete",
      op: "delete",
      write: async (ctx, s) => {
        await assistantSoftDelete(ctx, {
          table: "items",
          id: s.noteId,
          expectedVersion: 1,
          runId: s.runId,
          toolCallId: "call-delete",
          forMembershipId: s.membershipId,
        });
        return { id: s.noteId };
      },
    },
  ];

  it.each(helpers)(
    "$name runs every registered hook exactly once, in the same mutation, with that write's WriteEvent",
    async ({ name, op, write }) => {
      const t = newTest();
      await t.run(async (ctx) => {
        const s = await setUp(ctx);
        const noteId = (await ctx.db.insert("items", {
          ...noteValue(s.eventId, s.sectionId, s.membershipId, "Original"),
          version: 1,
          deletedAt: null,
        })) as Id<"items">;

        const { id } = await write(ctx, { ...s, noteId });

        const after = await ctx.db.get("items", id);
        for (const hook of [hooks.passagesAfterWrite, hooks.nudgesAfterWrite]) {
          expect(hook).toHaveBeenCalledTimes(1);
          expect(hook).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
              eventId: s.eventId,
              table: "items",
              docId: id,
              op,
              after,
              before:
                op === "create"
                  ? null
                  : expect.objectContaining({ _id: id, version: 1 }),
              actor: name.startsWith("member")
                ? { kind: "member", membershipId: s.membershipId }
                : expect.objectContaining({
                    kind: "assistant",
                    forMembershipId: s.membershipId,
                  }),
            }),
          );
        }
      });
    },
  );

  it("a hook that throws rolls the write back", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const base = await setUp(ctx);
      const noteId = await ctx.db.insert("items", {
        ...noteValue(
          base.eventId,
          base.sectionId,
          base.membershipId,
          "Original",
        ),
        version: 1,
        deletedAt: null,
      });
      return { ...base, noteId };
    });
    hooks.nudgesAfterWrite.mockImplementation(async () => {
      throw new Error("nudge check failed");
    });

    await expect(
      t.run((ctx) =>
        memberWrite(ctx, {
          table: "items",
          id: s.noteId,
          patch: { data: { text: "Changed", citations: [] } },
          actor: meera(s.membershipId),
        }),
      ),
    ).rejects.toThrow("nudge check failed");

    await t.run(async (ctx) => {
      const note = await ctx.db.get("items", s.noteId);
      expect(note).toMatchObject({ version: 1, data: { text: "Original" } });
      expect(await changesOf(ctx, s.noteId)).toHaveLength(0);
    });
  });
});

describe("assistantWrite", () => {
  async function seedNote(t: ReturnType<typeof newTest>) {
    return await t.run(async (ctx) => {
      const base = await setUp(ctx);
      const noteId = await ctx.db.insert("items", {
        ...noteValue(
          base.eventId,
          base.sectionId,
          base.membershipId,
          "Book the mehendi artist",
        ),
        version: 3,
        deletedAt: null,
      });
      return { ...base, noteId };
    });
  }

  it("with the right expectedVersion bumps the version and writes one changes row with before and after", async () => {
    const t = newTest();
    const s = await seedNote(t);
    const runId = s.runId;

    const result = await t.run((ctx) =>
      assistantWrite(ctx, {
        table: "items",
        id: s.noteId,
        expectedVersion: 3,
        patch: {
          data: { text: "Book the mehendi artist by 15 Nov", citations: [] },
        },
        runId,
        toolCallId: "toolu_01",
        forMembershipId: s.membershipId,
      }),
    );
    expect(result).toEqual({ version: 4 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get("items", s.noteId)).toMatchObject({
        version: 4,
        data: { text: "Book the mehendi artist by 15 Nov" },
      });
      const changes = await changesOf(ctx, s.noteId);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        eventId: s.eventId,
        table: "items",
        op: "update",
        groupKey: runId,
        actor: { kind: "assistant", forMembershipId: s.membershipId, runId },
        before: { version: 3, data: { text: "Book the mehendi artist" } },
        after: {
          version: 4,
          data: { text: "Book the mehendi artist by 15 Nov" },
        },
      });
    });
  });

  it("with a stale expectedVersion throws VersionConflict carrying the current value", async () => {
    const t = newTest();
    const s = await seedNote(t);
    await expect(
      t.run((ctx) =>
        assistantWrite(ctx, {
          table: "items",
          id: s.noteId,
          expectedVersion: 2,
          patch: { data: { text: "Overwritten", citations: [] } },
          runId: s.runId,
          toolCallId: "toolu_stale",
          forMembershipId: s.membershipId,
        }),
      ),
    ).rejects.toMatchObject({
      data: {
        kind: "VersionConflict",
        table: "items",
        id: s.noteId,
        expectedVersion: 2,
        currentVersion: 3,
        current: { data: { text: "Book the mehendi artist" } },
      },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get("items", s.noteId)).toMatchObject({ version: 3 });
      expect(await changesOf(ctx, s.noteId)).toHaveLength(0);
    });
  });

  it("repeating the same runId:toolCallId returns the first result and writes nothing", async () => {
    const t = newTest();
    const s = await seedNote(t);
    const call = (text: string) =>
      t.run((ctx) =>
        assistantWrite(ctx, {
          table: "items",
          id: s.noteId,
          expectedVersion: 3,
          patch: { data: { text, citations: [] } },
          runId: s.runId,
          toolCallId: "toolu_repeat",
          forMembershipId: s.membershipId,
        }),
      );

    expect(await call("First")).toEqual({ version: 4 });
    expect(await call("Second")).toEqual({ version: 4 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get("items", s.noteId)).toMatchObject({
        version: 4,
        data: { text: "First" },
      });
      expect(await changesOf(ctx, s.noteId)).toHaveLength(1);
    });
    expect(hooks.passagesAfterWrite).toHaveBeenCalledTimes(1);
  });
});

describe("memberWrite", () => {
  it("two writes in a row both succeed (last write wins) and the history has both", async () => {
    const t = newTest();
    const s = await t.run(async (ctx) => {
      const base = await setUp(ctx);
      const noteId = await ctx.db.insert("items", {
        ...noteValue(base.eventId, base.sectionId, base.membershipId, "Draft"),
        version: 1,
        deletedAt: null,
      });
      return { ...base, noteId };
    });
    const write = (text: string) =>
      t.run((ctx) =>
        memberWrite(ctx, {
          table: "items",
          id: s.noteId,
          patch: { data: { text, citations: [] } },
          actor: meera(s.membershipId),
        }),
      );

    expect(await write("Rohan's version")).toEqual({ version: 2 });
    expect(await write("Meera's version")).toEqual({ version: 3 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get("items", s.noteId)).toMatchObject({
        version: 3,
        data: { text: "Meera's version" },
      });
      const history = await changesOf(ctx, s.noteId);
      expect(
        history.map((c) => [c.before.data.text, c.after.data.text]),
      ).toEqual([
        ["Draft", "Rohan's version"],
        ["Rohan's version", "Meera's version"],
      ]);
      expect(
        history.every((c) => c.actor.kind === "member" && c.groupKey === null),
      ).toBe(true);
    });
  });
});
