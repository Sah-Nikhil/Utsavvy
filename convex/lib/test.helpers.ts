/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";

/**
 * Test helpers for `convex-test` (Vitest, edge-runtime). Not a Convex function
 * module: it exports no queries or mutations.
 */
export const modules = import.meta.glob("../**/*.ts");

export function newTest() {
  return convexTest(schema, modules);
}

/** Inserts a user, an Event and that user's membership, all as given. */
export async function seedMembership(
  ctx: MutationCtx,
  opts: {
    clerkId: string;
    role?: Doc<"memberships">["role"];
    status?: Doc<"memberships">["status"];
    blocked?: boolean;
    eventId?: Id<"events">;
  },
): Promise<{
  userId: Id<"users">;
  eventId: Id<"events">;
  membershipId: Id<"memberships">;
}> {
  const userId = await ctx.db.insert("users", {
    clerkId: opts.clerkId,
    name: opts.clerkId,
    email: `${opts.clerkId}@example.com`,
    imageUrl: null,
    mobilePointing: null,
    keepDontReplyOn: false,
  });
  const eventId = opts.eventId ?? (await insertEvent(ctx));
  const membershipId = await ctx.db.insert("memberships", {
    eventId,
    userId,
    role: opts.role ?? "member",
    status: opts.status ?? "active",
    blocked: opts.blocked ?? false,
    displayName: opts.clerkId,
    joinedAt: 0,
    endedAt: opts.status && opts.status !== "active" ? 1 : null,
  });
  return { userId, eventId, membershipId };
}

/** Inserts a minimal Event with no Brief yet. */
export async function insertEvent(
  ctx: MutationCtx,
  name = "Test Event",
): Promise<Id<"events">> {
  return await ctx.db.insert("events", {
    name,
    eventType: "wedding",
    ownerLabel: "owner",
    city: null,
    tradition: null,
    communityKind: null,
    honoree: null,
    households: null,
    budgetTotal: null,
    contingencyShare: 0.1,
    theme: { palette: [], styleWords: [], decorKeywords: [] },
    briefState: "intake",
    brief: null,
    budgetCheck: null,
    uploadRightsOn: false,
    defaults: {
      view: "canvas",
      compactGrouping: "kind",
      mobilePointing: "jump",
    },
    startingSectionRenameBlocked: false,
    memberLinkToken: `m-${name}`,
    viewerLinkToken: `v-${name}`,
    agentThreadId: null,
    demoKey: null,
    createdAt: 0,
    version: 1,
  });
}

/** The Clerk-style identity convex-test should present for a seeded user. */
export function identityFor(clerkId: string) {
  return { subject: clerkId, name: clerkId, email: `${clerkId}@example.com` };
}
