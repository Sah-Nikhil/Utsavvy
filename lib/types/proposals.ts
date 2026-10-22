import { v, type GenericId, type Infer } from "convex/values";
import type { MutationCtx } from "../../convex/_generated/server";
import type { Actor } from "./actors";
import { essentialChangeValidator, themeUpdateValidator } from "./brief";
import {
  commentTargetValidator,
  entryFieldsValidator,
  entryKindValidator,
  noteDataValidator,
  positionValidator,
  suggestionDataValidator,
} from "./canvas";
import { quoteUnitValidator } from "./estimates";
import { historyTableValidator } from "./history";

/** A parent an insert depends on: the Proposal is out of date if its version moved. */
export const guardValidator = v.object({
  table: historyTableValidator,
  docId: v.string(),
  version: v.number(),
});
export type Guard = Infer<typeof guardValidator>;

/** Where a Proposal was asked from. */
export const proposalOriginValidator = v.union(
  v.object({ kind: v.literal("chat") }),
  v.object({ kind: v.literal("comment"), commentId: v.id("comments") }),
  v.object({ kind: v.literal("briefEdit") }),
);

/**
 * Patch values for the update ops. Their shape depends on the target's kind, so
 * the op's handler validates them (S10).
 */
const patchValidator = v.record(v.string(), v.any());

const insert = {
  docId: v.null(),
  expectedVersion: v.null(),
  guards: v.array(guardValidator),
};
const change = { expectedVersion: v.number(), guards: v.array(guardValidator) };

/**
 * One change inside a Proposal (IMPLEMENTATION_PLAN.md section 6): one variant
 * per `propose` op, each with `op`, `table`, `docId` or null, `expectedVersion`
 * or null, `guards` and its `values`.
 */
export const proposedChangeValidator = v.union(
  v.object({
    op: v.literal("addEntry"),
    table: v.literal("entries"),
    ...insert,
    values: v.object({
      itemId: v.id("items"),
      kind: entryKindValidator,
      functionKey: v.union(v.string(), v.null()),
      fields: entryFieldsValidator,
    }),
  }),
  v.object({
    op: v.literal("updateEntry"),
    table: v.literal("entries"),
    docId: v.id("entries"),
    ...change,
    values: v.object({ patch: patchValidator }),
  }),
  v.object({
    op: v.literal("addItem"),
    table: v.literal("items"),
    ...insert,
    values: v.union(
      v.object({
        kind: v.literal("note"),
        sectionId: v.id("sections"),
        functionKey: v.union(v.string(), v.null()),
        data: noteDataValidator,
      }),
      v.object({
        kind: v.literal("suggestion"),
        sectionId: v.id("sections"),
        functionKey: v.union(v.string(), v.null()),
        data: suggestionDataValidator,
      }),
    ),
  }),
  v.object({
    op: v.literal("updateItem"),
    table: v.literal("items"),
    docId: v.id("items"),
    ...change,
    values: v.object({ patch: patchValidator }),
  }),
  v.object({
    op: v.literal("moveItem"),
    table: v.literal("items"),
    docId: v.id("items"),
    ...change,
    values: v.object({
      sectionId: v.union(v.id("sections"), v.null()),
      position: v.union(positionValidator, v.null()),
    }),
  }),
  v.object({
    op: v.literal("createSection"),
    table: v.literal("sections"),
    ...insert,
    values: v.object({ name: v.string() }),
  }),
  v.object({
    op: v.literal("addComment"),
    table: v.literal("comments"),
    ...insert,
    values: v.object({ target: commentTargetValidator, body: v.string() }),
  }),
  v.object({
    op: v.literal("deleteEntry"),
    table: v.literal("entries"),
    docId: v.id("entries"),
    ...change,
    values: v.object({}),
  }),
  v.object({
    op: v.literal("deleteItem"),
    table: v.literal("items"),
    docId: v.id("items"),
    ...change,
    values: v.object({}),
  }),
  v.object({
    op: v.literal("setBudgetTotal"),
    table: v.literal("events"),
    docId: v.id("events"),
    ...change,
    values: v.object({ budgetTotal: v.number() }),
  }),
  v.object({
    op: v.literal("addQuote"),
    table: v.literal("quotes"),
    ...insert,
    values: v.object({
      linkId: v.id("vendorLinks"),
      amount: v.number(),
      unit: quoteUnitValidator,
      functionKeys: v.array(v.string()),
      guests: v.union(v.number(), v.null()),
      receivedAt: v.union(v.number(), v.null()),
      note: v.union(v.string(), v.null()),
      fileId: v.union(v.id("_storage"), v.null()),
    }),
  }),
  v.object({
    op: v.literal("updateTheme"),
    table: v.literal("events"),
    docId: v.id("events"),
    ...change,
    values: themeUpdateValidator,
  }),
  v.object({
    op: v.literal("changeEssential"),
    table: v.literal("events"),
    docId: v.id("events"),
    ...change,
    values: essentialChangeValidator,
  }),
);
export type ProposedChange = Infer<typeof proposedChangeValidator>;
export type ProposalOp = ProposedChange["op"];
export const PROPOSAL_OPS = [
  "addEntry",
  "updateEntry",
  "addItem",
  "updateItem",
  "moveItem",
  "createSection",
  "addComment",
  "deleteEntry",
  "deleteItem",
  "setBudgetTotal",
  "addQuote",
  "updateTheme",
  "changeEssential",
] as const satisfies readonly ProposalOp[];

/**
 * The handler for one op. `validate` returns a refusal message or null; `apply`
 * writes through `assistantWrite`/`assistantInsert` with the Proposal as the
 * group and returns the IDs it touched. Any refusal or throw rolls back the
 * whole Accept.
 */
export type ProposalOpHandler<Op extends ProposalOp = ProposalOp> = {
  validate(
    ctx: MutationCtx,
    change: Extract<ProposedChange, { op: Op }>,
  ): Promise<string | null>;
  apply(
    ctx: MutationCtx,
    change: Extract<ProposedChange, { op: Op }>,
    actor: Actor,
  ): Promise<GenericId<string>[]>;
};
