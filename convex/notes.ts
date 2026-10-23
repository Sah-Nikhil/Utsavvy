import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { placeNewItem } from "./canvas";
import { invalid } from "./entries";
import { requireAccess } from "./lib/access";
import { memberInsert, memberWrite } from "./lib/write";

/*
 * S4: Notes, a Member's own words on the Canvas. A Note from a saved web
 * search answer also carries its citations (S5 and S7 write those).
 */

const MAX_NOTE = 4000;
const NOTE_SIZE = { w: 300, h: 200 };

function cleanText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") invalid("Write something in the Note first.");
  if (trimmed.length > MAX_NOTE)
    invalid(`Keep a Note under ${MAX_NOTE} characters.`);
  return trimmed;
}

/** Adds a Note in free space in the Notes Section, placed in the same mutation. */
export const add = mutation({
  args: {
    eventId: v.id("events"),
    text: v.string(),
    functionKey: v.union(v.string(), v.null()),
  },
  returns: v.id("items"),
  handler: async (ctx, { eventId, text, functionKey }) => {
    const { membership } = await requireAccess(ctx, eventId, "canvas.edit");
    const clean = cleanText(text);
    if (functionKey !== null) {
      const fn = (
        await ctx.db
          .query("eventFunctions")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .take(50)
      ).find((f) => f.key === functionKey);
      if (!fn) invalid("That Function isn't in this Event.");
    }
    const { sectionId, position } = await placeNewItem(ctx, {
      eventId,
      kind: "note",
      size: NOTE_SIZE,
    });
    const actor = { kind: "member" as const, membershipId: membership._id };
    const { id } = await memberInsert(ctx, {
      table: "items",
      value: {
        eventId,
        sectionId,
        position,
        size: NOTE_SIZE,
        functionKey,
        kind: "note",
        data: { text: clean, citations: [] },
        createdBy: actor,
      },
      actor,
    });
    return id;
  },
});

/** Changes a Note's text (last write wins); its citations stay. */
export const update = mutation({
  args: { itemId: v.id("items"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { itemId, text }) => {
    const item = await ctx.db.get("items", itemId);
    if (item === null)
      throw new ConvexError({ kind: "NotFound", what: "item" });
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.edit",
    );
    if (item.kind !== "note") invalid("That Item isn't a Note.");
    if (item.deletedAt !== null) invalid("That Note was deleted.", "deleted");
    const clean = cleanText(text);
    if (clean === item.data.text) return null;
    await memberWrite(ctx, {
      table: "items",
      id: itemId,
      patch: { data: { ...item.data, text: clean } },
      actor: { kind: "member", membershipId: membership._id },
    });
    return null;
  },
});
