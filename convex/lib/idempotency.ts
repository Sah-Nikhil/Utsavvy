import type { MutationCtx } from "../_generated/server";

/**
 * Runs `fn` once per key (IMPLEMENTATION_PLAN.md section 5.4, `toolCalls`).
 * The first call stores the result under the key; a repeat with the same key
 * returns that stored result and runs nothing. The Assistant's tools use the
 * key `runId:toolCallId`, so a retried tool call never writes twice.
 *
 * The result must be a Convex value (no `undefined`; use `null`).
 */
export async function once<T>(
  ctx: MutationCtx,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = await ctx.db
    .query("toolCalls")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing !== null) return existing.result as T;
  const result = await fn();
  await ctx.db.insert("toolCalls", {
    key,
    result: result ?? null,
    at: Date.now(),
  });
  return result;
}
