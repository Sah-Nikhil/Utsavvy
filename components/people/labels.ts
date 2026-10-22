import type { EventType } from "@/lib/types/brief";
import type { Role } from "@/lib/types/roles";

export type OwnerLabel = "owner" | "host";

/**
 * How the UI names a role. The docs and code always say Owner and Co-owner;
 * an Event that picked "Host" shows "Host" and "Co-host" (roles.md summary 5).
 */
export function roleLabel(role: Role, ownerLabel: OwnerLabel): string {
  switch (role) {
    case "owner":
      return ownerLabel === "host" ? "Host" : "Owner";
    case "coOwner":
      return ownerLabel === "host" ? "Co-host" : "Co-owner";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
  }
}

/** The heading of a role's group in the people panel. */
export function roleGroupLabel(role: Role, ownerLabel: OwnerLabel): string {
  if (role === "owner") return roleLabel(role, ownerLabel);
  return `${roleLabel(role, ownerLabel)}s`;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  community: "Community event",
};

/**
 * The upload rights setting, worded as in docs/design/inspirations.md rule 5:
 * "Members have the right to use the images they upload, or use them only for
 * our private planning."
 */
export const UPLOAD_RIGHTS_CHOICES = [
  {
    value: "on",
    label: "Members have the right to use the images they upload",
    description: "Uploads go straight through.",
  },
  {
    value: "off",
    label: "Use them only for our private planning",
    description: "Each upload batch asks for one tick before it uploads.",
  },
] as const;
