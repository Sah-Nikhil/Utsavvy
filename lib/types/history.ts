import { v, type Infer } from "convex/values";
import { actorValidator } from "./actors";

/**
 * Tables whose rows the write helpers in `convex/lib/write.ts` change, each with
 * a `version` that every write bumps and a history row per change.
 */
export const HISTORY_TABLES = [
  "events",
  "eventFunctions",
  "sections",
  "items",
  "entries",
  "vendors",
  "vendorLinks",
  "quotes",
] as const;
export type HistoryTable = (typeof HISTORY_TABLES)[number];
export const historyTableValidator = v.union(
  v.literal("events"),
  v.literal("eventFunctions"),
  v.literal("sections"),
  v.literal("items"),
  v.literal("entries"),
  v.literal("vendors"),
  v.literal("vendorLinks"),
  v.literal("quotes"),
);

/** Tables with `deletedAt`, so a soft delete can be Restored. */
export const SOFT_DELETE_TABLES = ["sections", "items", "entries"] as const;
export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

/** The ID of a row in any history table. */
export const historyDocIdValidator = v.union(
  v.id("events"),
  v.id("eventFunctions"),
  v.id("sections"),
  v.id("items"),
  v.id("entries"),
  v.id("vendors"),
  v.id("vendorLinks"),
  v.id("quotes"),
);

/** `people` covers role switches, removals, unblocks and link resets (S1). */
export const changeOpValidator = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
  v.literal("restore"),
  v.literal("people"),
);
export type ChangeOp = Infer<typeof changeOpValidator>;

/**
 * What every post-write hook receives (IMPLEMENTATION_PLAN.md section 4.4).
 * `before` and `after` are whole documents (null before a create).
 */
export const writeEventValidator = v.object({
  eventId: v.id("events"),
  table: historyTableValidator,
  docId: historyDocIdValidator,
  op: changeOpValidator,
  before: v.any(),
  after: v.any(),
  actor: actorValidator,
});
export type WriteEvent = Infer<typeof writeEventValidator>;
