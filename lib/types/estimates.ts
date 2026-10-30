import { v, type Infer } from "convex/values";

/**
 * Where an Estimate's per-unit range came from (IMPLEMENTATION_PLAN.md sections
 * 4.14 and 5.6, ADR 0013). `text` is the line shown on the Estimate badge.
 * `sourceUrls` and `searchedAt` are filled only for "researched" (URLs only,
 * never page text), `reasoning` for "researched" and "assistantKnowledge", and
 * `tableVersion` only for "referenceTable".
 */
export const estimateBasisValidator = v.object({
  kind: v.union(
    v.literal("researched"),
    v.literal("referenceTable"),
    v.literal("assistantKnowledge"),
  ),
  unit: v.string(),
  unitLow: v.number(),
  unitHigh: v.number(),
  text: v.string(),
  sourceUrls: v.array(v.string()),
  searchedAt: v.union(v.number(), v.null()),
  reasoning: v.union(v.string(), v.null()),
  tableVersion: v.union(v.string(), v.null()),
});
export type EstimateBasis = Infer<typeof estimateBasisValidator>;
export type EstimateBasisKind = EstimateBasis["kind"];

/** An Estimate on a budget Entry or a Suggestion. Amounts are whole rupees. */
export const pricedEstimateValidator = v.object({
  low: v.number(),
  high: v.number(),
  amount: v.number(),
  label: v.literal("Estimate"),
  basis: estimateBasisValidator,
});
export type PricedEstimate = Infer<typeof pricedEstimateValidator>;

/** The Budget check's verdict on a Brief or plan (docs/design/first-brief.md). */
export const budgetCheckValidator = v.object({
  band: v.union(
    v.literal("belowMinimum"),
    v.literal("tight"),
    v.literal("comfortable"),
    v.literal("aboveHigh"),
  ),
  minimum: v.number(),
  typical: v.number(),
  high: v.number(),
  contingency: v.number(),
  unallocated: v.number(),
  perHousehold: v.union(v.number(), v.null()),
  /**
   * What the figures rest on: how many of the priced lines were researched
   * today, out of all of them (the rest are from the reference table). Set by
   * the Brief's Budget check (S11); optional, so older checks and `pricePlan`
   * results without it stay valid.
   */
  basis: v.optional(v.object({ researched: v.number(), lines: v.number() })),
});
export type BudgetCheck = Infer<typeof budgetCheckValidator>;

/** The four units a Listed price can be compared in (docs/design/vendors.md). */
export const listedPriceUnitValidator = v.union(
  v.literal("per_plate"),
  v.literal("per_person"),
  v.literal("per_day"),
  v.literal("per_function"),
);
export type ListedPriceUnit = Infer<typeof listedPriceUnitValidator>;

/** A Quote's unit: the four Listed price units or a total. */
export const quoteUnitValidator = v.union(
  v.literal("per_plate"),
  v.literal("per_person"),
  v.literal("per_day"),
  v.literal("per_function"),
  v.literal("total"),
);
export type QuoteUnit = Infer<typeof quoteUnitValidator>;
