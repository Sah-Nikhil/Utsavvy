import type { Doc } from "../../convex/_generated/dataModel";

/** How a Vendor category reads in a row, e.g. "mehendi_artists" → "Mehendi artists". */
export function categoryName(category: string): string {
  const words = category.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What an Entry is called where it is shown: a budget line's label, a
 * Timeline Entry's title, or a checklist task's Vendor ("Caterer").
 */
export function entryLabel(entry: Doc<"entries">): string {
  if (entry.kind === "budget") return entry.fields.label;
  if (entry.kind === "timeline") return entry.fields.title;
  return (
    entry.fields.freeLabel ??
    (entry.fields.vendorCategory
      ? categoryName(entry.fields.vendorCategory)
      : "Vendor")
  );
}
