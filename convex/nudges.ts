import { v } from "convex/values";
import type { WriteEvent } from "../lib/types/history";
import { internalMutation, type MutationCtx } from "./_generated/server";

// S17 (Nudges) owns this file. The contract provides the post-write hook and cron stubs.

/**
 * Post-write hook: schedules the Nudge check after a Canvas write.
 * Contract stub, a no-op until S17 fills it.
 */
export async function nudgesAfterWrite(
  _ctx: MutationCtx,
  _event: WriteEvent,
): Promise<void> {}

/** The due-soon Nudge sweep, daily at 08:00 IST (convex/crons.ts). No-op until S17. */
export const dueSoonSweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
