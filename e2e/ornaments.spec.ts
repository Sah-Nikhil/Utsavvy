import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The personal Ornaments setting (lib/ornaments.ts): turned off from the account
 * menu, it hides look D's Section corner pieces, survives a reload without a
 * flash, and moves no Section frame. Only the Section label shifts, dropping
 * the indent kept for the corner piece to line up with the Section's Items.
 */

const corners = '[data-ornament="section-corners"] svg';

async function toggleOrnaments(page: Page, label: string) {
  await page.locator(".cl-userButtonTrigger").click();
  // Clerk's account panel lists its actions as buttons inside a dialog.
  await page
    .getByRole("dialog", { name: "Account panel" })
    .getByText(label, { exact: true })
    .click();
}

/**
 * How far the first Section's label sits right of its content's left edge:
 * indented for the corner piece when ornaments are on, aligned when off.
 */
function labelIndent(page: Page) {
  return page
    .locator('[data-mount="canvas"] section')
    .first()
    .evaluate((section) => {
      const label = section.querySelector("h2")!.getBoundingClientRect();
      const content = section.lastElementChild!.getBoundingClientRect();
      return Math.round(label.left - content.left);
    });
}

/** Positions of the Section frames, to check no Section moves between states. */
function sectionBoxes(page: Page) {
  return page.locator('[data-mount="canvas"] section').evaluateAll((sections) =>
    sections.map((s) => {
      const r = s.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(Math.round);
    }),
  );
}

test("ornaments turn off and on from the account menu, without a flash or moving any Section", async ({
  page,
  signIn,
  cspViolations,
}) => {
  // Records, at DOMContentLoaded (before React hydrates), whether <html> is
  // marked and whether the first corner piece is displayed.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const corner = document.querySelector(
        '[data-ornament="section-corners"] svg',
      );
      (window as unknown as { __firstPaint: unknown }).__firstPaint = {
        marked: document.documentElement.dataset.ornaments ?? null,
        cornerShown: corner ? corner.checkVisibility() : null,
      };
    });
  });
  const firstPaint = () =>
    page.evaluate(
      () => (window as unknown as { __firstPaint: unknown }).__firstPaint,
    );

  await signIn();
  await page.goto("/events/ornaments-test-event");
  await expect(page.locator(corners).first()).toBeVisible();
  const before = await sectionBoxes(page);
  expect(before.length).toBeGreaterThan(0);
  expect(await labelIndent(page)).toBeGreaterThan(0);

  await toggleOrnaments(page, "Turn ornaments off");
  await expect(page.locator(corners).first()).toBeHidden();
  expect(await sectionBoxes(page)).toEqual(before);
  expect(await labelIndent(page)).toBe(0);
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  expect(await firstPaint()).toEqual({ marked: "off", cornerShown: false });
  await expect(page.locator(corners).first()).toBeHidden();

  await toggleOrnaments(page, "Turn ornaments on");
  await expect(page.locator(corners).first()).toBeVisible();
  expect(await sectionBoxes(page)).toEqual(before);
  expect(await labelIndent(page)).toBeGreaterThan(0);
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  expect(await firstPaint()).toEqual({ marked: null, cornerShown: true });
  expect(cspViolations).toEqual([]);
});
