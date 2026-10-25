import { ConvexError, v } from "convex/values";
import type { ProposedChange } from "../lib/types";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { postMemberLine } from "./plan";
import { createProposal } from "./proposals";

// S14 (The first plan) owns this file.

/*
 * Posts the Proposal for an essential change after the first plan
 * (`internal.plan.essentialProposal` works it out). It lives apart from
 * convex/plan.ts because the Proposal op registry (convex/lib/proposalOps.ts)
 * imports `changeEssentialOp` from there: if plan.ts also imported
 * `createProposal`, the two would import each other, and a bundle starting
 * from one of them would build the registry or the validators before the
 * other half exists. Nothing imports this file.
 */
export const post = internalMutation({
  args: {
    eventId: v.id("events"),
    requestedBy: v.id("memberships"),
    summary: v.string(),
    /** The Member's edit, posted as their own line so the card answers it. */
    memberLine: v.string(),
    // Checked by `createProposal` against the op registry, change by change.
    changes: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (event === null) return null;
    await postMemberLine(ctx, event, args.requestedBy, args.memberLine);
    try {
      await createProposal(ctx, {
        eventId: args.eventId,
        runId: null,
        requestedBy: args.requestedBy,
        origin: { kind: "briefEdit" },
        summary: args.summary,
        changes: args.changes as ProposedChange[],
      });
    } catch (error) {
      if (!(error instanceof ConvexError)) throw error;
      const data = error.data as { message?: unknown } | null;
      const message = typeof data?.message === "string" ? data.message : null;
      // Say why: the plan moved on while the change was priced (try again),
      // or the Proposal itself was refused (such as too many changes).
      const stale =
        message !== null && /changed since you read it/.test(message);
      await ctx.runMutation(internal.chat.postSystem, {
        eventId: args.eventId,
        card: { kind: "system", id: null },
        text: stale
          ? "The plan changed while I priced that, so I didn't propose it. Make the change again."
          : `I couldn't propose that change: ${message ?? "it wasn't allowed."}`,
      });
    }
    return null;
  },
});
