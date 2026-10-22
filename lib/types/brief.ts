import { v, type Infer } from "convex/values";

export const eventTypeValidator = v.union(
  v.literal("wedding"),
  v.literal("birthday"),
  v.literal("community"),
);
export type EventType = Infer<typeof eventTypeValidator>;

export const cityTierValidator = v.union(
  v.literal("X"),
  v.literal("Y"),
  v.literal("Z"),
);
export type CityTier = Infer<typeof cityTierValidator>;

/** An ISO day ("2027-02-15") or month ("2027-02") from the Brief. */
export const briefDateValidator = v.union(
  v.object({ kind: v.literal("day"), value: v.string() }),
  v.object({ kind: v.literal("month"), value: v.string() }),
);
export type BriefDate = Infer<typeof briefDateValidator>;

/** A Function's date: one day, or a range for a programme that repeats. */
export const functionDateValidator = v.union(
  v.object({ kind: v.literal("day"), value: v.string() }),
  v.object({ kind: v.literal("range"), from: v.string(), to: v.string() }),
);
export type FunctionDate = Infer<typeof functionDateValidator>;

export const honoreeValidator = v.object({
  who: v.union(v.literal("child"), v.literal("adult"), v.literal("elder")),
  age: v.union(v.number(), v.null()),
  name: v.union(v.string(), v.null()),
});
export type Honoree = Infer<typeof honoreeValidator>;

/** What the model extracts from the Member's free text. Unknown fields are null, never guessed. */
export const briefExtractionValidator = v.object({
  eventType: v.union(eventTypeValidator, v.null()),
  city: v.union(v.string(), v.null()),
  date: v.union(briefDateValidator, v.null()),
  guests: v.union(v.number(), v.null()),
  budget: v.union(v.number(), v.null()),
  tradition: v.union(v.string(), v.null()),
  honoree: v.union(honoreeValidator, v.null()),
  communityKind: v.union(v.string(), v.null()),
  households: v.union(v.number(), v.null()),
  notes: v.array(v.string()),
});
export type BriefExtraction = Infer<typeof briefExtractionValidator>;

/** A value the Assistant filled in because the Brief didn't give it. */
export const assumptionValidator = v.object({
  field: v.string(),
  value: v.string(),
  reason: v.string(),
});
export type Assumption = Infer<typeof assumptionValidator>;

/** The Brief stored on an Event: the extraction plus its Assumptions. */
export const briefValidator = v.object({
  extraction: briefExtractionValidator,
  assumptions: v.array(assumptionValidator),
});
export type Brief = Infer<typeof briefValidator>;

/** A budget line the plan names, priced later by the estimate cascade. `category` is a reference-table key. */
export const draftBudgetLineValidator = v.object({
  category: v.string(),
  quantity: v.number(),
  unit: v.string(),
});
export type DraftBudgetLine = Infer<typeof draftBudgetLineValidator>;

/** The first plan's structure from the model. No amounts: the pricing step adds them. */
export const firstPlanDraftValidator = v.object({
  functions: v.array(
    v.object({
      key: v.string(),
      name: v.string(),
      date: functionDateValidator,
      guests: v.number(),
      budgetEntries: v.array(draftBudgetLineValidator),
      runSheet: v.array(v.object({ time: v.string(), label: v.string() })),
    }),
  ),
  eventWide: v.array(draftBudgetLineValidator),
  deadlines: v.array(
    v.object({
      title: v.string(),
      functionKey: v.union(v.string(), v.null()),
      vendorCategory: v.union(v.string(), v.null()),
      leadKey: v.string(),
    }),
  ),
  vendorChecklist: v.array(
    v.object({
      category: v.string(),
      functionKeys: v.array(v.string()),
      budgetEntryRefs: v.array(v.string()),
    }),
  ),
  suggestions: v.array(
    v.object({
      title: v.string(),
      body: v.string(),
      functionKey: v.union(v.string(), v.null()),
      costCategory: v.union(v.string(), v.null()),
      quantity: v.union(v.number(), v.null()),
    }),
  ),
  assumptions: v.array(assumptionValidator),
});
export type FirstPlanDraft = Infer<typeof firstPlanDraftValidator>;

/** The Event's Theme: hex palette, style words and decor keywords. */
export const themeValidator = v.object({
  palette: v.array(v.string()),
  styleWords: v.array(v.string()),
  decorKeywords: v.array(v.string()),
});
export type Theme = Infer<typeof themeValidator>;

/** A change to the Theme, merged into it (docs/design/inspirations.md). */
export const themeUpdateValidator = v.object({
  addPalette: v.array(v.string()),
  removePalette: v.array(v.string()),
  addStyleWords: v.array(v.string()),
  addDecorKeywords: v.array(v.string()),
  fromInspiration: v.union(v.id("items"), v.null()),
});
export type ThemeUpdate = Infer<typeof themeUpdateValidator>;

/**
 * A change to an essential after the first plan (IMPLEMENTATION_PLAN.md section 4.6):
 * the date, the city, a Guest count (one Function's, or the Event's with a null key) or the budget.
 */
export const essentialChangeValidator = v.union(
  v.object({ field: v.literal("date"), date: briefDateValidator }),
  v.object({ field: v.literal("city"), city: v.string() }),
  v.object({
    field: v.literal("guests"),
    functionKey: v.union(v.string(), v.null()),
    guests: v.number(),
  }),
  v.object({ field: v.literal("budget"), budget: v.number() }),
);
export type EssentialChange = Infer<typeof essentialChangeValidator>;
