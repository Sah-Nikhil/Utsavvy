import { ConvexError, v } from "convex/values";
import {
  isVibeCandidate,
  setForBrief,
  VIBE_PICK,
  vibePickPhotos,
  vibePickSize,
  vibeTheme,
} from "../lib/brief/vibeSets";
import { can } from "../lib/access/permissions";
import {
  findLibraryPhoto,
  type LibraryPhoto,
} from "../lib/inspirations/library";
import { isThemeUnchanged, themeChangeLine } from "../lib/inspirations/theme";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { memberName } from "./chat";
import { requireAccess } from "./lib/access";
import { AccessDenied } from "./lib/errors";
import { memberWrite } from "./lib/write";

// S18 owns this file: the vibe pick on the Brief summary (first-brief.md
// "Vibe pick", inspirations.md rules 21 to 23). Each picked photo becomes an
// Inspiration through S13's `addFromLibrary`, which places it with
// `placeNewItem` in the same transaction; the Theme merges with S13's rules.

class VibePickRefused extends ConvexError<{
  kind: "VibePickRefused";
  problem: string;
  message: string;
}> {
  constructor(problem: string, message: string) {
    super({ kind: "VibePickRefused", problem, message });
    this.name = "VibePickRefused";
  }
}

async function loadEvent(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get("events", eventId);
  if (event === null)
    throw new ConvexError({ kind: "NotFound", what: "event" });
  return event;
}

/** The history label of a vibe pick's writes. */
const VIBE_PICK_LABEL = "The vibe pick";

/** This Event's live stock library Inspirations, by Pexels id. */
async function libraryItems(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Map<number, Id<"items">>> {
  const items = await ctx.db
    .query("items")
    .withIndex("by_event_kind", (q) =>
      q.eq("eventId", eventId).eq("kind", "inspiration"),
    )
    .take(2000);
  const ids = new Map<number, Id<"items">>();
  for (const item of items) {
    if (
      item.deletedAt === null &&
      item.kind === "inspiration" &&
      item.data.source.kind === "pexels"
    )
      ids.set(item.data.source.pexelsId, item._id);
  }
  return ids;
}

/** The change that created an Inspiration, if history still has it. */
async function creation(ctx: QueryCtx, itemId: Id<"items">) {
  return await ctx.db
    .query("changes")
    .withIndex("by_doc", (q) => q.eq("docId", itemId))
    .first();
}

/**
 * The set's photos in this Event, and which of them the vibe pick added. A
 * photo the vibe pick added has its creation labelled "The vibe pick"; one
 * added through Search isn't a pick, though the grid shows it as added.
 */
async function setPhotosIn(
  ctx: QueryCtx,
  eventId: Id<"events">,
  setKey: string,
): Promise<{ added: number[]; picked: number[] }> {
  const added: number[] = [];
  const picked: number[] = [];
  for (const [pexelsId, itemId] of await libraryItems(ctx, eventId)) {
    if (!isVibeCandidate(setKey, pexelsId)) continue;
    added.push(pexelsId);
    const change = await creation(ctx, itemId);
    if (change?.op === "create" && change.groupLabel === VIBE_PICK_LABEL)
      picked.push(pexelsId);
  }
  return { added, picked };
}

const photoView = v.object({
  pexelsId: v.number(),
  localPath: v.string(),
  alt: v.string(),
  photographer: v.string(),
  photographerUrl: v.string(),
  pageUrl: v.string(),
});

function viewOf(photo: LibraryPhoto) {
  return {
    pexelsId: photo.pexelsId,
    localPath: photo.localPath,
    alt: photo.alt,
    photographer: photo.photographer,
    photographerUrl: photo.photographerUrl,
    pageUrl: photo.pageUrl,
  };
}

/**
 * What the vibe pick shows on the Brief summary. Members see their set's 12
 * vibe pick photos, plus 12 more for each "Show me more" (`more`); an Event
 * with no set gets the one-line skip. Viewers, and everyone once the plan is
 * being made, see nothing.
 */
export const view = query({
  args: { eventId: v.id("events"), more: v.number() },
  returns: v.union(
    v.object({ kind: v.literal("hidden") }),
    v.object({ kind: v.literal("noSet") }),
    v.object({
      kind: v.literal("pick"),
      setKey: v.string(),
      photos: v.array(photoView),
      hasMore: v.boolean(),
      /** Photos of this set already in the Event as Inspirations, however added. */
      added: v.array(v.number()),
      /** The ones the vibe pick added. */
      picked: v.array(v.number()),
      /** The Theme's colours, to show what the pick made. */
      palette: v.array(v.string()),
      /** How many photos a pick takes, and how many show per page. */
      limits: v.object({ min: v.number(), max: v.number(), page: v.number() }),
    }),
  ),
  handler: async (ctx, args) => {
    let membership: Doc<"memberships">;
    try {
      ({ membership } = await requireAccess(ctx, args.eventId, "canvas.view"));
    } catch (error) {
      if (error instanceof AccessDenied) return { kind: "hidden" as const };
      throw error;
    }
    const event = await loadEvent(ctx, args.eventId);
    if (!can(membership.role, "canvas.edit") || event.briefState !== "summary")
      return { kind: "hidden" as const };
    const setKey = setForBrief(event);
    if (setKey === null) return { kind: "noSet" as const };
    const more = Math.min(Math.max(Math.floor(args.more), 0), 20);
    const photos = vibePickPhotos(setKey, more);
    const { added, picked } = await setPhotosIn(ctx, args.eventId, setKey);
    return {
      kind: "pick" as const,
      setKey,
      photos: photos.map(viewOf),
      hasMore: photos.length < vibePickSize(setKey),
      added,
      picked,
      palette: event.theme.palette,
      limits: { ...VIBE_PICK },
    };
  },
});

/**
 * The Member's pick: up to 5 photos of the Event's set. Photos already in the
 * Event are skipped, so a double tap or a repeat adds nothing twice; the new
 * ones become Inspirations and merge into the Theme at once, since tapping
 * them is the Member's own request (inspirations.md rule 16). No decor
 * Suggestions follow: the first plan reads the Theme.
 */
export const pick = mutation({
  args: { eventId: v.id("events"), pexelsIds: v.array(v.number()) },
  returns: v.object({ added: v.number(), themeChanged: v.boolean() }),
  handler: async (ctx, args) => {
    const { membership } = await requireAccess(
      ctx,
      args.eventId,
      "canvas.edit",
    );
    const event = await loadEvent(ctx, args.eventId);
    if (event.briefState !== "summary")
      throw new VibePickRefused(
        "notNow",
        "The vibe pick is part of the Brief, before the plan.",
      );
    const setKey = setForBrief(event);
    if (setKey === null)
      throw new VibePickRefused(
        "noSet",
        "This kind of Event has no vibe pick photos yet.",
      );
    const ids = [...new Set(args.pexelsIds)];
    if (ids.length === 0 || ids.length > VIBE_PICK.max)
      throw new VibePickRefused(
        "count",
        `Pick at most ${VIBE_PICK.max} photos at a time.`,
      );
    for (const id of ids) {
      if (!isVibeCandidate(setKey, id))
        throw new VibePickRefused(
          "notInSet",
          "That photo isn't one of this Event's vibe pick photos.",
        );
    }

    const already = await libraryItems(ctx, args.eventId);
    const fresh = ids.filter((id) => !already.has(id));
    if (fresh.length === 0) return { added: 0, themeChanged: false };
    const { picked } = await setPhotosIn(ctx, args.eventId, setKey);
    if (picked.length === 0 && fresh.length < VIBE_PICK.min)
      throw new VibePickRefused(
        "count",
        `Pick at least ${VIBE_PICK.min} photos for the look.`,
      );
    for (const pexelsId of fresh) {
      const { itemId } = await ctx.runMutation(
        api.inspirations.addFromLibrary,
        { eventId: args.eventId, pexelsId },
      );
      // S13's insert records the Inspiration's creation; labelling it marks
      // the photo as one the vibe pick added (see `setPhotosIn`).
      const change = await creation(ctx, itemId);
      if (change !== null)
        await ctx.db.patch("changes", change._id, {
          groupLabel: VIBE_PICK_LABEL,
        });
    }

    const photos = fresh
      .map(findLibraryPhoto)
      .filter((p): p is LibraryPhoto => p !== null);
    const theme = vibeTheme(event.theme, photos);
    if (isThemeUnchanged(event.theme, theme))
      return { added: fresh.length, themeChanged: false };
    await memberWrite(ctx, {
      table: "events",
      id: args.eventId,
      patch: { theme },
      actor: { kind: "member", membershipId: membership._id },
      groupLabel: VIBE_PICK_LABEL,
    });
    await ctx.runMutation(internal.chat.postSystem, {
      eventId: args.eventId,
      card: { kind: "system", id: null },
      text: themeChangeLine(
        memberName(membership.displayName),
        event.theme,
        theme,
      ),
    });
    return { added: fresh.length, themeChanged: true };
  },
});
