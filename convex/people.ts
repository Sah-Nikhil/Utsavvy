import { v, type Infer } from "convex/values";
import { can } from "../lib/access/permissions";
import type { Action, Role } from "../lib/types/roles";
import {
  inviteRoleValidator,
  membershipStatusValidator,
  roleValidator,
} from "../lib/types/roles";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess, requireIdentity } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { MAX_PEOPLE_PER_EVENT } from "./lib/settings";
import { recordPeopleChange } from "./lib/write";

// S1 owns this file: invite links, joining (api.people.join), roles, removal,
// blocking and leaving, as docs/design/roles.md describes. Every change here
// writes a `changes` row with op "people" through `recordPeopleChange`.

/** What `join` says when it refuses, worded as in roles.md. */
export const JOIN_REFUSALS = {
  removed: "You were removed from this Event.",
  full: "This Event is full. Ask the Owner to make room.",
  invalid:
    "This invite link doesn't work any more. Ask whoever sent it for a new one.",
} as const;
type Refusal = keyof typeof JOIN_REFUSALS;

/**
 * A new invite link token: 24 random bytes as hex. Convex seeds the mutation's
 * random source per call, out of any client's reach.
 */
export function newInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The fields of a membership a people change records: never a token. */
export function peopleSnapshot(
  m: Pick<Doc<"memberships">, "role" | "status" | "blocked" | "displayName">,
) {
  return {
    role: m.role,
    status: m.status,
    blocked: m.blocked,
    displayName: m.displayName,
  };
}

async function writePeopleChange(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    actorId: Id<"memberships">;
    membershipId: Id<"memberships">;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  },
) {
  await recordPeopleChange(ctx, {
    eventId: args.eventId,
    actor: { kind: "member", membershipId: args.actorId },
    membershipId: args.membershipId,
    before: args.before,
    after: args.after,
  });
}

/**
 * People counted against the 25-person cap: active memberships plus pending
 * email invites (roles.md, "Joining").
 */
async function headcount(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<number> {
  let count = 0;
  for await (const m of ctx.db
    .query("memberships")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))) {
    if (m.status === "active") count++;
  }
  for await (const _invite of ctx.db
    .query("emailInvites")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))) {
    count++;
  }
  return count;
}

/**
 * Cancels the person's queued Assistant runs (IMPLEMENTATION_PLAN.md section
 * 4.3), in the mutation that ends or narrows their access. A running reply
 * finishes its text; its tool calls are already refused by `requireAccessFor`.
 */
async function cancelQueuedRuns(
  ctx: MutationCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
): Promise<void> {
  const now = Date.now();
  for await (const run of ctx.db
    .query("runs")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", "queued"),
    )) {
    if (run.requestedBy !== membershipId) continue;
    await ctx.db.patch("runs", run._id, { status: "cancelled", endedAt: now });
  }
}

/** The target membership of a people change, refused unless it belongs to this Event. */
async function targetIn(
  ctx: QueryCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
  action: Action,
): Promise<Doc<"memberships">> {
  const target = await ctx.db.get("memberships", membershipId);
  if (target === null || target.eventId !== eventId) {
    throw new AccessDenied("wrongEvent", action);
  }
  return target;
}

// ---------------------------------------------------------------------------
// Joining

const joinResultValidator = v.union(
  v.object({
    kind: v.union(v.literal("joined"), v.literal("alreadyIn")),
    eventId: v.id("events"),
    role: roleValidator,
  }),
  v.object({
    kind: v.literal("refused"),
    reason: v.union(
      v.literal("removed"),
      v.literal("full"),
      v.literal("invalid"),
    ),
    message: v.string(),
  }),
);

function refused(reason: Refusal) {
  return { kind: "refused" as const, reason, message: JOIN_REFUSALS[reason] };
}

/**
 * Joins the Event behind an invite link with the link's role (an access
 * exception of section 4.3). Someone already in keeps their role. A reset or
 * unknown token, a blocked person and a full Event are refused with no
 * membership written and no Event data returned. Someone who left, or was
 * removed and then unblocked, comes back on their old membership, so their
 * earlier work keeps pointing at them.
 */
export const join = mutation({
  args: { token: v.string() },
  returns: joinResultValidator,
  handler: async (ctx, { token }) => {
    const user = await requireIdentity(ctx);
    const link = await ctx.db
      .query("inviteLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (link === null) return refused("invalid");
    const { eventId } = link;

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique();
    if (existing?.blocked) return refused("removed");
    if (existing?.status === "active") {
      return { kind: "alreadyIn" as const, eventId, role: existing.role };
    }
    if ((await headcount(ctx, eventId)) >= MAX_PEOPLE_PER_EVENT) {
      return refused("full");
    }

    const now = Date.now();
    const joined = {
      role: link.role,
      status: "active" as const,
      blocked: false,
      displayName: user.name,
      joinedAt: now,
      endedAt: null,
    };
    let membershipId: Id<"memberships">;
    if (existing === null) {
      membershipId = await ctx.db.insert("memberships", {
        eventId,
        userId: user._id,
        ...joined,
      });
    } else {
      membershipId = existing._id;
      await ctx.db.patch("memberships", membershipId, joined);
    }
    await writePeopleChange(ctx, {
      eventId,
      actorId: membershipId,
      membershipId,
      before: existing === null ? null : peopleSnapshot(existing),
      after: peopleSnapshot(joined),
    });
    return { kind: "joined" as const, eventId, role: link.role };
  },
});

// ---------------------------------------------------------------------------
// Reading

const personValidator = v.object({
  membershipId: v.id("memberships"),
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  role: roleValidator,
  status: membershipStatusValidator,
  blocked: v.boolean(),
  joinedAt: v.number(),
  isMe: v.boolean(),
});

const ROLE_ORDER: Record<Role, number> = {
  owner: 0,
  coOwner: 1,
  member: 2,
  viewer: 3,
};

/**
 * Everyone who is or was in the Event: active people by role, then people who
 * left. Removed people show as having left, except to the Owner and Co-owners,
 * who see them as removed and blocked so they can unblock them.
 */
export const list = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    ownerLabel: v.union(v.literal("owner"), v.literal("host")),
    people: v.array(personValidator),
  }),
  handler: async (ctx, { eventId }) => {
    const { membership: me } = await requireAccess(ctx, eventId, "canvas.view");
    const event = await ctx.db.get("events", eventId);
    const seesBlocked = can(me.role, "member.unblock");
    const people: Infer<typeof personValidator>[] = [];
    for await (const m of ctx.db
      .query("memberships")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))) {
      const user = await ctx.db.get("users", m.userId);
      const hidden = m.status === "removed" && !seesBlocked;
      people.push({
        membershipId: m._id,
        name: m.displayName,
        imageUrl: user?.imageUrl ?? null,
        role: m.role,
        status: hidden ? ("left" as const) : m.status,
        blocked: hidden ? false : m.blocked,
        joinedAt: m.joinedAt,
        isMe: m._id === me._id,
      });
    }
    const rank = (p: Infer<typeof personValidator>) =>
      (p.status === "active" ? 0 : 10) + ROLE_ORDER[p.role];
    people.sort((a, b) => rank(a) - rank(b) || a.joinedAt - b.joinedAt);
    return { ownerLabel: event?.ownerLabel ?? "owner", people };
  },
});

/** The Member and Viewer link tokens: the Owner and Co-owners only. */
export const links = query({
  args: { eventId: v.id("events") },
  returns: v.object({ member: v.string(), viewer: v.string() }),
  handler: async (ctx, { eventId }) => {
    await requireAccess(ctx, eventId, "invite.links");
    const tokens = { member: "", viewer: "" };
    for await (const link of ctx.db
      .query("inviteLinks")
      .withIndex("by_event_role", (q) => q.eq("eventId", eventId))) {
      tokens[link.role] = link.token;
    }
    return tokens;
  },
});

/**
 * The caller's own place in the Event, for the UI (`useMembership`): their role
 * and the Event's Owner label, or why they have no access. Never throws for a
 * refusal, so a page can show "You were removed from this Event." instead of
 * an error. Takes the page address's ID as a plain string, so a mistyped
 * `/events/<id>` shows "not in this Event" rather than a validator error.
 */
export const me = query({
  args: { eventId: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("active"),
      membershipId: v.id("memberships"),
      role: roleValidator,
      ownerLabel: v.union(v.literal("owner"), v.literal("host")),
    }),
    v.object({ status: v.literal("denied"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) {
      return { status: "denied" as const, reason: "notAMember" };
    }
    try {
      const { membership } = await requireAccess(ctx, eventId, "canvas.view");
      const event = await ctx.db.get("events", eventId);
      return {
        status: "active" as const,
        membershipId: membership._id,
        role: membership.role,
        ownerLabel: event?.ownerLabel ?? "owner",
      };
    } catch (error) {
      if (error instanceof AccessDenied) {
        return { status: "denied" as const, reason: error.data.reason };
      }
      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// Changing people

/**
 * Switches someone's role. Member and Viewer switches are for the Owner and
 * Co-owners; making or unmaking a Co-owner is the Owner's alone; nobody changes
 * the Owner (ownership moves only by transfer, X6). Someone switched to Viewer
 * loses their queued Assistant runs at once.
 */
export const setRole = mutation({
  args: {
    eventId: v.id("events"),
    membershipId: v.id("memberships"),
    role: v.union(
      v.literal("coOwner"),
      v.literal("member"),
      v.literal("viewer"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, membershipId, role }) => {
    const existing = await ctx.db.get("memberships", membershipId);
    const action: Action =
      existing?.role === "coOwner" || role === "coOwner"
        ? "coOwner.make"
        : "member.switchRole";
    const { membership: actor } = await requireAccess(ctx, eventId, action);
    const target = await targetIn(ctx, eventId, membershipId, action);
    if (target.role === "owner" || target.status !== "active") {
      throw new AccessDenied("notAllowed", action);
    }
    if (target.role === role) return null;

    await ctx.db.patch("memberships", membershipId, { role });
    if (role === "viewer") await cancelQueuedRuns(ctx, eventId, membershipId);
    await writePeopleChange(ctx, {
      eventId,
      actorId: actor._id,
      membershipId,
      before: peopleSnapshot(target),
      after: peopleSnapshot({ ...target, role }),
    });
    return null;
  },
});

/**
 * Removes someone: their access ends at once, they are blocked from rejoining
 * by link, and their queued runs are cancelled in this same mutation. Their
 * work stays under their name. A Member or Viewer is removed by the Owner or a
 * Co-owner, a Co-owner by the Owner only, and the Owner by nobody.
 */
export const remove = mutation({
  args: { eventId: v.id("events"), membershipId: v.id("memberships") },
  returns: v.null(),
  handler: async (ctx, { eventId, membershipId }) => {
    const existing = await ctx.db.get("memberships", membershipId);
    const action: Action =
      existing?.role === "coOwner" ? "coOwner.remove" : "member.remove";
    const { membership: actor } = await requireAccess(ctx, eventId, action);
    const target = await targetIn(ctx, eventId, membershipId, action);
    if (target.role === "owner" || target._id === actor._id) {
      throw new AccessDenied("notAllowed", action);
    }
    if (target.status === "removed" && target.blocked) return null;

    const removed = {
      status: "removed" as const,
      blocked: true,
      endedAt: target.status === "active" ? Date.now() : target.endedAt,
    };
    await ctx.db.patch("memberships", membershipId, removed);
    await cancelQueuedRuns(ctx, eventId, membershipId);
    await writePeopleChange(ctx, {
      eventId,
      actorId: actor._id,
      membershipId,
      before: peopleSnapshot(target),
      after: peopleSnapshot({ ...target, ...removed }),
    });
    return null;
  },
});

/** Lifts a removed person's block, so they can rejoin through a link. The Owner and Co-owners. */
export const unblock = mutation({
  args: { eventId: v.id("events"), membershipId: v.id("memberships") },
  returns: v.null(),
  handler: async (ctx, { eventId, membershipId }) => {
    const { membership: actor } = await requireAccess(
      ctx,
      eventId,
      "member.unblock",
    );
    const target = await targetIn(ctx, eventId, membershipId, "member.unblock");
    if (!target.blocked) return null;
    await ctx.db.patch("memberships", membershipId, { blocked: false });
    await writePeopleChange(ctx, {
      eventId,
      actorId: actor._id,
      membershipId,
      before: peopleSnapshot(target),
      after: peopleSnapshot({ ...target, blocked: false }),
    });
    return null;
  },
});

/**
 * Replaces one link's token, so the old link stops working at once. The
 * history names who reset which link, never the token. The Owner and Co-owners.
 */
export const resetLink = mutation({
  args: { eventId: v.id("events"), role: inviteRoleValidator },
  returns: v.null(),
  handler: async (ctx, { eventId, role }) => {
    const { membership: actor } = await requireAccess(
      ctx,
      eventId,
      "invite.links",
    );
    const fresh = {
      token: newInviteToken(),
      createdBy: actor._id,
      createdAt: Date.now(),
    };
    const link = await ctx.db
      .query("inviteLinks")
      .withIndex("by_event_role", (q) =>
        q.eq("eventId", eventId).eq("role", role),
      )
      .unique();
    if (link === null) {
      await ctx.db.insert("inviteLinks", { eventId, role, ...fresh });
    } else {
      await ctx.db.patch("inviteLinks", link._id, fresh);
    }
    await writePeopleChange(ctx, {
      eventId,
      actorId: actor._id,
      membershipId: actor._id,
      before: null,
      after: { linkReset: role },
    });
    return null;
  },
});

/**
 * Leaves the Event. Anyone but the Owner, who must transfer ownership first
 * (the permissions table leaves "owner" out of `event.leave`). Their work stays,
 * shown with "(left)", and they can rejoin through a link.
 */
export const leave = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const { membership } = await requireAccess(ctx, eventId, "event.leave");
    const left = { status: "left" as const, endedAt: Date.now() };
    await ctx.db.patch("memberships", membership._id, left);
    await cancelQueuedRuns(ctx, eventId, membership._id);
    await writePeopleChange(ctx, {
      eventId,
      actorId: membership._id,
      membershipId: membership._id,
      before: peopleSnapshot(membership),
      after: peopleSnapshot({ ...membership, ...left }),
    });
    return null;
  },
});
