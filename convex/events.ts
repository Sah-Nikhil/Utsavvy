import { createThread } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { eventTypeValidator } from "../lib/types/brief";
import type { SectionKind } from "../lib/types/canvas";
import { roleValidator } from "../lib/types/roles";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { openBrief } from "./brief";
import { requireAccess, requireIdentity } from "./lib/access";
import { memberInsert, memberWrite, recordPeopleChange } from "./lib/write";
import { newInviteToken, peopleSnapshot } from "./people";
import schema from "./schema";

// S1 owns this file: creating Events, listing the caller's Events and the
// Owner and Co-owner settings (docs/design/roles.md, IMPLEMENTATION_PLAN.md
// sections 4.3 and 5.1). People and invite links live in convex/people.ts.

/** Longest Event name we accept, in characters. */
const MAX_EVENT_NAME = 120;

/**
 * The four starting Sections and where they sit on a new Canvas: a 2 × 2 grid
 * of 720 × 560 frames with a 40 px gutter. S2 owns the Canvas and may move them.
 */
const STARTING_SECTIONS: readonly {
  kind: Exclude<SectionKind, "custom">;
  name: string;
  frame: { x: number; y: number; w: number; h: number };
}[] = [
  {
    kind: "money",
    name: "Money and dates",
    frame: { x: 0, y: 0, w: 720, h: 560 },
  },
  { kind: "vendors", name: "Vendors", frame: { x: 760, y: 0, w: 720, h: 560 } },
  {
    kind: "inspirations",
    name: "Inspirations",
    frame: { x: 0, y: 600, w: 720, h: 560 },
  },
  { kind: "notes", name: "Notes", frame: { x: 760, y: 600, w: 720, h: 560 } },
];

/**
 * The empty Budget, Timeline and Vendor checklist every Event starts with,
 * positioned inside their Section's frame (relative to its top-left corner):
 * the Budget and Timeline side by side in Money and dates, the checklist in
 * Vendors. Each starts 332 x 400, tall enough to show its lines and the row
 * for adding one at a readable zoom: as wide as fits beside its neighbour
 * with the 20 px Item gap, and inside the 720 x 560 frame.
 */
const STARTING_ITEM_SIZE = { w: 332, h: 400 };
export const STARTING_ITEMS: readonly {
  kind: "budget" | "timeline" | "checklist";
  section: Exclude<SectionKind, "custom">;
  position: { x: number; y: number };
  size: { w: number; h: number };
}[] = [
  {
    kind: "budget",
    section: "money",
    position: { x: 24, y: 64 },
    size: STARTING_ITEM_SIZE,
  },
  {
    kind: "timeline",
    section: "money",
    position: { x: 376, y: 64 },
    size: STARTING_ITEM_SIZE,
  },
  {
    kind: "checklist",
    section: "vendors",
    position: { x: 24, y: 64 },
    size: STARTING_ITEM_SIZE,
  },
];

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") {
    throw new ConvexError({
      kind: "InvalidInput",
      message: "Give the Event a name.",
    });
  }
  if (trimmed.length > MAX_EVENT_NAME) {
    throw new ConvexError({
      kind: "InvalidInput",
      message: `Keep the Event's name under ${MAX_EVENT_NAME} characters.`,
    });
  }
  return trimmed;
}

/** Lays out the starting Sections and their empty plan Items, each write in the history. */
async function createStartingCanvas(
  ctx: MutationCtx,
  eventId: Id<"events">,
  membershipId: Id<"memberships">,
): Promise<void> {
  const actor = { kind: "member" as const, membershipId };
  const sectionIds = new Map<SectionKind, Id<"sections">>();
  for (const [order, section] of STARTING_SECTIONS.entries()) {
    const { id } = await memberInsert(ctx, {
      table: "sections",
      value: {
        eventId,
        kind: section.kind,
        name: section.name,
        frame: section.frame,
        order,
      },
      actor,
    });
    sectionIds.set(section.kind, id);
  }
  for (const item of STARTING_ITEMS) {
    await memberInsert(ctx, {
      table: "items",
      value: {
        eventId,
        sectionId: sectionIds.get(item.section)!,
        kind: item.kind,
        position: item.position,
        size: item.size,
        functionKey: null,
        data: { note: null },
        createdBy: actor,
      },
      actor,
    });
  }
}

/**
 * Creates an Event with the caller as its Owner (an access exception of
 * IMPLEMENTATION_PLAN.md section 4.3: there is no membership to check yet).
 * In the same mutation: the Owner membership, the four starting Sections, the
 * empty Budget, Timeline and Vendor checklist, the Member and Viewer links and
 * the Event's Agent thread.
 */
export const create = mutation({
  args: {
    name: v.string(),
    eventType: eventTypeValidator,
    ownerLabel: v.optional(v.union(v.literal("owner"), v.literal("host"))),
    uploadRightsOn: v.optional(v.boolean()),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const user = await requireIdentity(ctx);
    const name = cleanName(args.name);
    const now = Date.now();
    const agentThreadId = await createThread(ctx, components.agent, {
      title: name,
    });

    const eventId = await ctx.db.insert("events", {
      name,
      eventType: args.eventType,
      ownerLabel: args.ownerLabel ?? "owner",
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
      uploadRightsOn: args.uploadRightsOn ?? false,
      defaults: {
        view: "canvas",
        compactGrouping: "kind",
        mobilePointing: "jump",
      },
      startingSectionRenameBlocked: false,
      agentThreadId,
      demoKey: null,
      createdAt: now,
      version: 1,
    });
    const membership = {
      eventId,
      userId: user._id,
      role: "owner" as const,
      status: "active" as const,
      blocked: false,
      displayName: user.name,
      joinedAt: now,
      endedAt: null,
    };
    const membershipId = await ctx.db.insert("memberships", membership);
    await recordPeopleChange(ctx, {
      eventId,
      actor: { kind: "member", membershipId },
      membershipId,
      before: null,
      after: peopleSnapshot(membership),
    });

    for (const role of ["member", "viewer"] as const) {
      await ctx.db.insert("inviteLinks", {
        eventId,
        role,
        token: newInviteToken(),
        createdBy: membershipId,
        createdAt: now,
      });
    }
    await createStartingCanvas(ctx, eventId, membershipId);
    // The first Brief starts in the Chat (S11).
    await openBrief(ctx, eventId);
    return eventId;
  },
});

const myEventValidator = v.object({
  eventId: v.id("events"),
  name: v.string(),
  eventType: eventTypeValidator,
  ownerLabel: v.union(v.literal("owner"), v.literal("host")),
  role: roleValidator,
  createdAt: v.number(),
  isDemo: v.boolean(),
});

/**
 * The caller's Events, newest first: only those where they are active (an
 * access exception of section 4.3, reading only the caller's own memberships).
 */
export const listMine = query({
  args: {},
  returns: v.array(myEventValidator),
  handler: async (ctx) => {
    const user = await requireIdentity(ctx);
    const mine = [];
    for await (const membership of ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))) {
      if (membership.status !== "active" || membership.blocked) continue;
      const event = await ctx.db.get("events", membership.eventId);
      if (event === null) continue;
      mine.push({
        eventId: event._id,
        name: event.name,
        eventType: event.eventType,
        ownerLabel: event.ownerLabel,
        role: membership.role,
        createdAt: event.createdAt,
        isDemo: event.demoKey !== null,
      });
    }
    return mine.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** One Event, for anyone in it. The invite tokens are never on the Event document. */
export const get = query({
  args: { eventId: v.id("events") },
  returns: schema.doc("events"),
  handler: async (ctx, { eventId }) => {
    await requireAccess(ctx, eventId, "canvas.view");
    const event = await ctx.db.get("events", eventId);
    if (event === null)
      throw new ConvexError({ kind: "NotFound", what: "event" });
    return event;
  },
});

/** Rename the Event: the Owner and Co-owners. */
export const rename = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, name }) => {
    const { membership } = await requireAccess(ctx, eventId, "event.rename");
    const event = await ctx.db.get("events", eventId);
    const clean = cleanName(name);
    if (event?.name === clean) return null;
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      patch: { name: clean },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});

/** Show the Owner role as "Owner" or "Host" (roles.md summary item 5): the Owner and Co-owners. */
export const setOwnerLabel = mutation({
  args: {
    eventId: v.id("events"),
    ownerLabel: v.union(v.literal("owner"), v.literal("host")),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, ownerLabel }) => {
    const { membership } = await requireAccess(ctx, eventId, "event.rename");
    const event = await ctx.db.get("events", eventId);
    if (event?.ownerLabel === ownerLabel) return null;
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      patch: { ownerLabel },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});

/**
 * The upload rights setting (inspirations.md rule 5): the Owner and Co-owners,
 * who also hold the other Event defaults.
 */
export const setUploadRights = mutation({
  args: { eventId: v.id("events"), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { eventId, on }) => {
    const { membership } = await requireAccess(ctx, eventId, "event.defaults");
    const event = await ctx.db.get("events", eventId);
    if (event?.uploadRightsOn === on) return null;
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      patch: { uploadRightsOn: on },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});

/** The Event defaults: Compact view grouping and the mobile pointing default. The Owner and Co-owners. */
export const setDefaults = mutation({
  args: {
    eventId: v.id("events"),
    compactGrouping: v.optional(
      v.union(v.literal("kind"), v.literal("function")),
    ),
    mobilePointing: v.optional(v.union(v.literal("jump"), v.literal("sheet"))),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, compactGrouping, mobilePointing }) => {
    const { membership } = await requireAccess(ctx, eventId, "event.defaults");
    const event = await ctx.db.get("events", eventId);
    if (event === null) return null;
    const defaults = {
      ...event.defaults,
      ...(compactGrouping ? { compactGrouping } : {}),
      ...(mobilePointing ? { mobilePointing } : {}),
    };
    if (
      defaults.compactGrouping === event.defaults.compactGrouping &&
      defaults.mobilePointing === event.defaults.mobilePointing
    ) {
      return null;
    }
    await memberWrite(ctx, {
      table: "events",
      id: eventId,
      patch: { defaults },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});
