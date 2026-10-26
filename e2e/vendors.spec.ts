import { execFileSync } from "node:child_process";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Vendors (S9): "show me caterers for the sangeet" shows the hand-checked
 * Jaipur caterers as Vendor cards in the Chat, each with provenance per
 * section, the exact sentence behind a Listed price, the Assistant's summary,
 * a neutral category illustration and "Compare on WedMeGood", and never a
 * Vendor photo. "Add to Canvas" on the second card shortlists it onto the
 * Vendors Section, where its link's status can be set to Booked.
 *
 * The stub model never calls a tool, so the request and the real
 * `findVendors` mutation's cards are seeded through
 * `assistant/tools/vendors:cardsForLocalCheck` (the scripted model case runs
 * in convex/assistant/tools/vendors.reply.test.ts). It needs a local Convex
 * deployment: set E2E_VENDORS_LOCAL=1 against `bun run dev`.
 */

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

function convexRun<T>(fn: string, args: Record<string, unknown>): T {
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
  return JSON.parse(out.trim()) as T;
}

/** Signs in, makes a fresh Event and waits for its Canvas. */
async function newEvent(page: Page, signIn: () => Promise<void>, name: string) {
  await signIn();
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog", { name: "New Event" });
  await dialog.getByLabel("Event name").fill(`${name} ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });
  return new URL(page.url()).pathname.split("/").pop()!;
}

const cardList = (page: Page) =>
  page.getByRole("list", { name: "Vendor cards: caterers" });
const shortlisted = (page: Page) =>
  page.locator('[data-canvas-item="shortlistedVendor"]');

test.describe("Vendor cards, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_VENDORS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_VENDORS_LOCAL=1",
  );

  test('"show me caterers for the sangeet" shows starter caterer cards with provenance, and "Add to Canvas" shortlists the second one', async ({
    page,
    signIn,
    cspViolations,
  }, testInfo) => {
    test.setTimeout(150_000);
    const eventId = await newEvent(page, signIn, "E2E Vendors");
    const result = convexRun<{ ok: boolean; found: number }>(
      "assistant/tools/vendors:cardsForLocalCheck",
      { eventId, email: ownerEmail() },
    );
    expect(result.ok).toBe(true);
    expect(result.found).toBeGreaterThanOrEqual(2);

    const cards = cardList(page).getByRole("article");
    await expect(cards).toHaveCount(result.found, { timeout: 20_000 });

    // Vinayak's starting price, and where it was read.
    const vinayak = cards.filter({ hasText: "Vinayak" });
    await expect(vinayak).toContainText("from ₹250/plate (starting price)");
    await expect(vinayak).toContainText("from vinayakfoodsncatering.in · seen");
    await expect(vinayak).toContainText("Summary by the Assistant");
    await vinayak
      .getByRole("button", { name: "The exact sentence" })
      .first()
      .click();
    await expect(vinayak.locator("blockquote")).toContainText("250");

    // A neutral illustration on every card, a WedMeGood listing link, no photo.
    await expect(cards.locator("svg[data-illustration]")).toHaveCount(
      result.found,
    );
    await expect(cards.locator("img")).toHaveCount(0);
    await expect(
      cards.first().getByRole("link", { name: "Compare on WedMeGood" }),
    ).toHaveAttribute(
      "href",
      "https://www.wedmegood.com/vendors/jaipur/wedding-catering/",
    );

    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("vendor-cards-desktop.png"),
    });

    // "Add to Canvas" on the second card: one Shortlisted Vendor on the Canvas.
    const second = cards.nth(1);
    const secondName = (await second.getByRole("heading").first().innerText())
      .trim()
      .split("\n")[0]!;
    await second.getByRole("button", { name: /^Add to Canvas: / }).click();
    await expect(second).toContainText("On the Canvas", { timeout: 10_000 });
    await expect(shortlisted(page)).toHaveCount(1, { timeout: 20_000 });
    const item = shortlisted(page).first();
    await expect(item).toContainText(secondName);
    await expect(item.locator("img")).toHaveCount(0);

    // Its link starts as Considering; Booked marks it booked.
    const status = item.getByRole("button", { name: /^Status for / });
    await expect(status).toContainText("Considering");
    await status.click();
    await page.getByRole("menuitem", { name: "Booked" }).click();
    await expect(
      item.getByRole("button", { name: /^Status for / }),
    ).toContainText("Booked", { timeout: 10_000 });
    await expect(second).toContainText("Booked", { timeout: 10_000 });
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("shortlisted-vendor-desktop.png"),
    });

    // At 390 px the cards stay readable in the Chat.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cardList(page)).toBeVisible({ timeout: 20_000 });
    await cardList(page).scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("vendor-cards-390.png"),
    });
    expect(cspViolations).toEqual([]);
  });
});
