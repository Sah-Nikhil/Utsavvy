/*
 * A Vendor checklist Entry's status is never stored: it is worked out from its
 * Vendor links (IMPLEMENTATION_PLAN.md section 5.2). Pure, so Convex and the
 * UI share it. Relative imports only, because Convex bundles this file too.
 */

export type VendorLinkStatus =
  "considering" | "contacted" | "quoted" | "booked" | "dropped";

export type ChecklistStatus = "toFind" | "shortlisted" | "booked";

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  toFind: "To find",
  shortlisted: "Shortlisted",
  booked: "Booked",
};

/** Booked once any linked Vendor is booked; shortlisted while one is still in play; else to find. */
export function checklistStatus(
  links: readonly VendorLinkStatus[],
): ChecklistStatus {
  if (links.includes("booked")) return "booked";
  if (links.some((status) => status !== "dropped")) return "shortlisted";
  return "toFind";
}
