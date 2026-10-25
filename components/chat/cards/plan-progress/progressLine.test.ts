import { describe, expect, it } from "vitest";
import { progressLine, type ProgressStep } from "./progressLine";

const KEYS = [
  "draft",
  "prices",
  "functions",
  "budget",
  "timeline",
  "runSheets",
  "checklist",
  "suggestions",
];
const upTo = (n: number): ProgressStep[] =>
  KEYS.map((key, i) => ({ key, label: key, done: i < n }));

describe("progressLine", () => {
  it("says which Section is done and which is next", () => {
    expect(progressLine("running", upTo(0))).toBe(
      "Drafting your plan from the Brief…",
    );
    expect(progressLine("running", upTo(1))).toBe(
      "Draft ready, now checking prices…",
    );
    expect(progressLine("running", upTo(4))).toBe(
      "Budget done, now the Timeline…",
    );
  });

  it("ends on the Canvas, or says it stopped", () => {
    expect(progressLine("done", upTo(8))).toBe(
      "Your first plan is on the Canvas.",
    );
    expect(progressLine("stopped", upTo(4))).toMatch(/^Stopped/);
    expect(progressLine("failed", upTo(2))).toBe(
      "The plan stopped before it finished.",
    );
  });
});
