import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity } from "./lib/access";
import { AccessDenied } from "./lib/errors";

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

/**
 * The signed-in person's own profile, or null when signed out or before
 * `ensureMe` has made their row. Proves the Clerk token reaches Convex.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.string(),
      imageUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    try {
      const user = await requireIdentity(ctx);
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      };
    } catch (error) {
      if (error instanceof AccessDenied) return null;
      throw error;
    }
  },
});
