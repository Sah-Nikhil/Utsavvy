import { ConvexError, type Value } from "convex/values";

/**
 * Errors that cross the client boundary carry structured data through
 * `ConvexError`, so the UI can tell them apart by `data.kind`.
 */

export type AccessDeniedReason =
  | "signedOut"
  | "noUser"
  | "notAMember"
  | "left"
  | "removed"
  | "blocked"
  | "notAllowed"
  | "wrongEvent";

/** The caller may not do this in this Event (IMPLEMENTATION_PLAN.md section 4.3). */
export class AccessDenied extends ConvexError<{
  kind: "AccessDenied";
  reason: AccessDeniedReason;
  action: string | null;
}> {
  constructor(reason: AccessDeniedReason, action: string | null = null) {
    super({ kind: "AccessDenied", reason, action });
    this.name = "AccessDenied";
  }
}

/**
 * The document changed since the Assistant read it (ADR 0009). Carries the
 * current value and version so the Assistant can re-read and retry once.
 */
export class VersionConflict extends ConvexError<{
  kind: "VersionConflict";
  table: string;
  id: string;
  expectedVersion: number;
  currentVersion: number;
  current: Record<string, Value>;
}> {
  constructor(args: {
    table: string;
    id: string;
    expectedVersion: number;
    currentVersion: number;
    current: Record<string, Value>;
  }) {
    super({ kind: "VersionConflict", ...args });
    this.name = "VersionConflict";
  }
}

/** A contract stub a later slice fills in its own file. */
export class NotBuiltYet extends ConvexError<{
  kind: "NotBuiltYet";
  what: string;
  slice: string;
}> {
  constructor(what: string, slice: string) {
    super({ kind: "NotBuiltYet", what, slice });
    this.name = "NotBuiltYet";
  }
}
