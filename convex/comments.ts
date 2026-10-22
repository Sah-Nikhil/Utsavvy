import type { WriteEvent } from "../lib/types/history";
import type { MutationCtx } from "./_generated/server";

// S8 (Comments) owns this file. The contract provides only the post-write hook stub.

/**
 * Post-write hook: marks Comments on a changed passage "text changed".
 * Contract stub, a no-op until S8 (X10 for passage Comments) fills it.
 */
export async function passagesAfterWrite(
  _ctx: MutationCtx,
  _event: WriteEvent,
): Promise<void> {}
