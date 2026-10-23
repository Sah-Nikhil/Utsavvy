import { ConvexError, v } from "convex/values";
import { countCharacters, commentTargetValidator } from "../lib/types/canvas";
import type { WriteEvent } from "../lib/types/history";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAccess } from "./lib/access";

/*
 * Comments (S8): everyone in an Event, Viewers included, can Comment on an
 * Item or an Entry, reply in a thread, and edit and resolve their own
 * Comments (docs/design/roles.md). A thread is its first Comment (`rootId`
 * null) and the replies that point at it; replies are one level deep.
 * Comments are not Canvas edits, so they don't go through the write helpers
 * and don't appear in the edit history. Comments on highlighted passages wait
 * for X10, which also fills `passagesAfterWrite` below.
 */

type Ctx = QueryCtx | MutationCtx;

/** The longest Comment, in characters as a person sees them (`countCharacters`). */
export const COMMENT_MAX = 2000;
/** The most Comments one Item (with its Entries) holds, so its list stays bounded. */
export const MAX_COMMENTS_PER_ITEM = 500;

/** Why a Comment was refused, for the UI to word. */
export type CommentProblem =
  | "empty"
  | "tooLong"
  | "passage"
  | "noTarget"
  | "badReply"
  | "notRoot"
  | "notYours"
  | "notFound"
  | "tooMany";

function refuse(problem: CommentProblem): never {
  throw new ConvexError({ kind: "CommentRefused", problem });
}

/** The trimmed body, or a refusal when it is empty or too long. */
function checkedBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") refuse("empty");
  if (countCharacters(trimmed) > COMMENT_MAX) refuse("tooLong");
  return trimmed;
}

/** A live (not deleted) Item, or null. */
async function liveItem(
  ctx: Ctx,
  itemId: Id<"items">,
): Promise<Doc<"items"> | null> {
  const item = await ctx.db.get("items", itemId);
  return item === null || item.deletedAt !== null ? null : item;
}

/** A Comment the caller can see: its Event's access is checked by the caller first. */
async function loadComment(
  ctx: MutationCtx,
  commentId: Id<"comments">,
): Promise<Doc<"comments">> {
  const comment = await ctx.db.get("comments", commentId);
  if (comment === null) refuse("notFound");
  return comment;
}

function isAuthor(
  comment: Doc<"comments">,
  membershipId: Id<"memberships">,
): boolean {
  return (
    comment.author.kind === "member" &&
    comment.author.membershipId === membershipId
  );
}

/** Whoever may resolve a thread: its author, or the Member the Assistant answered there. */
function mayResolve(
  comment: Doc<"comments">,
  membershipId: Id<"memberships">,
): boolean {
  return comment.author.kind === "member"
    ? comment.author.membershipId === membershipId
    : comment.author.forMembershipId === membershipId;
}

/**
 * Adds a Comment on an Item or an Entry, or a reply when `rootId` names a
 * thread's first Comment on the same target. A passage target is refused
 * until X10. Returns the new Comment's ID.
 */
export const add = mutation({
  args: {
    target: commentTargetValidator,
    body: v.string(),
    rootId: v.union(v.id("comments"), v.null()),
  },
  returns: v.id("comments"),
  handler: async (ctx, { target, body, rootId }) => {
    if (target.kind === "passage") refuse("passage");

    const item = await liveItem(ctx, target.itemId);
    if (item === null) refuse("noTarget");
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "comment.add",
    );

    if (target.kind === "entry") {
      const entry = await ctx.db.get("entries", target.entryId);
      if (
        entry === null ||
        entry.deletedAt !== null ||
        entry.itemId !== item._id ||
        entry.eventId !== item.eventId
      )
        refuse("noTarget");
    }

    const text = checkedBody(body);

    if (rootId !== null) {
      const root = await ctx.db.get("comments", rootId);
      if (
        root === null ||
        root.rootId !== null ||
        root.eventId !== item.eventId ||
        !sameTarget(root.target, target)
      )
        refuse("badReply");
    }

    const existing = await ctx.db
      .query("comments")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .take(MAX_COMMENTS_PER_ITEM);
    if (existing.length >= MAX_COMMENTS_PER_ITEM) refuse("tooMany");

    return await ctx.db.insert("comments", {
      eventId: item.eventId,
      itemId: item._id,
      target,
      rootId,
      author: { kind: "member", membershipId: membership._id },
      body: text,
      resolved: false,
      createdAt: Date.now(),
      editedAt: null,
    });
  },
});

/** Changes the text of the caller's own Comment. */
export const edit = mutation({
  args: { commentId: v.id("comments"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { commentId, body }) => {
    const comment = await loadComment(ctx, commentId);
    const { membership } = await requireAccess(
      ctx,
      comment.eventId,
      "comment.add",
    );
    if (!isAuthor(comment, membership._id)) refuse("notYours");
    const text = checkedBody(body);
    if (text === comment.body) return null;
    await ctx.db.patch("comments", commentId, {
      body: text,
      editedAt: Date.now(),
    });
    return null;
  },
});

/** Resolves the caller's own thread, or opens it again with `resolved: false`. */
export const resolve = mutation({
  args: { commentId: v.id("comments"), resolved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { commentId, resolved }) => {
    const comment = await loadComment(ctx, commentId);
    const { membership } = await requireAccess(
      ctx,
      comment.eventId,
      "comment.add",
    );
    if (comment.rootId !== null) refuse("notRoot");
    if (!mayResolve(comment, membership._id)) refuse("notYours");
    if (comment.resolved !== resolved)
      await ctx.db.patch("comments", commentId, { resolved });
    return null;
  },
});

const listedTargetValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({
    kind: v.literal("entry"),
    itemId: v.id("items"),
    entryId: v.id("entries"),
  }),
);

/** One Comment as a thread shows it. */
const commentViewValidator = v.object({
  _id: v.id("comments"),
  target: listedTargetValidator,
  rootId: v.union(v.id("comments"), v.null()),
  body: v.string(),
  resolved: v.boolean(),
  createdAt: v.number(),
  editedAt: v.union(v.number(), v.null()),
  /** "Papa", "Aditi (left)" or "Utsavvy for Meera". */
  authorName: v.string(),
  authorImageUrl: v.union(v.string(), v.null()),
  byAssistant: v.boolean(),
  byYou: v.boolean(),
  canEdit: v.boolean(),
  canResolve: v.boolean(),
});

/**
 * Every Comment on an Item and its Entries, oldest first. Passage Comments
 * (X10) are left out until their UI exists. A deleted Item lists nothing.
 */
export const listForItem = query({
  args: { itemId: v.id("items") },
  returns: v.array(commentViewValidator),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get("items", itemId);
    if (item === null) return [];
    const { membership } = await requireAccess(
      ctx,
      item.eventId,
      "canvas.view",
    );
    if (item.deletedAt !== null) return [];

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .take(MAX_COMMENTS_PER_ITEM);

    const people = new Map<
      Id<"memberships">,
      { name: string; imageUrl: string | null }
    >();
    async function person(membershipId: Id<"memberships">) {
      const known = people.get(membershipId);
      if (known !== undefined) return known;
      const m = await ctx.db.get("memberships", membershipId);
      const user = m === null ? null : await ctx.db.get("users", m.userId);
      const found = {
        name:
          m === null
            ? "Someone"
            : m.status === "active"
              ? m.displayName
              : `${m.displayName} (left)`,
        imageUrl: user?.imageUrl ?? null,
      };
      people.set(membershipId, found);
      return found;
    }

    const views = [];
    for (const comment of comments) {
      const { target } = comment;
      if (target.kind === "passage") continue;
      const byAssistant = comment.author.kind === "assistant";
      const author =
        comment.author.kind === "member"
          ? await person(comment.author.membershipId)
          : await person(comment.author.forMembershipId);
      const byYou = isAuthor(comment, membership._id);
      views.push({
        _id: comment._id,
        target:
          target.kind === "item"
            ? { kind: "item" as const, itemId: target.itemId }
            : {
                kind: "entry" as const,
                itemId: target.itemId,
                entryId: target.entryId,
              },
        rootId: comment.rootId,
        body: comment.body,
        resolved: comment.resolved,
        createdAt: comment.createdAt,
        editedAt: comment.editedAt,
        authorName: byAssistant ? `Utsavvy for ${author.name}` : author.name,
        authorImageUrl: byAssistant ? null : author.imageUrl,
        byAssistant,
        byYou,
        canEdit: byYou,
        canResolve:
          comment.rootId === null && mayResolve(comment, membership._id),
      });
    }
    return views;
  },
});

/** Whether two Comment targets name the same Item, Entry or passage. */
function sameTarget(
  a: Doc<"comments">["target"],
  b: Doc<"comments">["target"],
): boolean {
  if (a.kind !== b.kind || a.itemId !== b.itemId) return false;
  if (a.kind === "entry" && b.kind === "entry") return a.entryId === b.entryId;
  if (a.kind === "passage" && b.kind === "passage")
    return (
      a.entryId === b.entryId &&
      a.field === b.field &&
      a.start === b.start &&
      a.end === b.end
    );
  return true;
}

/**
 * Post-write hook: marks Comments on a changed passage "text changed".
 * Contract stub, a no-op until S8 (X10 for passage Comments) fills it.
 */
export async function passagesAfterWrite(
  _ctx: MutationCtx,
  _event: WriteEvent,
): Promise<void> {}
