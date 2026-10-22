import { describe, expect, it } from "vitest";
import { HISTORY_TABLES } from "../../lib/types/history";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { newTest, seedMembership } from "./test.helpers";
import { assistantWrite, memberWrite } from "./write";

// Invite links are bearer tokens: whoever holds one can join the Event. Members
// and Viewers can read Event history and conflict payloads, so the tokens must
// never appear in either (Owner and Co-owners only, `invite.links`).

const MEMBER_TOKEN = "member-link-7f3a9c";
const VIEWER_TOKEN = "viewer-link-2b8e1d";

async function setUp(ctx: MutationCtx) {
  const { eventId, membershipId } = await seedMembership(ctx, {
    clerkId: "meera",
    role: "owner",
  });
  for (const [role, token] of [
    ["member", MEMBER_TOKEN],
    ["viewer", VIEWER_TOKEN],
  ] as const) {
    await ctx.db.insert("inviteLinks", {
      eventId,
      role,
      token,
      createdBy: membershipId,
      createdAt: 0,
    });
  }
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
  return { eventId, membershipId, runId };
}

/** Fails if a payload carries an invite token or any token-named field. */
function expectNoInviteToken(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toContain(MEMBER_TOKEN);
  expect(json).not.toContain(VIEWER_TOKEN);
  expect(json).not.toMatch(/token/i);
}

describe("invite link tokens", () => {
  it("live outside every versioned table", () => {
    expect(HISTORY_TABLES as readonly string[]).not.toContain("inviteLinks");
  });

  it("never reach an Event's changes row", async () => {
    const t = newTest();
    const s = await t.run(setUp);
    await t.run((ctx) =>
      memberWrite(ctx, {
        table: "events",
        id: s.eventId,
        patch: { name: "Meera weds Rohan" },
        actor: { kind: "member", membershipId: s.membershipId },
      }),
    );
    const changes = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_doc", (q) => q.eq("docId", s.eventId))
        .collect(),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      before: { name: "Test Event" },
      after: { name: "Meera weds Rohan" },
    });
    expectNoInviteToken(changes);
  });

  it("never reach a VersionConflict payload for a stale Event write", async () => {
    const t = newTest();
    const s = await t.run(setUp);
    const error = await t
      .run((ctx) =>
        assistantWrite(ctx, {
          table: "events",
          id: s.eventId as Id<"events">,
          expectedVersion: 0,
          patch: { name: "Stale rename" },
          runId: s.runId,
          toolCallId: "toolu_stale_event",
          forMembershipId: s.membershipId,
        }),
      )
      .then(
        () => null,
        (e: unknown) => e as { data: unknown },
      );
    expect(error?.data).toMatchObject({
      kind: "VersionConflict",
      table: "events",
      current: { name: "Test Event" },
    });
    expectNoInviteToken(error?.data);
  });
});
