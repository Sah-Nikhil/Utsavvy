import { ConvexError, v } from "convex/values";
import type { MemberActor } from "../lib/types/actors";
import type { ItemData } from "../lib/types/canvas";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { invalid, nextOrder, planItemOf } from "./entries";
import { requireAccess } from "./lib/access";
import { memberInsert, memberWrite } from "./lib/write";

/*
 * S4: a Suggestion's two buttons. "Add to plan" turns it into a budget Entry
 * (carrying the Estimate the Suggestion already has, so it runs no research,
 * IMPLEMENTATION_PLAN.md section 4.14) and a Timeline Entry; "Not for us"
 * dismisses it. Either way the Suggestion stays on the Canvas with its status.
 */

type Suggestion = Extract<Doc<"items">, { kind: "suggestion" }>;

/** Loads an open Suggestion and checks the caller may edit its Event. */
async function openSuggestion(
  ctx: MutationCtx,
  itemId: Id<"items">,
): Promise<{ item: Suggestion; actor: MemberActor }> {
  const item = await ctx.db.get("items", itemId);
  if (item === null) throw new ConvexError({ kind: "NotFound", what: "item" });
  const { membership } = await requireAccess(ctx, item.eventId, "canvas.edit");
  if (item.kind !== "suggestion") invalid("That Item isn't a Suggestion.");
  if (item.deletedAt !== null)
    invalid("That Suggestion was deleted.", "deleted");
  if (item.data.status !== "open")
    invalid(
      item.data.status === "added"
        ? "That Suggestion is already in the plan."
        : "That Suggestion was set aside as Not for us.",
      "notOpen",
    );
  return { item, actor: { kind: "member", membershipId: membership._id } };
}

async function setStatus(
  ctx: MutationCtx,
  item: Suggestion,
  status: ItemData<"suggestion">["status"],
  actor: MemberActor,
): Promise<void> {
  await memberWrite(ctx, {
    table: "items",
    id: item._id,
    patch: { data: { ...item.data, status } },
    actor,
  });
}

/**
 * Adds a Suggestion to the plan in one mutation: a budget Entry with the
 * Suggestion's own Estimate and basis, unchanged (only when it costs
 * something), a Timeline Entry for the same Function, and the Suggestion's
 * status set to `added`. A second tap is refused, so nothing is added twice.
 */
export const addToPlan = mutation({
  args: { itemId: v.id("items") },
  returns: v.object({
    budgetEntryId: v.union(v.id("entries"), v.null()),
    timelineEntryId: v.id("entries"),
  }),
  handler: async (ctx, { itemId }) => {
    const { item, actor } = await openSuggestion(ctx, itemId);
    const { data } = item;
    const costed = data.estimate !== null || data.costCategory !== null;

    const timeline = await planItemOf(ctx, item.eventId, "timeline");
    const budget = costed
      ? await planItemOf(ctx, item.eventId, "budget")
      : null;
    if (timeline === null || (costed && budget === null))
      invalid("This Event has no Budget or Timeline to add it to.", "noPlan");

    const common = {
      eventId: item.eventId,
      functionKey: item.functionKey,
      assumed: [],
      createdBy: actor,
    };

    let budgetEntryId: Id<"entries"> | null = null;
    if (budget !== null) {
      const { id } = await memberInsert(ctx, {
        table: "entries",
        value: {
          ...common,
          itemId: budget._id,
          order: await nextOrder(ctx, budget._id),
          kind: "budget",
          fields: {
            label: data.title,
            category: data.costCategory,
            quantity: data.quantity ?? 1,
            unit: data.estimate?.basis.unit ?? "per_event",
            estimate: data.estimate,
            plannedAmount: null,
            role: "line",
            belowUsualRange: false,
            editedByMember: false,
          },
        },
        actor,
      });
      budgetEntryId = id;
    }

    const { id: timelineEntryId } = await memberInsert(ctx, {
      table: "entries",
      value: {
        ...common,
        itemId: timeline._id,
        order: await nextOrder(ctx, timeline._id),
        kind: "timeline",
        fields: {
          title: data.title,
          date: null,
          time: null,
          leadKey: null,
          priority: null,
          late: false,
          note: "Added from a Suggestion",
          vendorCategory: null,
          done: false,
        },
      },
      actor,
    });

    await setStatus(ctx, item, "added", actor);
    return { budgetEntryId, timelineEntryId };
  },
});

/** "Not for us": the Suggestion stays on the Canvas, set aside, and never counts in the Budget. */
export const dismiss = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const { item, actor } = await openSuggestion(ctx, itemId);
    await setStatus(ctx, item, "dismissed", actor);
    return null;
  },
});
