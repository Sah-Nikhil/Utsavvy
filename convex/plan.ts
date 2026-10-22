import type { EssentialChange } from "../lib/types/brief";
import type { ProposalOpHandler } from "../lib/types/proposals";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { NotBuiltYet } from "./lib/errors";

// S14 (The first plan) owns this file.

/**
 * Called by `api.brief.editField` (S11) when an essential changes after the
 * first plan (IMPLEMENTATION_PLAN.md section 4.6). S14 fills it to schedule an
 * internal action that re-runs the estimate cascade and posts one
 * version-checked Proposal. Contract stub: refuses until then.
 */
export async function proposeEssentialChange(
  _ctx: MutationCtx,
  _eventId: Id<"events">,
  _change: EssentialChange,
): Promise<void> {
  throw new NotBuiltYet("changing an essential after the first plan", "S14");
}

export const changeEssentialOp: ProposalOpHandler<"changeEssential"> = {
  validate: async () => {
    throw new NotBuiltYet("the changeEssential Proposal op", "S14");
  },
  apply: async () => {
    throw new NotBuiltYet("the changeEssential Proposal op", "S14");
  },
};
