import { v, type Infer } from "convex/values";
import { actorValidator } from "./actors";
import { pricedEstimateValidator } from "./estimates";

// ---------------------------------------------------------------------------
// Sections

export const sectionKindValidator = v.union(
  v.literal("money"),
  v.literal("vendors"),
  v.literal("inspirations"),
  v.literal("notes"),
  v.literal("custom"),
);
export type SectionKind = Infer<typeof sectionKindValidator>;

export const frameValidator = v.object({
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});
export const positionValidator = v.object({ x: v.number(), y: v.number() });
export const sizeValidator = v.object({ w: v.number(), h: v.number() });

// ---------------------------------------------------------------------------
// Items: one designed shell per kind, `data` by kind (IMPLEMENTATION_PLAN.md section 5.2)

export const ITEM_KINDS = [
  "budget",
  "timeline",
  "checklist",
  "shortlistedVendor",
  "googlePlace",
  "inspiration",
  "suggestion",
  "note",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const itemKindValidator = v.union(
  v.literal("budget"),
  v.literal("timeline"),
  v.literal("checklist"),
  v.literal("shortlistedVendor"),
  v.literal("googlePlace"),
  v.literal("inspiration"),
  v.literal("suggestion"),
  v.literal("note"),
);

/** The Budget, Timeline and Vendor checklist hold only a note; their rows are Entries. */
export const planItemDataValidator = v.object({
  note: v.union(v.string(), v.null()),
});

export const shortlistedVendorDataValidator = v.object({
  vendorId: v.id("vendors"),
});

/** A Google place keeps only Google's place ID and the Member's note (ADR 0011). */
export const googlePlaceDataValidator = v.object({
  placeId: v.string(),
  /** The Member's own words, required, up to GOOGLE_PLACE_NOTE_MAX characters. */
  note: v.string(),
});
export const GOOGLE_PLACE_NOTE_MAX = 280;

/**
 * Checks a Google place note before it is stored; S20's mutation calls it,
 * since a validator can't limit length. Counts characters, not UTF-16 units.
 * Returns why the note is refused, or null when it is fine.
 */
export function googlePlaceNoteProblem(
  note: string,
): "empty" | "tooLong" | null {
  if (note.trim() === "") return "empty";
  if (Array.from(note).length > GOOGLE_PLACE_NOTE_MAX) return "tooLong";
  return null;
}

/** A stock library photo: served from our own origin, no image URL (ADR 0012). */
export const pexelsSourceValidator = v.object({
  kind: v.literal("pexels"),
  pexelsId: v.number(),
  localPath: v.string(),
  photographer: v.string(),
  photographerUrl: v.string(),
  pageUrl: v.string(),
  alt: v.string(),
  tags: v.array(v.string()),
});
export const uploadSourceValidator = v.object({
  kind: v.literal("upload"),
  fileId: v.id("_storage"),
  fromReference: v.union(v.id("items"), v.null()),
  remixRightsTicked: v.boolean(),
});
/**
 * A Reference: only the link, shown through the platform's own embed (ADR 0014).
 * Each platform allows only its own kinds of link.
 */
export const pinterestReferenceSourceValidator = v.object({
  kind: v.literal("reference"),
  platform: v.literal("pinterest"),
  urlKind: v.union(v.literal("pin"), v.literal("board"), v.literal("pinShort")),
  url: v.string(),
});
export const instagramReferenceSourceValidator = v.object({
  kind: v.literal("reference"),
  platform: v.literal("instagram"),
  urlKind: v.union(v.literal("post"), v.literal("reel")),
  url: v.string(),
});
export const referenceSourceValidator = v.union(
  pinterestReferenceSourceValidator,
  instagramReferenceSourceValidator,
);
export const inspirationSourceValidator = v.union(
  pexelsSourceValidator,
  uploadSourceValidator,
  pinterestReferenceSourceValidator,
  instagramReferenceSourceValidator,
);
export type InspirationSource = Infer<typeof inspirationSourceValidator>;

/** What the Assistant reads instead of pixels. */
export const seenValidator = v.object({
  description: v.string(),
  palette: v.array(v.string()),
  decorKeywords: v.array(v.string()),
});

const inspirationCommon = {
  addedBy: v.id("memberships"),
  memberNote: v.union(v.string(), v.null()),
};

/**
 * A stock photo or upload may carry what the Assistant saw; a Reference never
 * does, because the Assistant can't read Pinterest or Instagram (ADR 0014), so
 * its `seen` is always null.
 */
export const inspirationDataValidator = v.union(
  v.object({
    ...inspirationCommon,
    source: v.union(pexelsSourceValidator, uploadSourceValidator),
    seen: v.union(seenValidator, v.null()),
  }),
  v.object({
    ...inspirationCommon,
    source: referenceSourceValidator,
    seen: v.null(),
  }),
);

export const suggestionDataValidator = v.object({
  title: v.string(),
  body: v.string(),
  costCategory: v.union(v.string(), v.null()),
  quantity: v.union(v.number(), v.null()),
  estimate: v.union(pricedEstimateValidator, v.null()),
  status: v.union(
    v.literal("open"),
    v.literal("added"),
    v.literal("dismissed"),
  ),
});

export const citationValidator = v.object({
  url: v.string(),
  title: v.union(v.string(), v.null()),
});
export const noteDataValidator = v.object({
  text: v.string(),
  citations: v.array(citationValidator),
});

const itemCommon = {
  eventId: v.id("events"),
  sectionId: v.id("sections"),
  position: positionValidator,
  size: v.union(sizeValidator, v.null()),
  /** null means Event-wide. */
  functionKey: v.union(v.string(), v.null()),
  createdBy: actorValidator,
  version: v.number(),
  deletedAt: v.union(v.number(), v.null()),
};

/** The `items` table: one variant per kind, so `kind` narrows `data`. */
export const itemValidator = v.union(
  v.object({
    ...itemCommon,
    kind: v.literal("budget"),
    data: planItemDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("timeline"),
    data: planItemDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("checklist"),
    data: planItemDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("shortlistedVendor"),
    data: shortlistedVendorDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("googlePlace"),
    data: googlePlaceDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("inspiration"),
    data: inspirationDataValidator,
  }),
  v.object({
    ...itemCommon,
    kind: v.literal("suggestion"),
    data: suggestionDataValidator,
  }),
  v.object({ ...itemCommon, kind: v.literal("note"), data: noteDataValidator }),
);
export type ItemFields = Infer<typeof itemValidator>;
/** `ItemData<"note">` is a Note's data; `ItemData` alone is the union over every kind. */
export type ItemData<K extends ItemKind = ItemKind> = Extract<
  ItemFields,
  { kind: K }
>["data"];

// ---------------------------------------------------------------------------
// Entries: rows inside the Budget, Timeline and Vendor checklist

export const ENTRY_KINDS = ["budget", "timeline", "checklist"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const entryKindValidator = v.union(
  v.literal("budget"),
  v.literal("timeline"),
  v.literal("checklist"),
);

export const budgetEntryFieldsValidator = v.object({
  label: v.string(),
  /** A reference-table key, or null for a free label. */
  category: v.union(v.string(), v.null()),
  quantity: v.number(),
  unit: v.string(),
  /** null shows "No Estimate yet". */
  estimate: v.union(pricedEstimateValidator, v.null()),
  plannedAmount: v.union(v.number(), v.null()),
  role: v.union(
    v.literal("line"),
    v.literal("contingency"),
    v.literal("unallocated"),
  ),
  belowUsualRange: v.boolean(),
  editedByMember: v.boolean(),
});
export const timelineEntryFieldsValidator = v.object({
  title: v.string(),
  /** ISO day. */
  date: v.union(v.string(), v.null()),
  /** Run sheet Entries only, such as "19:30". */
  time: v.union(v.string(), v.null()),
  leadKey: v.union(v.string(), v.null()),
  priority: v.union(
    v.literal("P1"),
    v.literal("P2"),
    v.literal("P3"),
    v.null(),
  ),
  late: v.boolean(),
  note: v.union(v.string(), v.null()),
  vendorCategory: v.union(v.string(), v.null()),
  done: v.boolean(),
});
/** Its status (to find, shortlisted, booked) is worked out from its Vendor links, never stored. */
export const checklistEntryFieldsValidator = v.object({
  vendorCategory: v.union(v.string(), v.null()),
  freeLabel: v.union(v.string(), v.null()),
  functionKeys: v.array(v.string()),
  bookByEntryId: v.union(v.id("entries"), v.null()),
  budgetEntryIds: v.array(v.id("entries")),
});

const entryCommon = {
  eventId: v.id("events"),
  itemId: v.id("items"),
  order: v.number(),
  functionKey: v.union(v.string(), v.null()),
  /** Names of fields that are Assumptions until a Member confirms them. */
  assumed: v.array(v.string()),
  createdBy: actorValidator,
  version: v.number(),
  deletedAt: v.union(v.number(), v.null()),
};

/** The `entries` table: one variant per kind, so `kind` narrows `fields`. */
export const entryValidator = v.union(
  v.object({
    ...entryCommon,
    kind: v.literal("budget"),
    fields: budgetEntryFieldsValidator,
  }),
  v.object({
    ...entryCommon,
    kind: v.literal("timeline"),
    fields: timelineEntryFieldsValidator,
  }),
  v.object({
    ...entryCommon,
    kind: v.literal("checklist"),
    fields: checklistEntryFieldsValidator,
  }),
);
export type EntryRow = Infer<typeof entryValidator>;
/** `EntryFields<"budget">` is a budget Entry's fields; `EntryFields` alone is the union. */
export type EntryFields<K extends EntryKind = EntryKind> = Extract<
  EntryRow,
  { kind: K }
>["fields"];
export const entryFieldsValidator = v.union(
  budgetEntryFieldsValidator,
  timelineEntryFieldsValidator,
  checklistEntryFieldsValidator,
);

// ---------------------------------------------------------------------------
// Comments, pointing and selection

/** A highlighted passage of an Item's text (or of one of its Entries' fields). */
const passageFields = {
  itemId: v.id("items"),
  entryId: v.union(v.id("entries"), v.null()),
  field: v.string(),
  start: v.number(),
  end: v.number(),
  /** The quoted original text. */
  quote: v.string(),
};

export const commentTargetValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({
    kind: v.literal("entry"),
    itemId: v.id("items"),
    entryId: v.id("entries"),
  }),
  v.object({
    kind: v.literal("passage"),
    ...passageFields,
    textChanged: v.boolean(),
  }),
);
export type CommentTarget = Infer<typeof commentTargetValidator>;

/** What a person has selected on the Canvas: an Item, an Entry or a passage. */
export const selectionTargetValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({
    kind: v.literal("entry"),
    itemId: v.id("items"),
    entryId: v.id("entries"),
  }),
  v.object({ kind: v.literal("passage"), ...passageFields }),
);
export type SelectionTarget = Infer<typeof selectionTargetValidator>;
/** The current selection, or null when nothing is selected. */
export type Selection = SelectionTarget | null;
