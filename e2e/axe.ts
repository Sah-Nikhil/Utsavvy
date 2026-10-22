import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Fails on any serious or critical axe violation (IMPLEMENTATION_PLAN.md
 * section 8). Every smoke test calls it once its screen has rendered.
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  options?: { exclude?: string[] },
) {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  for (const selector of options?.exclude ?? [])
    builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const serious = violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}
