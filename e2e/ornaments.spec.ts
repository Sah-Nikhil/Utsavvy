import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The personal Ornaments setting (lib/ornaments.ts): turned off from the account
 * menu, it hides look D's Section corner pieces, survives a reload without a
 * flash, and moves no Section frame. Only the Section label shifts, dropping
 * the indent kept for the corner piece to line up with the Section's Items.
 * It creates an Event for the Canvas to draw, so it skips production.
 */

const corners = '[data-ornament="section-corners"] svg';

const PRODUCTION_HOST = "utsavvy.vercel.app";

function isProduction(baseURL: string | undefined): boolean {
  return baseURL ? new URL(baseURL).hostname === PRODUCTION_HOST : false;
}

async function toggleOrnaments(page: Page, label: string) {
  await page.locator(".cl-userButtonTrigger").click();
  // Clerk's account panel lists its actions as buttons inside a dialog.
  await page
    .getByRole("dialog", { name: "Account panel" })
    .getByText(label, { exact: true })
    .click();
}

/**
 * How far the first Section's label sits right of the column its Items start
 * in (24 px in from the Section's edge, times the zoom): indented for the
 * corner piece when ornaments are on, aligned when off.
 */
function labelIndent(page: Page) {
  return page
    .locator('[data-mount="canvas"] section')
    .first()
    .evaluate((section) => {
      const label = section.querySelector("h2")!.getBoundingClientRect();
      const viewport = section.closest<HTMLElement>(".react-flow__viewport");
      const zoom = Number(
        /scale\(([\d.]+)\)/.exec(viewport?.style.transform ?? "")?.[1] ?? 1,
      );
      const column = section.getBoundingClientRect().left + 24 * zoom;
      // `|| 0` turns -0 into 0.
      return Math.round(label.left - column) || 0;
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
}, testInfo) => {
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
    // The Canvas draws its Sections on the client, after the page loads, so
    // also watch every change from then on: with ornaments off, a corner
    // piece must never be visible, not even for one frame.
    const w = window as unknown as { __cornerFlashed: boolean };
    w.__cornerFlashed = false;
    new MutationObserver(() => {
      if (document.documentElement.dataset.ornaments !== "off") return;
      for (const corner of document.querySelectorAll(
        '[data-ornament="section-corners"] svg',
      ))
        if (corner.checkVisibility()) w.__cornerFlashed = true;
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  const firstPaint = () =>
    page.evaluate(
      () => (window as unknown as { __firstPaint: unknown }).__firstPaint,
    );
  const cornerFlashed = () =>
    page.evaluate(
      () => (window as unknown as { __cornerFlashed: boolean }).__cornerFlashed,
    );

  test.skip(
    isProduction(testInfo.project.use.baseURL),
    "Creates an Event, so it runs on PR previews and locally only.",
  );
  await signIn();
  // A real Event, so the Canvas (S2) draws its Sections.
  await page.goto("/events");
  // Wait until Clerk's token reaches Convex, or creating the Event is refused.
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog", { name: "New Event" });
  await dialog.getByLabel("Event name").fill(`E2E ornaments ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.locator(corners).first()).toBeVisible({ timeout: 20_000 });
  const before = await sectionBoxes(page);
  expect(before.length).toBeGreaterThan(0);
  expect(await labelIndent(page)).toBeGreaterThan(0);

  await toggleOrnaments(page, "Turn ornaments off");
  await expect(page.locator(corners).first()).toBeHidden();
  expect(await sectionBoxes(page)).toEqual(before);
  expect(await labelIndent(page)).toBe(0);
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  // Before hydration <html> is already marked and no Section exists yet; once
  // the Canvas draws its Sections, no corner piece ever showed.
  expect(await firstPaint()).toEqual({ marked: "off", cornerShown: null });
  await expect(page.locator(corners).first()).toBeAttached({
    timeout: 20_000,
  });
  await expect(page.locator(corners).first()).toBeHidden();
  expect(await cornerFlashed()).toBe(false);

  await toggleOrnaments(page, "Turn ornaments on");
  await expect(page.locator(corners).first()).toBeVisible();
  expect(await sectionBoxes(page)).toEqual(before);
  expect(await labelIndent(page)).toBeGreaterThan(0);
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  expect(await firstPaint()).toEqual({ marked: null, cornerShown: null });
  await expect(page.locator(corners).first()).toBeVisible({ timeout: 20_000 });
  expect(cspViolations).toEqual([]);
});
