import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { fitFrame, placeInFreeSpace, type Size } from "../lib/canvas/placement";
import {
  STARTING_SECTION_FOR_KIND,
  STARTING_SECTIONS,
  cleanSectionName,
  frameForNewSection,
  isStartingSection,
  type StartingSectionKind,
} from "../lib/canvas/starting";
import type { MemberActor } from "../lib/types/actors";
import {
  positionValidator,
  selectionTargetValidator,
  type ItemKind,
} from "../lib/types/canvas";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import {
  memberInsert,
  memberSoftDelete,
  memberWrite,
  type InsertValue,
} from "./lib/write";

/*
 * The shared freeform Canvas (S2, ADR 0007 and ADR 0010): its Sections, where
 * Items sit, and who is looking at what. Positions are shared and saved with
 * `memberWrite`, so every move syncs live (last write wins) and shows in the
 * edit history. Zoom and pan stay in each person's browser.
 */

type Ctx = QueryCtx | MutationCtx;

/** Why the Canvas refused a Section change, for the UI to word. */
type CanvasProblem = "empty" | "tooLong" | "notEmpty" | "deleted" | "noHome";

function refuse(problem: CanvasProblem): never {
  throw new ConvexError({ kind: "CanvasRefused", problem });
}

/** The most Sections and Items one Event's Canvas reads at once. */
const MAX_SECTIONS = 100;
const MAX_ITEMS = 1000;

async function liveSections(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<Doc<"sections">[]> {
  const sections = await ctx.db
    .query("sections")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(MAX_SECTIONS);
  return sections
    .filter((s) => s.deletedAt === null)
    .sort((a, b) => a.order - b.order);
}

async function liveItemsIn(
  ctx: Ctx,
  sectionId: Id<"sections">,
): Promise<Doc<"items">[]> {
  const items = await ctx.db
    .query("items")
    .withIndex("by_section", (q) => q.eq("sectionId", sectionId))
    .take(MAX_ITEMS);
  return items.filter((item) => item.deletedAt === null);
}

/** The live starting Section for an Item kind, or the first starting Section left. */
function homeFor(
  sections: readonly Doc<"sections">[],
  kind: ItemKind,
): Doc<"sections"> | null {
  const wanted: StartingSectionKind = STARTING_SECTION_FOR_KIND[kind];
  return (
    sections.find((s) => s.kind === wanted) ??
    sections.find((s) => isStartingSection(s.kind)) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Helpers other slices call

/**
 * Creates the four starting Sections at their starting frames. S1 calls it
 * when it creates an Event; returns each Section's ID by kind.
 */
export async function createStartingSections(
  ctx: MutationCtx,
  eventId: Id<"events">,
  actor: MemberActor,
): Promise<Record<StartingSectionKind, Id<"sections">>> {
  const ids = {} as Record<StartingSectionKind, Id<"sections">>;
  for (const section of STARTING_SECTIONS) {
    const { id } = await memberInsert(ctx, {
      table: "sections",
      value: {
        eventId,
        kind: section.kind,
        name: section.name,
        frame: section.frame,
        order: section.order,
      },
      actor,
    });
    ids[section.kind] = id;
  }
  return ids;
}

/**
 * Where a new Item of `kind` goes: free space in its starting Section, never
 * on top of another Item (ADR 0007). Every slice that adds Items calls it and
 * writes the returned `sectionId` and `position` with its own insert. The
 * Canvas draws a Section's frame grown to hold its Items, so nothing else has
 * to be written.
 */
export async function placeNewItem(
  ctx: Ctx,
  args: { eventId: Id<"events">; kind: ItemKind; size: Size },
): Promise<{ sectionId: Id<"sections">; position: { x: number; y: number } }> {
  const home = homeFor(await liveSections(ctx, args.eventId), args.kind);
  if (home === null) refuse("noHome");
  const items = await liveItemsIn(ctx, home._id);
  return {
    sectionId: home._id,
    position: placeInFreeSpace(home, items, args.size),
  };
}

// ---------------------------------------------------------------------------
// The Canvas query

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const { membership, user } = await requireAccess(
      ctx,
      eventId,
      "canvas.view",
    );
    const event = await ctx.db.get("events", eventId);
    if (event === null) throw new AccessDenied("notAMember", "canvas.view");

    const sections = await liveSections(ctx, eventId);
    const items = (
      await ctx.db
        .query("items")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(MAX_ITEMS)
    ).filter((item) => item.deletedAt === null);

    const functions = (
      await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    )
      .sort((a, b) => a.order - b.order)
      .map((fn) => ({ key: fn.key, name: fn.name }));

    const memberships = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).filter((m) => m.status === "active" && !m.blocked);
    const people = await Promise.all(
      memberships.map(async (m) => {
        const person = await ctx.db.get("users", m.userId);
        return {
          membershipId: m._id,
          name: m.displayName,
          imageUrl: person?.imageUrl ?? null,
        };
      }),
    );

    // The newest few; the client drops the ones past `expiresAt`.
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(10);

    return {
      event: {
        name: event.name,
        startingSectionRenameBlocked: event.startingSectionRenameBlocked,
      },
      me: {
        membershipId: membership._id,
        role: membership.role,
        name: membership.displayName,
        imageUrl: user.imageUrl,
      },
      sections,
      items,
      functions,
      people,
      highlights: highlights.map((h) => ({
        _id: h._id,
        forMembershipId: h.forMembershipId,
        targets: h.targets,
        expiresAt: h.expiresAt,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Moving Items and Sections

function round(position: { x: number; y: number }) {
  return { x: Math.round(position.x), y: Math.round(position.y) };
}

/**
 * Saves an Item's final position after a drag, in the Section it was dropped
 * in. The Section's frame grows to hold it and never shrinks.
 */
export const moveItem = mutation({
  args: {
    itemId: v.id("items"),
    sectionId: v.id("sections"),
    position: positionValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("items", args.itemId);
    if (item === null || item.deletedAt !== null) refuse("deleted");
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.edit",
    );
    const section = await ctx.db.get("sections", args.sectionId);
    if (section === null || section.eventId !== item.eventId)
      throw new AccessDenied("wrongEvent", "canvas.edit");
    if (section.deletedAt !== null) refuse("deleted");
    const actor = { kind: "member" as const, membershipId: membership._id };

    const position = round(args.position);
    await memberWrite(ctx, {
      table: "items",
      id: item._id,
      patch: { position, sectionId: section._id },
      actor,
    });

    const items = await liveItemsIn(ctx, section._id);
    const frame = fitFrame(section.frame, items);
    if (frame.w !== section.frame.w || frame.h !== section.frame.h) {
      await memberWrite(ctx, {
        table: "sections",
        id: section._id,
        patch: { frame },
        actor,
      });
    }
    return null;
  },
});

/** Saves a Section's new top left after a drag by its label. */
export const moveSection = mutation({
  args: { sectionId: v.id("sections"), position: positionValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get("sections", args.sectionId);
    if (section === null || section.deletedAt !== null) refuse("deleted");
    const { membership } = await requireAccess(
      ctx,
      section.eventId,
      "canvas.edit",
    );
    await memberWrite(ctx, {
      table: "sections",
      id: section._id,
      patch: { frame: { ...section.frame, ...round(args.position) } },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Sections

/** A new custom Section, below every Section on the Canvas. */
export const createSection = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  returns: v.id("sections"),
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "section.custom",
    );
    const name = cleanSectionName(args.name);
    if (!name.ok) refuse(name.problem);
    const sections = await liveSections(ctx, args.eventId);
    const value: InsertValue<"sections"> = {
      eventId: args.eventId,
      kind: "custom",
      name: name.name,
      frame: frameForNewSection(sections),
      order: Math.max(-1, ...sections.map((s) => s.order)) + 1,
    };
    const { id } = await memberInsert(ctx, {
      table: "sections",
      value,
      actor: { kind: "member", membershipId: membership._id },
    });
    return id;
  },
});

/**
 * Renames a Section. Members rename custom Sections and, unless the Owner or a
 * Co-owner blocked it, starting Sections; the Owner and Co-owners always can.
 */
export const renameSection = mutation({
  args: { sectionId: v.id("sections"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get("sections", args.sectionId);
    if (section === null || section.deletedAt !== null) refuse("deleted");
    let action:
      "section.custom" | "section.renameStarting" | "section.starting" =
      "section.custom";
    if (isStartingSection(section.kind)) {
      const event = await ctx.db.get("events", section.eventId);
      action = event?.startingSectionRenameBlocked
        ? "section.starting"
        : "section.renameStarting";
    }
    const { membership } = await requireAccess(ctx, section.eventId, action);
    const name = cleanSectionName(args.name);
    if (!name.ok) refuse(name.problem);
    if (name.name === section.name) return null;
    await memberWrite(ctx, {
      table: "sections",
      id: section._id,
      patch: { name: name.name },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});

/**
 * Deletes a Section (Restore can bring it back). A custom Section's Items move
 * back to their starting Section, each placed in free space. A starting
 * Section is the Owner's and Co-owners' to delete, and only once it is empty,
 * since its Items have nowhere else to go.
 */
export const deleteSection = mutation({
  args: { sectionId: v.id("sections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get("sections", args.sectionId);
    if (section === null || section.deletedAt !== null) refuse("deleted");
    const starting = isStartingSection(section.kind);
    const { membership } = await requireAccess(
      ctx,
      section.eventId,
      starting ? "section.starting" : "section.custom",
    );
    const actor = { kind: "member" as const, membershipId: membership._id };
    const items = await liveItemsIn(ctx, section._id);

    if (starting && items.length > 0) refuse("notEmpty");

    const others = (await liveSections(ctx, section.eventId)).filter(
      (s) => s._id !== section._id,
    );
    // Items placed so far per Section, so moved Items never land on each other.
    const placed = new Map<Id<"sections">, Doc<"items">[]>();
    for (const item of items) {
      const home = homeFor(others, item.kind);
      if (home === null) refuse("noHome");
      const already =
        placed.get(home._id) ?? (await liveItemsIn(ctx, home._id));
      const position = placeInFreeSpace(
        home,
        already,
        item.size ?? { w: 300, h: 200 },
      );
      await memberWrite(ctx, {
        table: "items",
        id: item._id,
        patch: { sectionId: home._id, position },
        actor,
      });
      placed.set(home._id, [...already, { ...item, position }]);
    }

    await memberSoftDelete(ctx, { table: "sections", id: section._id, actor });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Presence: who is on the Canvas and what each person has selected

const presence = new Presence(components.presence);

async function eventIdFrom(ctx: Ctx, roomId: string): Promise<Id<"events">> {
  const eventId = ctx.db.normalizeId("events", roomId);
  if (eventId === null) throw new AccessDenied("notAMember", "canvas.view");
  return eventId;
}

/**
 * The presence heartbeat for `usePresence` (@convex-dev/presence). The room is
 * the Event and the person is their membership, worked out from the sign-in,
 * never taken from the client.
 */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args) => {
    const eventId = await eventIdFrom(ctx, args.roomId);
    const { membership } = await requireAccess(ctx, eventId, "canvas.view");
    return await presence.heartbeat(
      ctx,
      eventId,
      membership._id,
      args.sessionId,
      args.interval,
    );
  },
});

/** Everyone in the room. The room token comes only from an allowed heartbeat. */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    return await presence.disconnect(ctx, sessionToken);
  },
});

/** Shares what the person has selected, so others see their avatar on it. */
export const setPresenceSelection = mutation({
  args: {
    eventId: v.id("events"),
    target: v.union(selectionTargetValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, target }) => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.view");
    await presence.updateRoomUser(ctx, eventId, membership._id, {
      selection: target,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Local browser checks only

function refuseOutsideLocal() {
  const url = env.CONVEX_CLOUD_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("Only for a local Convex deployment");
  }
}

const CHECK_PHOTOS = [
  {
    pexelsId: 31002035,
    localPath: "/inspirations/wedding-north-indian-hindu/31002035.webp",
    photographer: "Naresh Babu",
    photographerUrl: "https://www.pexels.com/@naresh99/",
    pageUrl:
      "https://www.pexels.com/photo/traditional-indian-wedding-haldi-ceremony-decorations-31002035/",
    alt: "Marigold-filled urli and golden pots set out as haldi decor.",
    tags: ["wedding", "haldi", "yellow"],
  },
  {
    pexelsId: 19569602,
    localPath: "/inspirations/wedding-north-indian-hindu/19569602.webp",
    photographer: "Rohit Photography",
    photographerUrl: "https://www.pexels.com/@rohit-photography-751545565/",
    pageUrl:
      "https://www.pexels.com/photo/laughing-bride-in-a-red-saree-among-falling-golden-petals-19569602/",
    alt: "A laughing bride under hanging marigold strings as golden petals fall at her haldi.",
    tags: ["wedding", "haldi", "yellow"],
  },
];

const CHECK_FUNCTIONS = [
  { key: "haldi", name: "Haldi" },
  { key: "mehendi", name: "Mehendi" },
  { key: "sangeet", name: "Sangeet" },
  { key: "wedding", name: "Wedding" },
];

/**
 * Makes an Event with the starting Sections, four Functions and `items` mixed
 * Items, with the person signed in as `email` as its Owner and each of
 * `memberEmails` as a Member, for the browser
 * checks in e2e/canvas.spec.ts and the React Flow check (ADR 0010). Refuses
 * on anything but a local deployment. S1's `api.events.create` replaces it for
 * real Events.
 */
export const seedLocalCheck = internalMutation({
  args: {
    email: v.string(),
    memberEmails: v.optional(v.array(v.string())),
    items: v.number(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    refuseOutsideLocal();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (user === null)
      throw new Error(`Sign in as ${args.email} once before seeding`);
    const eventId = await ctx.db.insert("events", {
      name: "Canvas check",
      eventType: "wedding",
      ownerLabel: "owner",
      city: null,
      tradition: null,
      communityKind: null,
      honoree: null,
      households: null,
      budgetTotal: null,
      contingencyShare: 0.1,
      theme: { palette: [], styleWords: [], decorKeywords: [] },
      briefState: "planned",
      brief: null,
      budgetCheck: null,
      uploadRightsOn: false,
      defaults: {
        view: "canvas",
        compactGrouping: "kind",
        mobilePointing: "jump",
      },
      startingSectionRenameBlocked: false,
      agentThreadId: null,
      demoKey: null,
      createdAt: Date.now(),
      version: 1,
    });
    const membershipId = await ctx.db.insert("memberships", {
      eventId,
      userId: user._id,
      role: "owner",
      status: "active",
      blocked: false,
      displayName: user.name,
      joinedAt: Date.now(),
      endedAt: null,
    });
    for (const memberEmail of args.memberEmails ?? []) {
      const member = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", memberEmail.toLowerCase()))
        .first();
      if (member === null)
        throw new Error(`Sign in as ${memberEmail} once before seeding`);
      await ctx.db.insert("memberships", {
        eventId,
        userId: member._id,
        role: "member",
        status: "active",
        blocked: false,
        displayName: member.name,
        joinedAt: Date.now(),
        endedAt: null,
      });
    }
    const actor = { kind: "member" as const, membershipId };
    await createStartingSections(ctx, eventId, actor);
    for (const [order, fn] of CHECK_FUNCTIONS.entries()) {
      await ctx.db.insert("eventFunctions", {
        eventId,
        key: fn.key,
        name: fn.name,
        date: null,
        guests: null,
        assumed: [],
        order,
        version: 1,
      });
    }

    const kinds: ItemKind[] = [
      "budget",
      "timeline",
      "checklist",
      "note",
      "inspiration",
      "suggestion",
      "googlePlace",
    ];
    for (let i = 0; i < args.items; i++) {
      // One Budget, Timeline and Vendor checklist; the rest are mixed.
      const kind: ItemKind =
        i < 3 ? kinds[i]! : kinds[3 + ((i - 3) % (kinds.length - 3))]!;
      const fn = CHECK_FUNCTIONS[i % (CHECK_FUNCTIONS.length + 1)];
      const size = { w: 300, h: 200 };
      const { sectionId, position } = await placeNewItem(ctx, {
        eventId,
        kind,
        size,
      });
      const common = {
        eventId,
        sectionId,
        position,
        size,
        functionKey: kind === "budget" ? null : (fn?.key ?? null),
        createdBy: actor,
      };
      const photo = CHECK_PHOTOS[i % CHECK_PHOTOS.length]!;
      const value: InsertValue<"items"> =
        kind === "note"
          ? {
              ...common,
              kind,
              data: {
                text: `Note ${i}: मेहंदी के लिए ₹2,40,000 रखें`,
                citations: [],
              },
            }
          : kind === "inspiration"
            ? {
                ...common,
                kind,
                data: {
                  addedBy: membershipId,
                  memberNote: null,
                  source: { kind: "pexels", ...photo },
                  seen: null,
                },
              }
            : kind === "suggestion"
              ? {
                  ...common,
                  kind,
                  data: {
                    title: `Suggestion ${i}`,
                    body: "Rajasthani folk musicians at the sangeet dinner",
                    costCategory: null,
                    quantity: null,
                    estimate: null,
                    status: "open",
                  },
                }
              : kind === "googlePlace"
                ? {
                    ...common,
                    kind,
                    data: { placeId: `check-${i}`, note: "Near the venue" },
                  }
                : {
                    ...common,
                    kind: kind as "budget" | "timeline" | "checklist",
                    data: { note: null },
                  };
      await memberInsert(ctx, { table: "items", value, actor });
    }
    return eventId;
  },
});

/**
 * Points at Items as the Assistant would, for `email`'s view, for 30 seconds.
 * Local browser checks only.
 */
export const pointForLocalCheck = internalMutation({
  args: {
    eventId: v.id("events"),
    email: v.string(),
    itemIds: v.array(v.id("items")),
  },
  returns: v.id("highlights"),
  handler: async (ctx, args) => {
    refuseOutsideLocal();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    const membership =
      user &&
      (await ctx.db
        .query("memberships")
        .withIndex("by_event_user", (q) =>
          q.eq("eventId", args.eventId).eq("userId", user._id),
        )
        .unique());
    if (!membership) throw new Error(`${args.email} is not in that Event`);
    const runId = await ctx.db.insert("runs", {
      eventId: args.eventId,
      requestedBy: membership._id,
      source: "chat",
      messageId: null,
      commentId: null,
      status: "done",
      stoppedBy: null,
      model: "check",
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: Date.now(),
    });
    return await ctx.db.insert("highlights", {
      eventId: args.eventId,
      runId,
      forMembershipId: membership._id,
      targets: args.itemIds.map((itemId) => ({
        kind: "item" as const,
        itemId,
      })),
      expiresAt: Date.now() + 30_000,
    });
  },
});

/**
 * Adds a Note the way any slice adds an Item, through `placeNewItem`, as the
 * Event's Owner. Local browser checks only.
 */
export const addNoteForLocalCheck = internalMutation({
  args: { eventId: v.id("events"), text: v.string() },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    refuseOutsideLocal();
    const owner = (
      await ctx.db
        .query("memberships")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(50)
    ).find((m) => m.role === "owner");
    if (!owner) throw new Error("That Event has no Owner");
    const size = { w: 300, h: 200 };
    const { sectionId, position } = await placeNewItem(ctx, {
      eventId: args.eventId,
      kind: "note",
      size,
    });
    const actor = { kind: "member" as const, membershipId: owner._id };
    const { id } = await memberInsert(ctx, {
      table: "items",
      value: {
        eventId: args.eventId,
        sectionId,
        position,
        size,
        functionKey: null,
        createdBy: actor,
        kind: "note",
        data: { text: args.text, citations: [] },
      },
      actor,
    });
    return id;
  },
});
