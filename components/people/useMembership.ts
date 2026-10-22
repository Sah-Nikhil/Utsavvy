"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { can } from "@/lib/access/permissions";
import type { Action, Role } from "@/lib/types/roles";
import type { OwnerLabel } from "./labels";

export type Membership =
  | {
      status: "active";
      eventId: Id<"events">;
      membershipId: Id<"memberships">;
      role: Role;
      ownerLabel: OwnerLabel;
      /** Whether the caller's role allows this action (roles.md permissions). */
      can: (action: Action) => boolean;
    }
  | { status: "denied"; reason: string };

/**
 * The signed-in person's place in an Event, live: their role and the Event's
 * Owner label, or why they have no access. `undefined` while loading.
 *
 * Use it to show or hide controls. Hiding a control is never the protection:
 * every Convex function checks the role again (roles.md, "Notes").
 */
export function useMembership(eventId: string): Membership | undefined {
  const me = useQuery(api.people.me, { eventId });
  if (me === undefined) return undefined;
  if (me.status === "denied") return me;
  return {
    ...me,
    // `me` is active only for a real Event ID, so the string is one.
    eventId: eventId as Id<"events">,
    can: (action) => can(me.role, action),
  };
}
