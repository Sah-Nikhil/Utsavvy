import type { WithoutSystemFields } from "convex/server";
import type { Value } from "convex/values";
import type {
  Actor,
  AssistantActor,
  MemberActor,
} from "../../lib/types/actors";
import type {
  ChangeOp,
  HistoryTable,
  SoftDeleteTable,
} from "../../lib/types/history";
import { SOFT_DELETE_TABLES } from "../../lib/types/history";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { AccessDenied, VersionConflict } from "./errors";
import { afterWrite } from "./hooks";
import { once } from "./idempotency";

/**
 * Every Canvas write goes through these helpers (IMPLEMENTATION_PLAN.md section
 * 4.4). Each one bumps the document's `version`, writes a `changes` row with the
 * before and after values, then runs the post-write hooks in the same mutation.
 *
 * - `member*`: a Member's own edit. Last write wins; no version check.
 * - `assistant*`: the Assistant acting for a Member. Refused with
 *   `VersionConflict` when `expectedVersion` doesn't match, and idempotent per
 *   `runId:toolCallId` (a repeat returns the stored result and writes nothing).
 *   One tool call that makes several writes passes a distinct `toolCallId` for
 *   each, such as `toolu_01#1` and `toolu_01#2`. A Proposal's writes pass
 *   `runId: null` with `proposalId`, and the key uses the Proposal ID instead.
 *
 * The caller checks access first (`requireAccess` or `requireAccessFor`). These
 * helpers only refuse a document that belongs to another Event than the actor's
 * membership. A write to a shared `vendors` row is recorded in the Event of the
 * acting membership.
 */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type Fields<T extends HistoryTable> = WithoutSystemFields<Doc<T>>;

/** A new row, without the `version` (always 1) and `deletedAt` (always null) the helper sets. */
export type InsertValue<T extends HistoryTable> = DistributiveOmit<
  Fields<T>,
  "version" | "deletedAt"
>;
/** A partial update. `version` is the helper's, and a row never moves between Events. */
export type Patch<T extends HistoryTable> = Partial<
  DistributiveOmit<Fields<T>, "version" | "eventId" | "deletedAt">
>;

type WriteOptions = {
  /** The request came from a Comment thread. */
  fromComment?: boolean;
  /** The history group's label, such as "Plan the sangeet". */
  groupLabel?: string | null;
  /**
   * The history group a Member's writes belong to, such as one Undo all (X11).
   * Ignored for the Assistant, whose group is always its run or Proposal.
   * Approved as a contract change on 2026-10-26 (#120). Only server code sets
   * it; never spread a client's arguments into these options.
   */
  groupKey?: string | null;
};

type AssistantOptions = WriteOptions & {
  runId: Id<"runs"> | null;
  toolCallId: string;
  forMembershipId: Id<"memberships">;
  proposalId?: Id<"proposals"> | null;
  /** The Member who accepted the Proposal ("Utsavvy for Rohan, accepted by Aditi"). */
  acceptedBy?: Id<"memberships"> | null;
};

function actorMembershipId(actor: Actor): Id<"memberships"> {
  return actor.kind === "member" ? actor.membershipId : actor.forMembershipId;
}

function isSoftDeleteTable(table: HistoryTable): table is SoftDeleteTable {
  return (SOFT_DELETE_TABLES as readonly string[]).includes(table);
}

/** The Event a change is recorded in: the acting membership's. Refuses a row from another Event. */
async function eventOf(
  ctx: MutationCtx,
  actor: Actor,
  table: HistoryTable,
  doc: Record<string, unknown>,
): Promise<Id<"events">> {
  const membership = await ctx.db.get("memberships", actorMembershipId(actor));
  if (membership === null) throw new AccessDenied("notAMember");
  const docEventId = table === "events" ? doc._id : doc.eventId;
  if (docEventId !== undefined && docEventId !== membership.eventId) {
    throw new AccessDenied("wrongEvent");
  }
  return membership.eventId;
}

async function record(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    table: HistoryTable;
    docId: Id<HistoryTable>;
    op: ChangeOp;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    options: WriteOptions;
  },
): Promise<void> {
  const eventId = await eventOf(ctx, args.actor, args.table, args.after);
  const groupKey =
    args.actor.kind === "assistant"
      ? (args.actor.runId ?? args.actor.proposalId ?? null)
      : (args.options.groupKey ?? null);
  await ctx.db.insert("changes", {
    eventId,
    at: Date.now(),
    actor: args.actor,
    groupKey,
    groupLabel: args.options.groupLabel ?? null,
    fromComment: args.options.fromComment ?? false,
    table: args.table,
    docId: args.docId,
    op: args.op,
    before: args.before,
    after: args.after,
    undoneBy: null,
  });
  await afterWrite(ctx, {
    eventId,
    table: args.table,
    docId: args.docId,
    op: args.op,
    before: args.before,
    after: args.after,
    actor: args.actor,
  });
}

async function load<T extends HistoryTable>(
  ctx: MutationCtx,
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(table, id);
  if (doc === null) throw new Error(`No ${table} document ${id}`);
  return doc;
}

async function update<T extends HistoryTable>(
  ctx: MutationCtx,
  args: {
    table: T;
    id: Id<T>;
    patch: Record<string, unknown>;
    actor: Actor;
    op: ChangeOp;
    expectedVersion: number | null;
    options: WriteOptions;
  },
): Promise<{ version: number }> {
  const before = await load(ctx, args.table, args.id);
  const beforeFields = before as unknown as Record<string, unknown> & {
    version: number;
  };
  if (
    args.expectedVersion !== null &&
    beforeFields.version !== args.expectedVersion
  ) {
    throw new VersionConflict({
      table: args.table,
      id: args.id,
      expectedVersion: args.expectedVersion,
      currentVersion: beforeFields.version,
      current: beforeFields as Record<string, Value>,
    });
  }
  const version = beforeFields.version + 1;
  // A patch never moves a row to another Event; the type already forbids it.
  const { eventId: _ignored, version: _alsoIgnored, ...patch } = args.patch;
  await ctx.db.patch(args.table, args.id, { ...patch, version } as never);
  const after = (await load(ctx, args.table, args.id)) as unknown as Record<
    string,
    unknown
  >;
  await record(ctx, {
    actor: args.actor,
    table: args.table,
    docId: args.id,
    op: args.op,
    before: beforeFields,
    after,
    options: args.options,
  });
  return { version };
}

async function insert<T extends HistoryTable>(
  ctx: MutationCtx,
  args: {
    table: T;
    value: InsertValue<T>;
    actor: Actor;
    options: WriteOptions;
  },
): Promise<{ id: Id<T>; version: number }> {
  const row = {
    ...(args.value as Record<string, unknown>),
    version: 1,
    ...(isSoftDeleteTable(args.table) ? { deletedAt: null } : {}),
  };
  // Refuse a row aimed at another Event before writing anything.
  await eventOf(ctx, args.actor, args.table, row);
  const id = (await ctx.db.insert(args.table, row as never)) as Id<T>;
  const after = (await load(ctx, args.table, id)) as unknown as Record<
    string,
    unknown
  >;
  await record(ctx, {
    actor: args.actor,
    table: args.table,
    docId: id,
    op: "create",
    before: null,
    after,
    options: args.options,
  });
  return { id, version: 1 };
}

function assistantActor(options: AssistantOptions): AssistantActor {
  return {
    kind: "assistant",
    forMembershipId: options.forMembershipId,
    runId: options.runId,
    proposalId: options.proposalId ?? null,
    acceptedBy: options.acceptedBy ?? null,
  };
}

function idempotencyKey(options: AssistantOptions): string {
  const scope = options.runId ?? options.proposalId;
  if (scope === null || scope === undefined) {
    throw new Error(
      "An Assistant write needs a runId or a proposalId for its idempotency key",
    );
  }
  return `${scope}:${options.toolCallId}`;
}

// ---------------------------------------------------------------------------
// Member writes: last write wins

/**
 * A Member's edit. Bumps the version, records the change and returns the new
 * version. Pass `op: "restore"` when Restore (S6) brings back an earlier value.
 */
export async function memberWrite<T extends HistoryTable>(
  ctx: MutationCtx,
  args: {
    table: T;
    id: Id<T>;
    patch: Patch<T>;
    actor: MemberActor;
    op?: "update" | "restore";
  } & WriteOptions,
): Promise<{ version: number }> {
  return await update(ctx, {
    table: args.table,
    id: args.id,
    patch: args.patch as Record<string, unknown>,
    actor: args.actor,
    op: args.op ?? "update",
    expectedVersion: null,
    options: args,
  });
}

/** A Member's new row, created at version 1. */
export async function memberInsert<T extends HistoryTable>(
  ctx: MutationCtx,
  args: { table: T; value: InsertValue<T>; actor: MemberActor } & WriteOptions,
): Promise<{ id: Id<T>; version: number }> {
  return await insert(ctx, {
    table: args.table,
    value: args.value,
    actor: args.actor,
    options: args,
  });
}

/** A Member's delete: sets `deletedAt`, so Restore can bring the row back. */
export async function memberSoftDelete<T extends SoftDeleteTable>(
  ctx: MutationCtx,
  args: { table: T; id: Id<T>; actor: MemberActor } & WriteOptions,
): Promise<{ version: number }> {
  return await update(ctx, {
    table: args.table,
    id: args.id,
    patch: { deletedAt: Date.now() },
    actor: args.actor,
    op: "delete",
    expectedVersion: null,
    options: args,
  });
}

// ---------------------------------------------------------------------------
// Assistant writes: version-checked and idempotent

/** The Assistant's edit, refused with `VersionConflict` when the row moved on since it read it. */
export async function assistantWrite<T extends HistoryTable>(
  ctx: MutationCtx,
  args: {
    table: T;
    id: Id<T>;
    expectedVersion: number;
    patch: Patch<T>;
  } & AssistantOptions,
): Promise<{ version: number }> {
  return await once(ctx, idempotencyKey(args), () =>
    update(ctx, {
      table: args.table,
      id: args.id,
      patch: args.patch as Record<string, unknown>,
      actor: assistantActor(args),
      op: "update",
      expectedVersion: args.expectedVersion,
      options: args,
    }),
  );
}

/**
 * The Assistant's new row. An insert has no version to check; a Proposal guards
 * its parents' versions before calling this (section 6).
 */
export async function assistantInsert<T extends HistoryTable>(
  ctx: MutationCtx,
  args: { table: T; value: InsertValue<T> } & AssistantOptions,
): Promise<{ id: Id<T>; version: number }> {
  return await once(ctx, idempotencyKey(args), () =>
    insert(ctx, {
      table: args.table,
      value: args.value,
      actor: assistantActor(args),
      options: args,
    }),
  );
}

/** The Assistant's delete, version-checked like `assistantWrite`. */
export async function assistantSoftDelete<T extends SoftDeleteTable>(
  ctx: MutationCtx,
  args: { table: T; id: Id<T>; expectedVersion: number } & AssistantOptions,
): Promise<{ version: number }> {
  return await once(ctx, idempotencyKey(args), () =>
    update(ctx, {
      table: args.table,
      id: args.id,
      patch: { deletedAt: Date.now() },
      actor: assistantActor(args),
      op: "delete",
      expectedVersion: args.expectedVersion,
      options: args,
    }),
  );
}

/**
 * A people change (role switch, removal, unblock, link reset) for the history
 * (S1). People rows aren't versioned and run no post-write hooks.
 */
export async function recordPeopleChange(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    actor: MemberActor;
    membershipId: Id<"memberships">;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.insert("changes", {
    eventId: args.eventId,
    at: Date.now(),
    actor: args.actor,
    groupKey: null,
    groupLabel: null,
    fromComment: false,
    table: "memberships",
    docId: args.membershipId,
    op: "people",
    before: args.before,
    after: args.after,
    undoneBy: null,
  });
}
