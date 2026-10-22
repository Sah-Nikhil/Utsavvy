import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The personal Ornaments setting (lib/ornaments.ts): turned off from the account
 * menu, it hides look D's Section corner pieces, survives a reload without a
 * flash, and moves nothing else on the page.
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

/** Positions of the Section frames, to check nothing moves between states. */
function sectionBoxes(page: Page) {
  return page.locator('[data-mount="canvas"] section').evaluateAll((sections) =>
    sections.map((s) => {
      const r = s.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(Math.round);
    }),
  );
}

test("ornaments turn off and on from the account menu, without a flash or layout shift", async ({
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

  await toggleOrnaments(page, "Turn ornaments off");
  await expect(page.locator(corners).first()).toBeHidden();
  expect(await sectionBoxes(page)).toEqual(before);
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  expect(await firstPaint()).toEqual({ marked: "off", cornerShown: false });
  await expect(page.locator(corners).first()).toBeHidden();

  await toggleOrnaments(page, "Turn ornaments on");
  await expect(page.locator(corners).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  expect(await firstPaint()).toEqual({ marked: null, cornerShown: true });
  expect(cspViolations).toEqual([]);
});
