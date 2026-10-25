import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test } from "./fixtures";

/**
 * The edit history and Restore (S6). The e2e user creates an Event, so the
 * history starts with S1's and S2's rows ("Created the Event", the starting
 * Sections and plan Items). It then adds and deletes a custom Section,
 * Restores it from the history, and clicks a row to highlight its Item.
 * It creates an Event nothing cleans up, so it never runs against production.
 */

const PRODUCTION_HOST = "utsavvy.vercel.app";

test("lists changes with who made them, Restores a deleted Section and highlights an Item", async ({
  page,
  signIn,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  test.skip(
    !!baseURL && new URL(baseURL).hostname === PRODUCTION_HOST,
    "Creates an Event, so it runs on PR previews and locally only.",
  );
  test.setTimeout(120_000);

  await signIn();
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog", { name: "New Event" });
  await dialog.getByLabel("Event name").fill(`E2E History ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });

  // Add a custom Section, then delete it.
  await page.getByRole("button", { name: "New Section" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Sangeet night");
  await page.getByRole("button", { name: "Add Section" }).click();
  const sangeet = page.getByRole("heading", {
    level: 2,
    name: "Sangeet night",
  });
  await expect(sangeet).toBeVisible({ timeout: 5_000 });
  await page
    .getByRole("button", { name: "Sangeet night Section actions" })
    .click();
  await page.getByRole("menuitem", { name: "Delete Section" }).click();
  await page.getByRole("button", { name: "Delete Section" }).click();
  await expect(sangeet).toHaveCount(0, { timeout: 5_000 });

  // The history shows it, newest first, with who did it.
  await page.getByRole("button", { name: "History" }).click();
  const panel = page.getByRole("dialog", { name: "Edit history" });
  const deleted = panel
    .locator("[data-change]")
    .filter({ hasText: 'Deleted the Section "Sangeet night"' });
  await expect(deleted).toBeVisible({ timeout: 10_000 });
  await expect(
    panel.locator("[data-change]").filter({ hasText: "Created the Event" }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await testInfo.attach("history-panel", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // Restore brings the Section back and adds its own row at the top.
  await deleted.getByRole("button", { name: /^Restore/ }).click();
  await expect(panel.getByRole("status")).toContainText("Restored");
  await expect(panel.locator("[data-change]").first()).toContainText(
    'Restored the Section "Sangeet night"',
  );
  // Restoring that row would delete the Section again, so it offers no Restore.
  await expect(
    panel
      .locator("[data-change]")
      .first()
      .getByRole("button", { name: /^Restore/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sangeet).toBeVisible({ timeout: 5_000 });

  // Look far away from the Budget first (review of #90): this person's view
  // is kept in the browser, so a saved one far off opens there on reload.
  const budget = page.locator('[data-canvas-item="budget"]');
  const eventId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate((id) => {
    window.localStorage.setItem(
      `utsavvy.canvas.viewport.${id}`,
      JSON.stringify({ x: -6000, y: -4000, zoom: 1 }),
    );
  }, eventId);
  await page.reload();
  await expect(page.locator(".react-flow__node-section")).toHaveCount(5, {
    timeout: 20_000,
  });
  await expect(budget).not.toBeInViewport();

  // Clicking a row closes the panel, selects its Item and pans to it.
  await page.getByRole("button", { name: "History" }).click();
  await panel
    .getByRole("button", {
      name: /^Added the Budget .*show on the Canvas$/,
    })
    .click();
  await expect(panel).toBeHidden();
  await expect(
    page.locator('[data-canvas-item="budget"] [data-item-id][data-selected]'),
  ).toBeVisible();
  await expect(budget).toBeInViewport({ timeout: 5_000 });
  await testInfo.attach("history-highlight", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // "Add a Note" on the Canvas toolbar puts a Note in the Notes Section and
  // shows it (review of #92).
  await page.getByRole("button", { name: "Add a Note" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Add a Note" });
  await noteDialog
    .getByRole("textbox", { name: "Note" })
    .fill("Ask Nani about the haldi songs");
  await noteDialog.getByRole("button", { name: "Add Note" }).click();
  await expect(noteDialog).toBeHidden();
  const note = page
    .locator('[data-canvas-item="note"]')
    .filter({ hasText: "Ask Nani about the haldi songs" });
  await expect(note).toBeInViewport({ timeout: 5_000 });
  await expect(note.locator("[data-item-id][data-selected]")).toBeVisible();
  await testInfo.attach("add-a-note", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
