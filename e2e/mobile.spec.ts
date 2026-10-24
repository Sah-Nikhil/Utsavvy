import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Compact mode and the phone layout (S16). The e2e user (the Owner) on a
 * 390 × 844 phone: the Chat is the main view and the Canvas tab is Compact
 * mode. On desktop the freeform Canvas links to "Canvas as a list".
 *
 * The first group runs on PR previews and locally: it creates an Event with
 * "New Event" (S1), which nothing cleans up, so it never runs on production.
 * The second group needs the Assistant's pointing, which only a local check
 * function can make: it runs with E2E_CANVAS_LOCAL=1 against `bun run dev`.
 */

const PRODUCTION_HOST = "utsavvy.vercel.app";
const PHONE = { width: 390, height: 844 };

function isProduction(baseURL: string | undefined): boolean {
  return baseURL ? new URL(baseURL).hostname === PRODUCTION_HOST : false;
}

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

type Person = { context: BrowserContext; page: Page };

async function signedIn(
  browser: Browser,
  testInfo: TestInfo,
  viewport: { width: number; height: number },
  phone: boolean,
): Promise<Person> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    viewport,
    hasTouch: phone,
    isMobile: phone,
  });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: ownerEmail() });
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

const chatPane = (page: Page) => page.locator('aside[data-mount="chat"]');
const canvasPane = (page: Page) => page.locator('main[data-mount="canvas"]');
const tab = (page: Page, name: "Chat" | "Canvas") =>
  page.getByRole("navigation", { name: "Workspace" }).getByRole("button", {
    name,
  });

async function waitForCompact(page: Page) {
  await expect(page.locator("[data-compact]")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("phone layout and Compact mode", () => {
  test.describe.configure({ mode: "serial" });

  let phone: Person;
  let workspace = "";

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(
      isProduction(testInfo.project.use.baseURL),
      "Creates an Event, so it runs on PR previews and locally only.",
    );
    testInfo.setTimeout(120_000);
    phone = await signedIn(browser, testInfo, PHONE, true);
    const { page } = phone;
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Phone ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    workspace = new URL(page.url()).pathname;
  });

  test.afterAll(async () => {
    await phone?.context.close();
  });

  test("at 390 × 844 the Chat is the main view and the Canvas tab is Compact mode, both passing axe", async () => {
    const { page } = phone;
    await expect(chatPane(page)).toBeVisible();
    await expect(canvasPane(page)).toBeHidden();
    await expect(tab(page, "Chat")).toHaveAttribute("aria-current", "page");
    // Nothing overflows the phone's width.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(PHONE.width);
    await expectNoSeriousA11yViolations(page);

    await tab(page, "Canvas").click();
    await expect(canvasPane(page)).toBeVisible();
    await expect(chatPane(page)).toBeHidden();
    await waitForCompact(page);
    for (const name of [
      "Money and dates",
      "Vendors",
      "Inspirations",
      "Notes",
    ]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${name}`) }),
      ).toHaveAttribute("aria-expanded", "true");
    }
    for (const kind of ["budget", "timeline", "checklist"]) {
      await expect(page.locator(`[data-compact-item="${kind}"]`)).toHaveCount(
        1,
      );
    }
    // Moving Items between Sections is desktop-only: no drag handles here.
    await expect(
      page.getByRole("button", { name: /^Drag to reorder/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(PHONE.width);
    await expectNoSeriousA11yViolations(page);
  });

  test("the header keeps its panels behind More on a phone", async () => {
    const { page } = phone;
    await page.getByRole("button", { name: /^More/ }).click();
    await page.getByRole("menuitem", { name: "People" }).click();
    await expect(page.getByRole("dialog", { name: "People" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "People" })).toBeHidden();
  });

  test("a Note written and edited on the phone", async () => {
    const { page } = phone;
    await page.getByRole("button", { name: "Add a Note" }).click();
    await page
      .getByRole("textbox", { name: "New Note" })
      .fill("Book the dhol players");
    await page.getByRole("button", { name: "Add Note", exact: true }).click();
    const note = page.locator('[data-compact-item="note"]');
    await expect(note).toContainText("Book the dhol players");

    await note.getByRole("button", { name: "Edit" }).click();
    await note
      .getByRole("textbox", { name: "Note text" })
      .fill("Book the dhol players for the baraat");
    await note.getByRole("button", { name: "Save" }).click();
    await expect(note).toContainText("Book the dhol players for the baraat");
  });

  test("a History row shows its Item on the Canvas tab, on a phone", async () => {
    // Review of #113, M2: History opens from More, over the Chat.
    const { page } = phone;
    await tab(page, "Chat").click();
    await page.getByRole("button", { name: /^More/ }).click();
    await page.getByRole("menuitem", { name: "History" }).click();
    const history = page.getByRole("dialog", { name: "Edit history" });
    await history
      .getByRole("button", { name: /show on the Canvas/ })
      .first()
      .click();
    await expect(history).toBeHidden();
    await expect(canvasPane(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to Chat" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Chat" }).click();
    await expect(chatPane(page)).toBeVisible();
    await tab(page, "Canvas").click();
  });

  test("grouping by Function and a collapsed group are personal and stay after a reload", async () => {
    const { page } = phone;
    await page.getByRole("radio", { name: "By Function" }).click();
    const eventWide = page.getByRole("button", { name: /^Event-wide/ });
    await expect(eventWide).toBeVisible();
    await eventWide.click();
    await expect(eventWide).toHaveAttribute("aria-expanded", "false");

    await page.reload();
    await tab(page, "Canvas").click();
    await waitForCompact(page);
    await expect(
      page.getByRole("radio", { name: "By Function" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByRole("button", { name: /^Event-wide/ }),
    ).toHaveAttribute("aria-expanded", "false");

    // Back to the Event's default for the next run.
    await page.getByRole("button", { name: /^Event-wide/ }).click();
    await page.getByRole("radio", { name: "By Section" }).click();
  });

  test("on desktop the freeform Canvas links to 'Canvas as a list', and a tablet keeps the Chat beside it", async ({
    browser,
  }, testInfo) => {
    const desktop = await signedIn(
      browser,
      testInfo,
      { width: 1280, height: 800 },
      false,
    );
    try {
      const { page } = desktop;
      await page.goto(workspace);
      await expect(page.locator("[data-canvas]")).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: "Canvas as a list" }).click();
      await waitForCompact(page);
      await expect(page.locator('[data-compact-item="budget"]')).toBeVisible();
      await expect(chatPane(page)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await page.getByRole("button", { name: "Freeform Canvas" }).click();
      await expect(page.locator("[data-canvas]")).toBeVisible();

      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(chatPane(page)).toBeVisible();
      await expect(canvasPane(page)).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Workspace" }),
      ).toHaveCount(0);
    } finally {
      await desktop.context.close();
    }
  });
});

// ---------------------------------------------------------------------------

function convexRun(fn: string, args: Record<string, unknown>): string {
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
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
  return JSON.parse(out.trim()) as string;
}

test.describe("phone pointing, seeded on a local deployment", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    process.env.E2E_CANVAS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_CANVAS_LOCAL=1",
  );

  let eventId = "";
  let phone: Person;
  let noteId = "";

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    phone = await signedIn(browser, testInfo, PHONE, true);
    eventId = convexRun("canvas:seedLocalCheck", {
      email: ownerEmail(),
      items: 8,
    });
    const { page } = phone;
    await page.goto(`/events/${eventId}`);
    await tab(page, "Canvas").click();
    await waitForCompact(page);
    noteId = (await page
      .locator('[data-compact-item="note"]')
      .first()
      .getAttribute("data-item-row"))!;
    await tab(page, "Chat").click();
  });

  test.afterAll(async () => {
    // Leave the person following each Event's default again.
    if (phone) {
      await phone.page.goto("/settings");
      await phone.page
        .getByRole("radio", { name: /Each Event's default/ })
        .check();
      await phone.context.close();
    }
  });

  test("tapping Utsavvy's pointing jumps to the Canvas tab with the Item highlighted and Back to Chat", async () => {
    const { page } = phone;
    convexRun("canvas:pointForLocalCheck", {
      eventId,
      email: ownerEmail(),
      itemIds: [noteId],
    });
    const reference = page.getByRole("button", {
      name: /Utsavvy pointed at the Note/,
    });
    await expect(reference).toBeVisible({ timeout: 10_000 });
    await reference.click();

    await expect(canvasPane(page)).toBeVisible();
    const row = page.locator(`[data-item-row="${noteId}"]`);
    await expect(row).toBeInViewport();
    await expect(row.locator("[data-item-id][data-selected]")).toHaveCount(1);
    await expect(row.locator("[data-pointed]").first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Back to Chat" }).click();
    await expect(chatPane(page)).toBeVisible();
    await expect(reference).toBeHidden();
  });

  test("with 'Open a preview' in their settings, the reference opens a preview sheet over the Chat", async () => {
    const { page } = phone;
    await page.goto("/settings");
    await page.getByRole("radio", { name: /Open a preview/ }).check();
    await expect(
      page.getByRole("radio", { name: /Open a preview/ }),
    ).toBeChecked();
    await page.goto(`/events/${eventId}`);
    await expect(chatPane(page)).toBeVisible({ timeout: 20_000 });

    convexRun("canvas:pointForLocalCheck", {
      eventId,
      email: ownerEmail(),
      itemIds: [noteId],
    });
    await page
      .getByRole("button", { name: /Utsavvy pointed at the Note/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Note" });
    await expect(sheet).toBeVisible();
    await expect(chatPane(page)).toBeVisible();
    await expect(sheet.locator('[data-compact-item="note"]')).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await sheet.getByRole("button", { name: "Show on the Canvas tab" }).click();
    await expect(sheet).toBeHidden();
    await expect(canvasPane(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to Chat" }),
    ).toBeVisible();
  });
});
