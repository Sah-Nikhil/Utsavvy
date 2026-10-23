import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { can } from "../lib/access/permissions";
import { isStartingSection } from "../lib/canvas/starting";
import type { Actor } from "../lib/types/actors";
import { changeOpValidator, type HistoryTable } from "../lib/types/history";
import type { Action, Role } from "../lib/types/roles";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { memberWrite } from "./lib/write";

// S6 owns this file: the edit history and Restore (IMPLEMENTATION_PLAN.md
// section 4.4, docs/design/roles.md "History and attribution").
//
// Everyone in an Event, Viewers included, lists its history; only Members
// Restore, because Restore is an edit. The list never returns the stored
// before and after documents, only a sentence about each change, so nothing
// beyond what the Canvas already shows leaves the server.

/** Why Restore refused, for the UI to word. */
export type HistoryProblem =
  "notFound" | "notRestorable" | "gone" | "sectionDeleted" | "itemDeleted";

function refuse(problem: HistoryProblem): never {
  throw new ConvexError({ kind: "HistoryRefused", problem });
}

/** The most rows one history group is counted up to. */
const GROUP_COUNT_MAX = 200;

/** Fields a Restore never puts back: identity, the version, and system bookkeeping. */
const NEVER_RESTORED = new Set([
  "_id",
  "_creationTime",
  "version",
  "eventId",
  "createdBy",
  "agentThreadId",
  "demoKey",
  "createdAt",
]);

// ---------------------------------------------------------------------------
// What a change changed

/** Deep equality for stored Convex values (objects compared by key, not order). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameValue(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

type Fields = Record<string, unknown>;

/** The top-level fields one change set to new values. */
function changedFields(before: Fields | null, after: Fields | null): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].filter(
    (k) => !NEVER_RESTORED.has(k) && !sameValue(before?.[k], after?.[k]),
  );
}

/** Whether a change can be Restored at all: an edit, delete or restore of Canvas content. */
function isRestorable(change: Doc<"changes">): boolean {
  return (
    change.table !== "memberships" &&
    (change.op === "update" ||
      change.op === "delete" ||
      change.op === "restore") &&
    change.before !== null
  );
}

/**
 * The permissions-table actions putting back these fields needs, beyond
 * `history.restore`: Restore must never let a Member undo an Owner's setting
 * they couldn't change themselves.
 */
function actionsFor(
  table: HistoryTable,
  doc: Fields,
  fields: string[],
  renameBlocked: boolean,
): Action[] {
  const actions = new Set<Action>();
  switch (table) {
    case "events":
      for (const field of fields) {
        if (field === "name" || field === "ownerLabel")
          actions.add("event.rename");
        else if (field === "uploadRightsOn" || field === "defaults")
          actions.add("event.defaults");
        else if (field === "startingSectionRenameBlocked")
          actions.add("section.starting");
        else actions.add("canvas.edit");
      }
      break;
    case "sections": {
      const starting = isStartingSection(doc.kind as Doc<"sections">["kind"]);
      for (const field of fields) {
        if (field === "deletedAt")
          actions.add(starting ? "section.starting" : "section.custom");
        else if (field === "name")
          actions.add(
            !starting
              ? "section.custom"
              : renameBlocked
                ? "section.starting"
                : "section.renameStarting",
          );
        else actions.add("canvas.edit");
      }
      break;
    }
    case "vendors":
    case "vendorLinks":
    case "quotes":
      actions.add("vendor.manage");
      break;
    default:
      actions.add("canvas.edit");
  }
  return [...actions];
}

function belongsTo(
  table: HistoryTable,
  doc: Fields,
  eventId: Id<"events">,
): boolean {
  if (table === "events") return doc._id === eventId;
  // A shared Vendor has no Event; its change row is in the acting Event.
  if (table === "vendors") return true;
  return doc.eventId === eventId;
}

// ---------------------------------------------------------------------------
// Wording

function roleName(role: Role, ownerLabel: Doc<"events">["ownerLabel"]) {
  const host = ownerLabel === "host";
  switch (role) {
    case "owner":
      return host ? "Host" : "Owner";
    case "coOwner":
      return host ? "Co-host" : "Co-owner";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
  }
}

const ITEM_NAMES: Record<Doc<"items">["kind"], string> = {
  budget: "the Budget",
  timeline: "the Timeline",
  checklist: "the Vendor checklist",
  shortlistedVendor: "a Shortlisted Vendor",
  googlePlace: "a Google place",
  inspiration: "an Inspiration",
  suggestion: "a Suggestion",
  note: "a Note",
};

const EVENT_FIELDS: Record<string, string> = {
  name: "name",
  eventType: "type",
  ownerLabel: "Owner label",
  city: "city",
  tradition: "tradition",
  communityKind: "community",
  honoree: "honoree",
  households: "households",
  budgetTotal: "Budget total",
  contingencyShare: "Contingency",
  theme: "Theme",
  briefState: "Brief",
  brief: "Brief",
  budgetCheck: "Budget check",
  uploadRightsOn: "upload rights",
  defaults: "defaults",
  startingSectionRenameBlocked: "Section renaming",
};

function quoted(text: unknown, max = 40): string {
  if (typeof text !== "string" || text.trim() === "") return "";
  const clean = text.trim().replace(/\s+/g, " ");
  const short =
    clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
  return ` "${short}"`;
}

function listWords(words: string[]): string {
  const unique = [...new Set(words)];
  if (unique.length <= 1) return unique[0] ?? "details";
  return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

/** What the change was about, such as `the Entry "Decor"` or `a Note`. */
function thingOf(table: HistoryTable, doc: Fields): string {
  switch (table) {
    case "items":
      return ITEM_NAMES[doc.kind as Doc<"items">["kind"]] ?? "an Item";
    case "entries": {
      const fields = (doc.fields ?? {}) as Fields;
      const label =
        fields.label ??
        fields.title ??
        fields.freeLabel ??
        fields.vendorCategory ??
        null;
      return `the Entry${quoted(label)}`;
    }
    case "sections":
      return `the Section${quoted(doc.name)}`;
    case "events":
      return "the Event";
    case "eventFunctions":
      return `the Function${quoted(doc.name)}`;
    case "vendors":
      return `the Vendor${quoted(doc.name)}`;
    case "vendorLinks":
      return "a Shortlisted Vendor";
    case "quotes":
      return "a Quote";
  }
}

/** One sentence about a Canvas change, such as "Moved a Note". */
function canvasSummary(change: Doc<"changes">): string {
  const table = change.table as HistoryTable;
  const doc = (change.after ?? change.before ?? {}) as Fields;
  const thing = thingOf(table, doc);
  if (change.op === "create")
    return table === "events" ? "Created the Event" : `Added ${thing}`;
  if (change.op === "delete") return `Deleted ${thing}`;
  if (change.op === "restore") return `Restored ${thing}`;
  const fields = changedFields(change.before as Fields, change.after as Fields);
  if (table === "events") {
    return `Changed the Event's ${listWords(
      fields.map((f) => EVENT_FIELDS[f] ?? "details"),
    )}`;
  }
  if (table === "vendors" && fields.every((f) => f === "marker")) {
    return `Moved the Marker for${quoted(doc.name) || " a Vendor"}`;
  }
  const moves = new Set(["position", "sectionId", "frame", "order"]);
  if (fields.length > 0 && fields.every((f) => moves.has(f)))
    return `Moved ${thing}`;
  if (fields.length > 0 && fields.every((f) => f === "size"))
    return `Resized ${thing}`;
  if (table === "sections" && fields.every((f) => f === "name"))
    return `Renamed ${thing}`;
  return `Edited ${thing}`;
}

type PeopleFields = {
  role?: Role;
  status?: Doc<"memberships">["status"];
  blocked?: boolean;
  linkReset?: "member" | "viewer";
};

/** One sentence about a people change, such as "Made Papa a Member". */
function peopleSummary(
  change: Doc<"changes">,
  target: string,
  ownerLabel: Doc<"events">["ownerLabel"],
): string {
  const before = (change.before ?? null) as PeopleFields | null;
  const after = (change.after ?? {}) as PeopleFields;
  if (after.linkReset) {
    return `Reset the ${after.linkReset === "member" ? "Member" : "Viewer"} link`;
  }
  const role = after.role ? roleName(after.role, ownerLabel) : "Member";
  if (before === null) {
    return after.role === "owner" ? "Created the Event" : `Joined as ${role}`;
  }
  if (after.status === "removed" && before.status !== "removed")
    return `Removed ${target}`;
  if (after.status === "left" && before.status !== "left")
    return "Left the Event";
  if (after.status === "active" && before.status !== "active")
    return `Rejoined as ${role}`;
  if (before.blocked && after.blocked === false) return `Unblocked ${target}`;
  if (after.role && after.role !== before.role) {
    return after.role === "owner"
      ? `Made ${target} the ${role}`
      : `Made ${target} a ${role}`;
  }
  return `Changed ${target}'s access`;
}

// ---------------------------------------------------------------------------
// Listing

const targetValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({
    kind: v.literal("entry"),
    itemId: v.id("items"),
    entryId: v.id("entries"),
  }),
  v.null(),
);

const rowValidator = v.object({
  changeId: v.id("changes"),
  at: v.number(),
  kind: v.union(v.literal("canvas"), v.literal("people")),
  op: changeOpValidator,
  /** "Rohan", "Aditi (left)", "Utsavvy for Meera" or "Utsavvy for Rohan, accepted by Meera". */
  who: v.string(),
  summary: v.string(),
  /** The run or Proposal the change belongs to; null for a Member's own edit. */
  groupKey: v.union(v.string(), v.null()),
  /** "Utsavvy for Meera: Plan the sangeet (8 changes)"; null outside a group. */
  groupTitle: v.union(v.string(), v.null()),
  /** What to highlight on the Canvas, while it is still there. */
  target: targetValidator,
  /** Whether this caller may Restore this change now. */
  canRestore: v.boolean(),
});
export type HistoryRow = typeof rowValidator.type;

/** Reads each document once per query. */
function cached<K, T>(load: (key: K) => Promise<T>) {
  const seen = new Map<K, Promise<T>>();
  return (key: K) => {
    let hit = seen.get(key);
    if (hit === undefined) {
      hit = load(key);
      seen.set(key, hit);
    }
    return hit;
  };
}

function nameOf(m: Doc<"memberships"> | null, eventId: Id<"events">): string {
  if (m === null || m.eventId !== eventId) return "Someone";
  return m.status === "active" ? m.displayName : `${m.displayName} (left)`;
}

async function whoOf(
  actor: Actor,
  membership: (id: Id<"memberships">) => Promise<Doc<"memberships"> | null>,
  eventId: Id<"events">,
): Promise<string> {
  if (actor.kind === "member")
    return nameOf(await membership(actor.membershipId), eventId);
  const forName = nameOf(await membership(actor.forMembershipId), eventId);
  if (actor.acceptedBy === null) return `Utsavvy for ${forName}`;
  const by = nameOf(await membership(actor.acceptedBy), eventId);
  return `Utsavvy for ${forName}, accepted by ${by}`;
}

async function targetOf(
  ctx: QueryCtx,
  change: Doc<"changes">,
  doc: Fields | null,
): Promise<HistoryRow["target"]> {
  if (doc === null || doc.deletedAt !== null) return null;
  if (change.table === "items") {
    return { kind: "item", itemId: change.docId as Id<"items"> };
  }
  if (change.table === "entries") {
    const itemId = doc.itemId as Id<"items">;
    const item = await ctx.db.get("items", itemId);
    if (item === null || item.deletedAt !== null) return null;
    return { kind: "entry", itemId, entryId: change.docId as Id<"entries"> };
  }
  return null;
}

/**
 * The Event's edit history, newest first, a page at a time. People changes
 * (joins, role switches, removals, unblocks, link resets) are rows too. The
 * client groups consecutive rows with the same `groupKey` under `groupTitle`.
 */
export const list = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, { eventId, paginationOpts }) => {
    const { membership: me } = await requireAccess(ctx, eventId, "canvas.view");
    const event = await ctx.db.get("events", eventId);
    if (event === null) throw new AccessDenied("notAMember", "canvas.view");

    const result = await ctx.db
      .query("changes")
      .withIndex("by_event_at", (q) => q.eq("eventId", eventId))
      .order("desc")
      .paginate(paginationOpts);

    const membership = cached((id: Id<"memberships">) =>
      ctx.db.get("memberships", id),
    );
    const groupSize = cached(async (groupKey: string) => {
      const rows = await ctx.db
        .query("changes")
        .withIndex("by_group", (q) => q.eq("groupKey", groupKey))
        .take(GROUP_COUNT_MAX);
      return rows.filter((r) => r.eventId === eventId).length;
    });

    const page: HistoryRow[] = [];
    for (const change of result.page) {
      const who = await whoOf(change.actor, membership, eventId);
      if (change.table === "memberships") {
        const target = await membership(change.docId as Id<"memberships">);
        const targetName =
          target !== null && target.eventId === eventId
            ? target.displayName
            : "someone";
        page.push({
          changeId: change._id,
          at: change.at,
          kind: "people",
          op: change.op,
          who,
          summary: peopleSummary(change, targetName, event.ownerLabel),
          groupKey: null,
          groupTitle: null,
          target: null,
          canRestore: false,
        });
        continue;
      }

      const table = change.table as HistoryTable;
      const doc = (await ctx.db.get(
        table,
        change.docId as Id<HistoryTable>,
      )) as Fields | null;

      let groupTitle: string | null = null;
      if (change.groupKey !== null) {
        const n = await groupSize(change.groupKey);
        const label = change.groupLabel ? `: ${change.groupLabel}` : "";
        const count = `(${n} ${n === 1 ? "change" : "changes"})`;
        const origin = change.fromComment ? " (from a Comment)" : "";
        groupTitle = `${who}${label} ${count}${origin}`;
      }

      let canRestore = false;
      if (
        isRestorable(change) &&
        doc !== null &&
        belongsTo(table, doc, eventId) &&
        can(me.role, "history.restore")
      ) {
        const fields = changedFields(
          change.before as Fields,
          change.after as Fields,
        );
        canRestore = actionsFor(
          table,
          doc,
          fields,
          event.startingSectionRenameBlocked,
        ).every((action) => can(me.role, action));
      }

      page.push({
        changeId: change._id,
        at: change.at,
        kind: "canvas",
        op: change.op,
        who,
        summary: canvasSummary(change),
        groupKey: change.groupKey,
        groupTitle,
        target: await targetOf(ctx, change, doc),
        canRestore,
      });
    }
    return { ...result, page };
  },
});

// ---------------------------------------------------------------------------
// Restore

/**
 * Puts back the earlier values of one change as a new change (op "restore"),
 * through `memberWrite`, so the version moves on, the history gets its own row
 * and the post-write hooks run. Only the fields that change changed come back,
 * so later edits to other fields stay. Restoring a delete brings the row back.
 * Members only; a field an Owner-only setter controls needs that permission
 * too. Returns `changed: false` when the values are already back.
 */
export const restore = mutation({
  args: { changeId: v.id("changes") },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get("changes", changeId);
    if (change === null) refuse("notFound");
    // The Event comes from the stored row, never from the caller.
    const { membership } = await requireAccess(
      ctx,
      change.eventId,
      "history.restore",
    );
    if (!isRestorable(change)) refuse("notRestorable");

    const table = change.table as HistoryTable;
    const id = change.docId as Id<HistoryTable>;
    const doc = (await ctx.db.get(table, id)) as Fields | null;
    if (doc === null) refuse("gone");
    if (!belongsTo(table, doc, change.eventId))
      throw new AccessDenied("wrongEvent", "history.restore");

    const before = change.before as Fields;
    const patch: Fields = {};
    for (const field of changedFields(before, change.after as Fields)) {
      if (!sameValue(doc[field], before[field])) patch[field] = before[field];
    }
    const fields = Object.keys(patch);
    if (fields.length === 0) return { changed: false };

    const event = await ctx.db.get("events", change.eventId);
    for (const action of actionsFor(
      table,
      doc,
      fields,
      event?.startingSectionRenameBlocked ?? false,
    )) {
      if (!can(membership.role, action))
        throw new AccessDenied("notAllowed", action);
    }

    // A row coming back needs its parent to be there.
    const after = { ...doc, ...patch };
    if (table === "items" && after.deletedAt === null) {
      const section = await ctx.db.get(
        "sections",
        after.sectionId as Id<"sections">,
      );
      if (section === null || section.deletedAt !== null)
        refuse("sectionDeleted");
    }
    if (table === "entries" && after.deletedAt === null) {
      const item = await ctx.db.get("items", after.itemId as Id<"items">);
      if (item === null || item.deletedAt !== null) refuse("itemDeleted");
    }

    await memberWrite(ctx, {
      table,
      id,
      patch: patch as never,
      actor: { kind: "member", membershipId: membership._id },
      op: "restore",
    });
    return { changed: true };
  },
});
