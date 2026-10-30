import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";
import { localDeploymentProblem } from "./local-convex";

/**
 * Hand-typed Vendors (X7, issue #62): "No website? Type it in" in a checklist
 * Entry's Find Vendors adds a Vendor by name, phone and area. It lands on the
 * Vendors Section as a Shortlisted Vendor linked as Considering, labelled as
 * typed in by a Member and private to the Event, with no Listed prices. Its
 * card can be edited. Keyboard only for the form, axe on each screen, and a
 * desktop and a 390 × 844 phone view.
 *
 * Seeds a local Convex deployment (`canvas:seedLocalCheck` and
 * `entries:seedPlanForLocalCheck`), so it runs only with E2E_VENDORS_LOCAL=1
 * against `bun run dev` on a local backend. Set E2E_X7_SHOTS=<dir> to also
 * save the screenshots there.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

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
  const dir = process.env.E2E_X7_SHOTS;
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: dir ? join(dir, name) : testInfo.outputPath(name),
  });
}

const waitForCanvas = (page: Page) =>
  expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });

test.describe("hand-typed Vendors, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_VENDORS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_VENDORS_LOCAL=1",
  );

  test("a Member types in the family's caterer, sees it on the Canvas as Member-typed and edits it", async ({
    page,
    cspViolations,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.setViewportSize(DESKTOP);
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: ownerEmail() });
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    const eventId = convexRun("canvas:seedLocalCheck", {
      email: ownerEmail(),
      items: 7,
    });
    convexRun("entries:seedPlanForLocalCheck", { eventId });
    await page.goto(`/events/${eventId}`);
    await waitForCanvas(page);

    // Find Vendors on the caterer Entry, then the form, by keyboard.
    const checklist = page.locator('[data-canvas-item="checklist"]');
    await checklist
      .getByRole("button", { name: "Find Vendors for Caterer" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Find Vendors: Caterer" });
    await expect(sheet).toBeVisible();
    const form = sheet.getByRole("form", {
      name: "Add to Canvas: hand-typed Vendor",
    });
    await expect(form).toContainText("Category: Caterer");

    // An empty name is refused before anything is sent.
    await form.getByRole("button", { name: "Add to Canvas" }).click();
    await expect(form).toContainText("Type the Vendor's name.");

    await form.getByLabel("Name").focus();
    await page.keyboard.type("Sharma ji Caterers");
    await page.keyboard.press("Tab");
    await page.keyboard.type("+91 98290 12345");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Malviya Nagar");
    await page.keyboard.press("Enter");
    await expect(
      sheet.getByRole("status").filter({ hasText: "Added" }),
    ).toContainText(
      "Added Sharma ji Caterers to the Canvas, linked to Caterer.",
      { timeout: 10_000 },
    );
    await expectNoSeriousA11yViolations(page);
    await shot(page, testInfo, "find-vendors-type-it-in-desktop.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // On the Canvas: a Shortlisted Vendor with only what was typed.
    const item = page
      .locator('[data-canvas-item="shortlistedVendor"]')
      .filter({ hasText: "Sharma ji Caterers" });
    await expect(item).toHaveCount(1, { timeout: 20_000 });
    await expect(item).toContainText(
      "Typed in by a Member · private to this Event",
    );
    await expect(item).toContainText("Caterer: Considering");
    await expect(item).toContainText("Malviya Nagar");
    await expect(
      item.getByRole("link", { name: "+91 98290 12345" }),
    ).toHaveAttribute("href", "tel:+919829012345");
    await expect(item).toContainText("No Listed prices");
    await expect(item.locator("img")).toHaveCount(0);

    // Edit: a new area.
    await item.getByRole("button", { name: "Edit Sharma ji Caterers" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Edit Sharma ji Caterers",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Area (optional)").fill("Mansarovar");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(item).toContainText("Mansarovar");

    // A stale form: the dialog opens here, a second tab saves first, and this
    // save is refused with the newer values reloaded.
    await item.getByRole("button", { name: "Edit Sharma ji Caterers" }).click();
    await expect(dialog).toBeVisible();
    const other = await page.context().newPage();
    await other.goto(`/events/${eventId}`);
    await waitForCanvas(other);
    const otherItem = other
      .locator('[data-canvas-item="shortlistedVendor"]')
      .filter({ hasText: "Sharma ji Caterers" });
    await otherItem
      .getByRole("button", { name: "Edit Sharma ji Caterers" })
      .click();
    const otherDialog = other.getByRole("dialog", {
      name: "Edit Sharma ji Caterers",
    });
    await otherDialog.getByLabel("Phone (optional)").fill("0141 270 1234");
    await otherDialog.getByRole("button", { name: "Save" }).click();
    await expect(otherDialog).toBeHidden({ timeout: 10_000 });
    await other.close();
    await dialog.getByLabel("Area (optional)").fill("Vaishali Nagar");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Someone else changed this Vendor while you were editing.",
      { timeout: 10_000 },
    );
    await expect(dialog.getByLabel("Phone (optional)")).toHaveValue(
      "0141 270 1234",
    );
    await expect(dialog.getByLabel("Area (optional)")).toHaveValue(
      "Mansarovar",
    );
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(item).toContainText("0141 270 1234");
    await expect(item).toContainText("Mansarovar");
    await expectNoSeriousA11yViolations(page);
    // A wider window so the card sits clear of the Chat for its screenshot.
    await page.setViewportSize({ width: 1680, height: 1050 });
    await expect(item).toBeInViewport({ ratio: 0.9 });
    await shot(page, testInfo, "hand-typed-vendor-card-desktop.png");

    // A phone: the sheet and its form fit 390 × 844.
    // On a phone the Canvas tab is Compact mode.
    await page.setViewportSize(PHONE);
    await page.reload();
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Canvas" })
      .click();
    await expect(page.locator("[data-compact]")).toBeVisible({
      timeout: 20_000,
    });
    const compactItem = page
      .locator('[data-compact-item="shortlistedVendor"]')
      .filter({ hasText: "Sharma ji Caterers" });
    await expect(compactItem).toContainText("Mansarovar");
    await compactItem.evaluate((el) => el.scrollIntoView({ block: "start" }));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(PHONE.width);
    await expectNoSeriousA11yViolations(page);
    await shot(page, testInfo, "hand-typed-vendor-card-phone.png");

    await page
      .locator('[data-compact-item="checklist"]')
      .getByRole("button", { name: "Find Vendors for Caterer" })
      .click();
    const phoneSheet = page.getByRole("dialog", {
      name: "Find Vendors: Caterer",
    });
    await expect(phoneSheet).toBeVisible();
    const box = await phoneSheet.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(PHONE.width);
    await phoneSheet
      .getByRole("heading", { name: "No website? Type it in" })
      .scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(page);
    await shot(page, testInfo, "find-vendors-type-it-in-phone.png");

    expect(cspViolations).toEqual([]);
  });
});
