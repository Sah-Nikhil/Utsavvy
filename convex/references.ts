import { ConvexError, v } from "convex/values";
import { parseReferenceUrl } from "../lib/references/parse";
import {
  REFERENCE_CARD_SIZE,
  placeReference,
} from "../lib/references/placement";
import { REFERENCE_NOTE_MAX } from "../lib/references/note";
import { countCharacters } from "../lib/types/canvas";
import { mutation, query } from "./_generated/server";
import { requireAccess } from "./lib/access";
import { memberInsert } from "./lib/write";

// X2 owns this file: Pinterest and Instagram References (ADR 0014,
// inspirations.md rules 6, 7 and 14). A Reference keeps only the link and the
// Member's note. Nothing here opens the link: the platform's own embed draws it
// in the `/embed/*` pages.

/** The link isn't a Pinterest Pin or board or an Instagram post or Reel. */
class ReferenceUrlRefused extends ConvexError<{
  kind: "ReferenceUrlRefused";
  error: string;
}> {
  constructor(error: string) {
    super({ kind: "ReferenceUrlRefused", error });
    this.name = "ReferenceUrlRefused";
  }
}

class ReferenceNoteTooLong extends ConvexError<{
  kind: "ReferenceNoteTooLong";
  max: number;
}> {
  constructor() {
    super({ kind: "ReferenceNoteTooLong", max: REFERENCE_NOTE_MAX });
    this.name = "ReferenceNoteTooLong";
  }
}

/**
 * Saves a pasted link as a Reference in the Event's Inspirations Section, in
 * free space. The server checks the host and path again (the browser's check is
 * only a convenience) and stores the Member's link without its query string.
 */
export const add = mutation({
  args: {
    eventId: v.id("events"),
    url: v.string(),
    note: v.union(v.string(), v.null()),
    functionKey: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ itemId: v.id("items") }),
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "canvas.edit",
    );

    const parsed = parseReferenceUrl(args.url);
    if ("error" in parsed) throw new ReferenceUrlRefused(parsed.error);

    const trimmed = args.note?.trim() ?? "";
    if (countCharacters(trimmed) > REFERENCE_NOTE_MAX)
      throw new ReferenceNoteTooLong();
    const memberNote = trimmed === "" ? null : trimmed;

    const functionKey = args.functionKey ?? null;
    if (functionKey !== null) {
      const functions = await ctx.db
        .query("eventFunctions")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(100);
      if (!functions.some((f) => f.key === functionKey))
        throw new Error(`This Event has no Function "${functionKey}"`);
    }

    const sections = await ctx.db
      .query("sections")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(100);
    const section = sections.find(
      (s) => s.kind === "inspirations" && s.deletedAt === null,
    );
    if (section === undefined)
      throw new Error("This Event has no Inspirations Section");

    const inSection = await ctx.db
      .query("items")
      .withIndex("by_section", (q) => q.eq("sectionId", section._id))
      .take(500);
    const position = placeReference(
      section,
      inSection.filter((item) => item.deletedAt === null),
      REFERENCE_CARD_SIZE,
    );

    // The embed link is worked out again from `url` wherever it is shown.
    const { embedUrl: _embedUrl, ...link } = parsed;
    const source = { kind: "reference" as const, ...link };

    const { id } = await memberInsert(ctx, {
      table: "items",
      actor: { kind: "member", membershipId: membership._id },
      value: {
        eventId: args.eventId,
        sectionId: section._id,
        kind: "inspiration",
        position,
        size: REFERENCE_CARD_SIZE,
        functionKey,
        createdBy: { kind: "member", membershipId: membership._id },
        data: {
          source,
          addedBy: membership._id,
          memberNote,
          seen: null,
        },
      },
    });
    return { itemId: id };
  },
});

/**
 * The Theme's style words and decor keywords, offered as chips for "What do you
 * like in this?". Anyone who can't see the Event, or an ID that isn't an Event,
 * gets none, so the form never breaks the workspace around it.
 */
export const themeWords = query({
  args: { eventId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return [];
    try {
      await requireAccess(ctx, eventId, "canvas.view");
    } catch {
      return [];
    }
    const event = await ctx.db.get("events", eventId);
    if (event === null) return [];
    const words = [...event.theme.styleWords, ...event.theme.decorKeywords];
    return words.filter((word, i) => words.indexOf(word) === i);
  },
});
