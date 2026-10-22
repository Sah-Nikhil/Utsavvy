import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// S19a (the demo Event's seed and reset) owns this file, including `seedInsert`
// (IMPLEMENTATION_PLAN.md section 4.4). The contract provides the cron stub.

/** Resets the demo Event, daily at 03:00 IST and with `bunx convex run demo:reset`. No-op until S19a. */
export const reset = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
