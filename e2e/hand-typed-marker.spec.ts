import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";
import { localDeploymentProblem } from "./local-convex";

/**
 * A hand-typed Vendor's Marker (issue #136): a Member types in the family's
 * caterer, opens the Vendor map, chooses "Drop a Marker" and clicks the map.
 * The Marker appears, labelled as placed by a Member, and the list says so.
 * Desktop and 390 × 844, axe on each.
 *
 * Seeds a local Convex deployment (`canvas:seedLocalCheck`,
 * `entries:seedPlanForLocalCheck`, `map:seedForLocalCheck`), so it runs only
 * with E2E_MAP_LOCAL=1 against `bun run dev` on a local backend. Set
 * E2E_136_SHOTS=<dir> to also save the screenshots there.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const NAME = "Sharma ji Caterers";

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

function convexRun(fn: string, args: Record<string, unknown>): string {
  const problem = localDeploymentProblem(process.env);
  if (problem !== null) throw new Error(`Refusing to seed ${fn}: ${problem}`);
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
  // On Windows it can trip a libuv assertion after printing; keep its output.
  let out: string;
  try {
    out = execFileSync(
      process.execPath,
      ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)],
      { encoding: "utf8" },
    );
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (!stdout) throw error;
    out = stdout;
  }
  return out.trim() === "" ? "" : (JSON.parse(out.trim()) as string);
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.E2E_136_SHOTS;
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: dir ? join(dir, name) : testInfo.outputPath(name),
  });
}

async function openMap(page: Page, phone = false) {
  if (phone) {
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav).toBeVisible();
    await nav.getByRole("button", { name: "Canvas" }).click();
  }
  await page.getByRole("button", { name: "Map", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Vendors on the map" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-map-ready] canvas")).toBeVisible({
    timeout: 20_000,
  });
  return sheet;
}

test.describe("a hand-typed Vendor's Marker, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_MAP_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_MAP_LOCAL=1",
  );

  test("a Member drops a Marker for the family's caterer and it shows as placed by a Member", async ({
    page,
    signIn,
    cspViolations,
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.setViewportSize(DESKTOP);
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    const eventId = convexRun("canvas:seedLocalCheck", {
      email: ownerEmail(),
      items: 3,
    });
    convexRun("entries:seedPlanForLocalCheck", { eventId });
    convexRun("map:seedForLocalCheck", { eventId });
    await page.goto(`/events/${eventId}`);
    await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
      timeout: 20_000,
    });

    // Type in the family's caterer.
    await page
      .locator('[data-canvas-item="checklist"]')
      .getByRole("button", { name: "Find Vendors for Caterer" })
      .click();
    const finder = page.getByRole("dialog", { name: "Find Vendors: Caterer" });
    const form = finder.getByRole("form", {
      name: "Add to Canvas: hand-typed Vendor",
    });
    await form.getByLabel("Name").fill(NAME);
    await form.getByLabel("Area (optional)").fill("Malviya Nagar");
    await form.getByRole("button", { name: "Add to Canvas" }).click();
    await expect(
      finder.getByRole("status").filter({ hasText: "Added" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(finder).toBeHidden();

    // On the map it is listed with no Marker; a Member drops one.
    const sheet = await openMap(page);
    const row = sheet.locator("[data-hand-typed-vendor]").filter({
      hasText: NAME,
    });
    await expect(row).toContainText("No Marker yet");
    await expect(sheet.locator("[data-hand-typed-marker]")).toHaveCount(0);
    // Keyboard only (review of PR 139): Drop a Marker puts a new Marker in
    // the middle of the map with focus on it; Escape cancels it.
    const drop = row.getByRole("button", { name: `Drop a Marker: ${NAME}` });
    await drop.focus();
    await page.keyboard.press("Enter");
    const draft = sheet.locator("[data-hand-typed-marker]");
    await expect(draft).toBeFocused();
    await expect(draft).toHaveAttribute("aria-label", `New Marker for ${NAME}`);
    // While placing, the list control says what it does now (review N4).
    await expect(
      row.getByRole("button", { name: `Cancel Marker placement: ${NAME}` }),
    ).toHaveText("Cancel");
    await page.keyboard.press("Escape");
    await expect(draft).toHaveCount(0);
    await expect(row).toContainText("No Marker yet");
    // Focus goes back to the list control, not the page (review N3).
    await expect(drop).toBeFocused();

    // Again: the arrow keys move it and Enter saves it.
    await drop.focus();
    await page.keyboard.press("Enter");
    await expect(draft).toBeFocused();
    await expect(sheet.getByRole("status")).toContainText(
      `Click the map where ${NAME} is`,
    );
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(row).toContainText("Marker placed by a Member", {
      timeout: 10_000,
    });
    const marker = sheet.locator("[data-hand-typed-marker]");
    await expect(marker).toHaveCount(1);
    // Focus lands on the placed Marker (review N3).
    await expect(marker).toBeFocused();
    await expect(marker).toHaveAttribute(
      "aria-label",
      new RegExp(`^${NAME}, Caterer, .*Marker placed by a Member$`),
    );

    // The placed Marker moves with the keyboard too.
    const before = (await marker.boundingBox())!;
    await marker.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await marker.boundingBox())!.y, { timeout: 10_000 })
      .toBeGreaterThan(before.y + 20);
    const moveControl = row.getByRole("button", {
      name: `Move the Marker: ${NAME}`,
    });
    await expect(moveControl).toBeVisible();

    // Pressing the control again cancels a move, and the nudged draft goes
    // with it: the Marker is back where it was saved, and Enter saves nothing
    // (review of PR 139, low).
    await expect
      .poll(async () => (await marker.boundingBox())!.y, { timeout: 10_000 })
      .toBeGreaterThan(before.y + 20);
    const saved = (await marker.boundingBox())!;
    await moveControl.click();
    const cancelMove = row.getByRole("button", {
      name: `Cancel Marker move: ${NAME}`,
    });
    await expect(cancelMove).toHaveText("Cancel");
    await expect(marker).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await marker.boundingBox())!.x)
      .toBeGreaterThan(saved.x + 20);
    await cancelMove.click();
    await expect(moveControl).toBeVisible();
    await expect
      .poll(async () => (await marker.boundingBox())!.x)
      .toBeLessThan(saved.x + 2);
    await marker.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_000);
    expect((await marker.boundingBox())!.x).toBeLessThan(saved.x + 2);

    // A second session moves the Marker while this session's keyboard draft
    // is open. Enter is then refused instead of overwriting that move, and
    // the Marker shows where it went (review of PR 139, medium). The version
    // check doesn't depend on who is signed in, so the second session is the
    // same e2e user in its own browser, not a second seeded Member.
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await marker.boundingBox())!.x)
      .toBeGreaterThan(saved.x + 20);
    // The second session: its own browser context, signed in separately.
    const secondSession = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
    });
    const second = await secondSession.newPage();
    await setupClerkTestingToken({ page: second });
    await second.goto("/");
    await clerk.signIn({ page: second, emailAddress: ownerEmail() });
    await second.goto(`/events/${eventId}`);
    await expect(second.locator(".react-flow__node-section")).toHaveCount(4, {
      timeout: 20_000,
    });
    const secondMarker = (await openMap(second)).locator(
      "[data-hand-typed-marker]",
    );
    const secondBefore = (await secondMarker.boundingBox())!;
    await secondMarker.focus();
    for (let i = 0; i < 5; i++) await second.keyboard.press("ArrowUp");
    await second.keyboard.press("Enter");
    await expect
      .poll(async () => (await secondMarker.boundingBox())!.y, {
        timeout: 10_000,
      })
      .toBeLessThan(secondBefore.y - 20);
    await secondSession.close();
    await expect(marker).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sheet.getByRole("alert")).toContainText(
      "Another Member changed this Marker",
      { timeout: 10_000 },
    );
    await expect
      .poll(async () => (await marker.boundingBox())!.y, { timeout: 10_000 })
      .toBeLessThan(saved.y - 20);
    expect((await marker.boundingBox())!.x).toBeLessThan(saved.x + 2);

    // "Show" flies to the Marker and focuses it (review of PR 139).
    await sheet.locator("[data-map-ready] canvas").focus();
    await row.getByRole("button", { name: `Show on the map: ${NAME}` }).click();
    await expect(marker).toBeFocused();
    await expectNoSeriousA11yViolations(page);
    await shot(page, testInfo, "1-marker-dropped-desktop.png");

    // A phone shows the same list and Marker.
    await page.setViewportSize(PHONE);
    await page.reload();
    const phoneSheet = await openMap(page, true);
    const phoneRow = phoneSheet
      .locator("[data-hand-typed-vendor]")
      .filter({ hasText: NAME });
    await expect(phoneRow).toContainText("Marker placed by a Member");
    await expect(phoneSheet.locator("[data-hand-typed-marker]")).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);
    await shot(page, testInfo, "2-map-390.png");
    await phoneRow.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "3-list-390.png");

    expect(cspViolations).toEqual([]);
  });
});
