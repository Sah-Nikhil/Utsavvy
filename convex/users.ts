import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireIdentity } from "./lib/access";

/**
 * Upserts the signed-in person's `users` row from their Clerk identity. The
 * client calls it once after sign-in (components/providers/EnsureUser.tsx);
 * there is no Clerk webhook in v1 (IMPLEMENTATION_PLAN.md section 4.1).
 */
export const ensureMe = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const user = await requireIdentity(ctx);
    return user._id;
  },
});
