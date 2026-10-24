/*
 * The progress card's one line (S14): "Budget done, now the Timeline". Pure,
 * so it is tested without a browser.
 */

export type ProgressStep = { key: string; label: string; done: boolean };
export type ProgressStatus =
  | "queued"
  | "running"
  | "stopping"
  | "done"
  | "stopped"
  | "failed"
  | "cancelled";

/** "<step> done": how a finished step reads. */
const DONE: Record<string, string> = {
  draft: "Draft ready",
  prices: "Prices checked",
  functions: "Functions done",
  budget: "Budget done",
  timeline: "Timeline done",
  runSheets: "Run sheets done",
  checklist: "Vendor checklist done",
  suggestions: "Suggestions done",
};

/** "now <step>": how the step under way reads. */
const NOW: Record<string, string> = {
  prices: "checking prices",
  functions: "the Functions",
  budget: "the Budget",
  timeline: "the Timeline",
  runSheets: "the run sheets",
  checklist: "the Vendor checklist",
  suggestions: "the Suggestions",
};

/** What the card says now. */
export function progressLine(
  status: ProgressStatus,
  steps: readonly ProgressStep[],
): string {
  if (status === "done" && steps.every((s) => s.done))
    return "Your first plan is on the Canvas.";
  if (status === "stopped" || status === "stopping")
    return "Stopped. What's already on the Canvas stays.";
  if (status !== "running" && status !== "queued")
    return "The plan stopped before it finished.";
  const next = steps.findIndex((s) => !s.done);
  if (next <= 0) return "Drafting your plan from the Brief…";
  const before = steps[next - 1]!;
  const now = steps[next]!;
  return `${DONE[before.key] ?? `${before.label} done`}, now ${NOW[now.key] ?? now.label}…`;
}
