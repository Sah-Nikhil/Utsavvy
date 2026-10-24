import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccess, requireIdentity } from "./lib/access";

/*
 * Personal view preferences (S16, IMPLEMENTATION_PLAN.md section 5.1).
 *
 * `viewPrefs` holds one row per person per Event, for every active role,
 * Viewers included: the Compact mode grouping they picked, their own Item order
 * in each group and which groups they collapsed. It is personal view state, not
 * Canvas content, so it is written directly, with no version and no history
 * (section 4.4), and nobody else's view or the Event defaults change with it.
 *
 * The mobile pointing choice ("jump" to the Canvas tab, or a preview "sheet")
 * lives on the person's `users` row, so it follows them across Events.
 */

const groupingValidator = v.union(v.literal("kind"), v.literal("function"));
const mobilePointingValidator = v.union(v.literal("jump"), v.literal("sheet"));

/** More groups, keys or Items than one person's view of one Event can hold. */
const MAX_GROUPS = 200;
const MAX_ITEMS_PER_GROUP = 500;
const MAX_KEY_LENGTH = 120;

function refuseTooLong(what: string): never {
  throw new ConvexError({ kind: "TooLong", what });
}

/**
 * The caller's Compact mode preferences for this Event, with the Event default
 * filled in where they haven't chosen, and the mobile pointing that applies to
 * them (their own setting, else the Event default).
 */
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    grouping: groupingValidator,
    /** What the person picked; null follows the Event default. */
    ownGrouping: v.union(groupingValidator, v.null()),
    order: v.array(
      v.object({ group: v.string(), itemIds: v.array(v.id("items")) }),
    ),
    collapsed: v.array(v.string()),
    mobilePointing: mobilePointingValidator,
    ownMobilePointing: v.union(mobilePointingValidator, v.null()),
    defaultView: v.union(v.literal("canvas"), v.literal("compact")),
  }),
  handler: async (ctx, { eventId }) => {
    const { user } = await requireAccess(ctx, eventId, "canvas.view");
    const event = await ctx.db.get("events", eventId);
    if (event === null)
      throw new ConvexError({ kind: "NotFound", what: "event" });
    const row = await ctx.db
      .query("viewPrefs")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique();
    return {
      grouping: row?.grouping ?? event.defaults.compactGrouping,
      ownGrouping: row?.grouping ?? null,
      order: row?.order ?? [],
      collapsed: row?.collapsed ?? [],
      mobilePointing: user.mobilePointing ?? event.defaults.mobilePointing,
      ownMobilePointing: user.mobilePointing,
      defaultView: event.defaults.view,
    };
  },
});

/**
 * Saves the caller's own Compact mode preferences for this Event: only the
 * fields given change. `grouping: null` goes back to the Event default.
 */
export const set = mutation({
  args: {
    eventId: v.id("events"),
    grouping: v.optional(v.union(groupingValidator, v.null())),
    order: v.optional(
      v.array(v.object({ group: v.string(), itemIds: v.array(v.id("items")) })),
    ),
    collapsed: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, grouping, order, collapsed }) => {
    const { user } = await requireAccess(ctx, eventId, "canvas.view");
    if (order !== undefined) {
      if (order.length > MAX_GROUPS) refuseTooLong("order");
      for (const group of order) {
        if (group.group.length > MAX_KEY_LENGTH) refuseTooLong("order");
        if (group.itemIds.length > MAX_ITEMS_PER_GROUP) refuseTooLong("order");
      }
    }
    if (collapsed !== undefined) {
      if (collapsed.length > MAX_GROUPS) refuseTooLong("collapsed");
      if (collapsed.some((key) => key.length > MAX_KEY_LENGTH))
        refuseTooLong("collapsed");
    }

    const patch = {
      ...(grouping !== undefined ? { grouping } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(collapsed !== undefined ? { collapsed } : {}),
      updatedAt: Date.now(),
    };
    const row = await ctx.db
      .query("viewPrefs")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique();
    if (row === null) {
      await ctx.db.insert("viewPrefs", {
        eventId,
        userId: user._id,
        grouping: null,
        order: [],
        collapsed: [],
        ...patch,
      });
    } else {
      await ctx.db.patch("viewPrefs", row._id, patch);
    }
    return null;
  },
});

/** The caller's own mobile pointing setting, for /settings; null follows each Event's default. */
export const myMobilePointing = query({
  args: {},
  returns: v.union(mobilePointingValidator, v.null()),
  handler: async (ctx) => {
    const user = await requireIdentity(ctx);
    return user.mobilePointing;
  },
});

/**
 * Sets the caller's own mobile pointing (from /settings). It writes only their
 * own `users` row and no Event data, so it needs a signed-in caller and nothing
 * more. `null` goes back to following each Event's default.
 */
export const setMobilePointing = mutation({
  args: { value: v.union(mobilePointingValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, { value }) => {
    const user = await requireIdentity(ctx);
    if (user.mobilePointing !== value)
      await ctx.db.patch("users", user._id, { mobilePointing: value });
    return null;
  },
});
