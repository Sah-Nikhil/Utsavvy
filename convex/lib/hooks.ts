import type { WriteEvent } from "../../lib/types/history";
import type { MutationCtx } from "../_generated/server";
import { passagesAfterWrite } from "../comments";
import { nudgesAfterWrite } from "../nudges";

/** A post-write hook: runs inside the writing mutation, so a throw rolls the write back. */
export type PostWriteHook = (
  ctx: MutationCtx,
  event: WriteEvent,
) => Promise<void>;

/**
 * The registered hooks (IMPLEMENTATION_PLAN.md section 4.4), each filled in its
 * owner's file: `passagesAfterWrite` (S8, marks Comment passages "text changed")
 * and `nudgesAfterWrite` (S17, schedules the Nudge check).
 */
function registeredHooks(): PostWriteHook[] {
  return [passagesAfterWrite, nudgesAfterWrite];
}

/**
 * Called by every write helper in `convex/lib/write.ts` after it writes the
 * `changes` row, in the same mutation. Runs each registered hook once, in order.
 */
export async function afterWrite(
  ctx: MutationCtx,
  event: WriteEvent,
): Promise<void> {
  for (const hook of registeredHooks()) {
    await hook(ctx, event);
  }
}
