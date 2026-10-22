import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// S13 (Inspirations) owns this file. The contract provides the cron stub.

/** Purges stored files 30 days after their Inspiration was deleted, daily at 03:30 IST. No-op until S13. */
export const purgeDeletedFiles = internalMutation({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
