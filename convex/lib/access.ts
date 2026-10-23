import { can } from "../../lib/access/permissions";
import type { UserIdentity } from "convex/server";
import type { Action } from "../../lib/types/roles";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AccessDenied } from "./errors";

type Ctx = QueryCtx | MutationCtx;

function isMutationCtx(ctx: Ctx): ctx is MutationCtx {
  return "insert" in ctx.db;
}

/**
 * The `users` row for a Clerk identity, or null. Looks it up by
 * `tokenIdentifier`, Convex's stable identity key, and falls back to the Clerk
 * user ID for rows made ahead of a first sign-in (the demo judges, section 5.1),
 * which have no `tokenIdentifier` yet.
 */
async function findUser(
  ctx: Ctx,
  identity: UserIdentity,
): Promise<Doc<"users"> | null> {
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (byToken !== null) return byToken;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/**
 * The name shown to everyone in a person's Events, never their full email
 * address (#83): Clerk's name, else the part of the email before `@`, else
 * "Someone". A blank name, or one that is itself an email address (as stored
 * before this rule), counts as no name.
 */
function displayName(
  names: readonly (string | undefined)[],
  email: string | undefined,
): string {
  const name = names
    .map((n) => n?.trim())
    .find((n): n is string => n !== undefined && n !== "" && !n.includes("@"));
  if (name !== undefined) return name;
  const local = email?.split("@")[0]?.trim();
  return local ? local : "Someone";
}

/** The profile fields Clerk owns, as the `users` row stores them. */
function profileFrom(identity: UserIdentity, existing: Doc<"users"> | null) {
  return {
    name: displayName(
      [identity.name, existing?.name],
      identity.email ?? existing?.email,
    ),
    email: (identity.email ?? existing?.email ?? "").toLowerCase(),
    imageUrl: identity.pictureUrl ?? existing?.imageUrl ?? null,
  };
}

/**
 * The signed-in caller's `users` row (IMPLEMENTATION_PLAN.md section 4.3).
 * Refuses anyone not signed in. In a mutation it upserts the row from the Clerk
 * identity: it creates the row on the first call, links a row made ahead by
 * Clerk ID, and refreshes the name, email (lowercased) and picture whenever
 * Clerk's claims change. In a query, where nothing can be written, a caller
 * with no row yet is refused with reason "noUser" (the client calls
 * `api.users.ensureMe` right after sign-in).
 *
 * Use it only for the narrow exceptions of section 4.3; every other read or
 * write of Event data goes through `requireAccess`.
 */
export async function requireIdentity(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new AccessDenied("signedOut");

  const existing = await findUser(ctx, identity);
  if (!isMutationCtx(ctx)) {
    if (existing === null) throw new AccessDenied("noUser");
    return existing;
  }

  const profile = profileFrom(identity, existing);
  if (existing === null) {
    const id = await ctx.db.insert("users", {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      ...profile,
      mobilePointing: null,
      keepDontReplyOn: false,
    });
    return (await ctx.db.get("users", id))!;
  }

  const stale =
    existing.tokenIdentifier !== identity.tokenIdentifier ||
    existing.name !== profile.name ||
    existing.email !== profile.email ||
    existing.imageUrl !== profile.imageUrl;
  if (!stale) return existing;
  await ctx.db.patch("users", existing._id, {
    tokenIdentifier: identity.tokenIdentifier,
    ...profile,
  });
  return (await ctx.db.get("users", existing._id))!;
}

/** Refuses a membership that isn't active and unblocked, or whose role can't take the action. */
function checkMembership(membership: Doc<"memberships">, action: Action): void {
  if (membership.blocked) throw new AccessDenied("blocked", action);
  if (membership.status === "left") throw new AccessDenied("left", action);
  if (membership.status === "removed")
    throw new AccessDenied("removed", action);
  if (!can(membership.role, action))
    throw new AccessDenied("notAllowed", action);
}

/**
 * The gate for every Event-scoped query, mutation and action: loads the
 * caller's membership, refuses anyone not active (left, removed or blocked)
 * and checks the action against the roles.md permissions table.
 * Throws `AccessDenied`.
 */
export async function requireAccess(
  ctx: Ctx,
  eventId: Id<"events">,
  action: Action,
): Promise<{ membership: Doc<"memberships">; user: Doc<"users"> }> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new AccessDenied("signedOut", action);
  const user = await findUser(ctx, identity);
  if (user === null) throw new AccessDenied("notAMember", action);

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id),
    )
    .unique();
  if (membership === null) throw new AccessDenied("notAMember", action);
  checkMembership(membership, action);
  return { membership, user };
}

/**
 * The same gate for the Assistant acting for a Member (section 4.3): every
 * Assistant tool call, read or write, checks the membership it answers, so a
 * Member removed or switched to Viewer mid-reply is refused from that moment.
 */
export async function requireAccessFor(
  ctx: Ctx,
  membershipId: Id<"memberships">,
  eventId: Id<"events">,
  action: Action,
): Promise<{ membership: Doc<"memberships">; user: Doc<"users"> }> {
  const membership = await ctx.db.get("memberships", membershipId);
  if (membership === null) throw new AccessDenied("notAMember", action);
  if (membership.eventId !== eventId)
    throw new AccessDenied("wrongEvent", action);
  checkMembership(membership, action);
  const user = await ctx.db.get("users", membership.userId);
  if (user === null) throw new AccessDenied("notAMember", action);
  return { membership, user };
}
