import type { Action, Role } from "../types/roles";

const OWNERS: readonly Role[] = ["owner", "coOwner"];
const MEMBERS: readonly Role[] = ["owner", "coOwner", "member"];
const EVERYONE: readonly Role[] = ["owner", "coOwner", "member", "viewer"];
const OWNER_ONLY: readonly Role[] = ["owner"];

/**
 * The permissions table from docs/design/roles.md as data: one row per line of
 * that table, in the same order, with the roles allowed. Shared by Convex
 * (`convex/lib/access.ts`) and the UI. Hiding a button is never the only
 * protection: every Event-scoped function checks this table too.
 */
export const PERMISSIONS: Readonly<Record<Action, readonly Role[]>> = {
  /** See the Canvas, the Chat, presence and the edit history. */
  "canvas.view": EVERYONE,
  /** Add, edit and resolve their own Comments. */
  "comment.add": EVERYONE,
  /** Post in the Chat, ask the Assistant, tap a Nudge to ask about it. */
  "chat.post": MEMBERS,
  /** Accept or reject a Proposal, stop the Assistant's reply. */
  "proposal.decide": MEMBERS,
  /** Edit the Canvas: Items, Entries, positions, the Theme, the Budget total (through a Proposal). */
  "canvas.edit": MEMBERS,
  /** Create, rename and delete custom Sections. */
  "section.custom": MEMBERS,
  /** Rename a starting Section (unless renaming is blocked). */
  "section.renameStarting": MEMBERS,
  /** Shortlist Vendors, set statuses, add Quotes, refresh Vendors, run Discovery, drag Markers. */
  "vendor.manage": MEMBERS,
  /** Restore an earlier value from the edit history. */
  "history.restore": MEMBERS,
  /** Leave the Event. The Owner must transfer ownership first, so "owner" is not listed. */
  "event.leave": ["coOwner", "member", "viewer"],
  /** See and copy the invite links, reset either link. */
  "invite.links": OWNERS,
  /** Add and cancel email invites. */
  "invite.email": OWNERS,
  /** Switch someone between Member and Viewer. */
  "member.switchRole": OWNERS,
  /** Remove a Member or Viewer. */
  "member.remove": OWNERS,
  /** Unblock a removed person. */
  "member.unblock": OWNERS,
  /** Attach, replace or remove the Event key. */
  "eventKey.manage": OWNERS,
  /** See the Event key's provider and last four characters. */
  "eventKey.view": OWNERS,
  /** Full control of starting Sections, block their renaming. */
  "section.starting": OWNERS,
  /** Set the Event defaults (Compact view grouping, mobile pointing default). */
  "event.defaults": OWNERS,
  /** Rename the Event, change the Owner/Host label. */
  "event.rename": OWNERS,
  /** Make a Member or Viewer a Co-owner, turn a Co-owner back into a Member. */
  "coOwner.make": OWNER_ONLY,
  /** Remove a Co-owner. */
  "coOwner.remove": OWNER_ONLY,
  /** Transfer ownership. */
  "event.transfer": OWNER_ONLY,
  /** Delete the Event. */
  "event.delete": OWNER_ONLY,
};

/** Whether a role may take an action, per the roles.md permissions table. */
export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}
