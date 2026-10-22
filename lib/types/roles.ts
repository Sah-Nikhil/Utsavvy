import { v, type Infer } from "convex/values";

/** The four roles of docs/design/roles.md. Owner and Co-owners are Members; a Viewer is not. */
export const roleValidator = v.union(
  v.literal("owner"),
  v.literal("coOwner"),
  v.literal("member"),
  v.literal("viewer"),
);
export type Role = Infer<typeof roleValidator>;
export const ROLES: readonly Role[] = ["owner", "coOwner", "member", "viewer"];

/** A role an invite link or email invite can give. Co-owner is never given by link. */
export const inviteRoleValidator = v.union(
  v.literal("member"),
  v.literal("viewer"),
);
export type InviteRole = Infer<typeof inviteRoleValidator>;

/**
 * One invite link (table `inviteLinks`): a bearer token that lets whoever opens
 * `/join/<token>` join the Event in `role`. Never part of the Event document,
 * its history or a conflict payload; only the Owner and Co-owners read it.
 */
export const inviteLinkValidator = v.object({
  eventId: v.id("events"),
  role: inviteRoleValidator,
  token: v.string(),
  createdBy: v.id("memberships"),
  createdAt: v.number(),
});
export type InviteLink = Infer<typeof inviteLinkValidator>;

export const membershipStatusValidator = v.union(
  v.literal("active"),
  v.literal("left"),
  v.literal("removed"),
);
export type MembershipStatus = Infer<typeof membershipStatusValidator>;

/**
 * One action per row of the permissions table in docs/design/roles.md, in the
 * same order. `lib/access/permissions.ts` says which roles may do each one.
 */
export const ACTIONS = [
  "canvas.view",
  "comment.add",
  "chat.post",
  "proposal.decide",
  "canvas.edit",
  "section.custom",
  "section.renameStarting",
  "vendor.manage",
  "history.restore",
  "event.leave",
  "invite.links",
  "invite.email",
  "member.switchRole",
  "member.remove",
  "member.unblock",
  "eventKey.manage",
  "eventKey.view",
  "section.starting",
  "event.defaults",
  "event.rename",
  "coOwner.make",
  "coOwner.remove",
  "event.transfer",
  "event.delete",
] as const;
export type Action = (typeof ACTIONS)[number];

const [firstAction, secondAction, ...otherActions] = ACTIONS.map((a) =>
  v.literal(a),
);
export const actionValidator = v.union(
  firstAction!,
  secondAction!,
  ...otherActions,
);
