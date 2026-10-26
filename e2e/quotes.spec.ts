import { execFileSync } from "node:child_process";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Quotes and the Budget comparison (S12): a Member adds a Quote with a photo
 * on a Shortlisted Vendor's caterer link, then the caterer's WhatsApp message
 * "Veg 950/plate for 300 pax, live counters extra" arrives as one Proposal,
 * and Accept saves it as the current Quote. The sangeet catering line shows
 * its Estimate, the Vendor's Listed price and the ₹2.85L Quote side by side,
 * over its planned amount in colour and words. Booking the Vendor asks "Use
 * the ₹2.85L Quote as this line's amount?", and only the Member's yes changes
 * the line, which puts the Budget ₹40,000 over and brings the "Suggest cuts"
 * Nudge.
 *
 * The stub model never calls a tool, so the Chat request and the real
 * `proposeQuote` path run through `quotes:pasteForLocalCheck` (the scripted
 * model case is evals/quotes.eval.ts). It needs a local Convex deployment:
 * set E2E_QUOTES_LOCAL=1 against `bun run dev`.
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
  // A function that returns null prints nothing.
  const text = out.trim();
  return (text === "" ? null : JSON.parse(text)) as T;
}

/** A 1×1 PNG, standing in for a photo of the caterer's quote. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const shortlisted = (page: Page) =>
  page.locator('[data-canvas-item="shortlistedVendor"]').first();
const budget = (page: Page) => page.locator('[data-canvas-item="budget"]');
const cateringRow = (page: Page) =>
  budget(page)
    .locator("li[data-entry-id]")
    .filter({
      has: page.getByRole("list", { name: "Vendor prices for Catering" }),
    });

test.describe("Quotes, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_QUOTES_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_QUOTES_LOCAL=1",
  );

  test("a Quote by form and one pasted from WhatsApp, compared on the Budget, used only on the Member's yes", async ({
    page,
    signIn,
    cspViolations,
  }, testInfo) => {
    test.setTimeout(180_000);
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Quotes ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
      timeout: 20_000,
    });
    const eventId = new URL(page.url()).pathname.split("/").pop()!;

    // The starter caterers in the Chat, then the sangeet Budget they price.
    const cards = convexRun<{ ok: boolean; found: number }>(
      "assistant/tools/vendors:cardsForLocalCheck",
      { eventId, email: ownerEmail() },
    );
    expect(cards.ok).toBe(true);
    convexRun("quotes:budgetForLocalCheck", { eventId });

    // Shortlist Vinayak onto the Canvas: its caterer link starts Considering.
    const vinayak = page
      .getByRole("list", { name: "Vendor cards: caterers" })
      .getByRole("article")
      .filter({ hasText: "Vinayak" });
    await expect(vinayak).toBeVisible({ timeout: 20_000 });
    await vinayak.getByRole("button", { name: /^Add to Canvas: / }).click();
    await expect(shortlisted(page)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Show the whole Canvas" }).click();
    const item = shortlisted(page);
    const status = item.getByRole("button", { name: /^Status for / });
    await expect(status).toContainText("Considering");
    await expect(item).toContainText("No Quote yet.");

    // "Add Quote" by form, with a photo: the link moves to Quoted.
    await item.getByRole("button", { name: "Add Quote for Caterer" }).click();
    const form = page.getByRole("dialog", { name: /^Add a Quote from / });
    await form.getByLabel("Amount (₹)").fill("1000");
    await expect(form.getByLabel("Sangeet")).toBeChecked();
    await form.getByLabel("Guests it assumes").fill("300");
    await form.getByLabel("Note").fill("Phoned, veg only");
    await form
      .getByLabel("Photo or PDF of the quote (optional)")
      .setInputFiles({
        name: "quote.png",
        mimeType: "image/png",
        buffer: PHOTO,
      });
    await expect(form).toContainText("₹1,000/plate × 300 = ₹3L");
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("add-quote-desktop.png"),
    });
    await form.getByRole("button", { name: "Save Quote" }).click();
    await expect(form).toBeHidden({ timeout: 20_000 });
    await expect(status).toContainText("Quoted", { timeout: 10_000 });
    await expect(item).toContainText("₹1,000/plate × 300 = ₹3L");

    // The WhatsApp paste arrives as one Proposal; Accept saves its Quote.
    const pasted = convexRun<{ ok: boolean }>("quotes:pasteForLocalCheck", {
      eventId,
      email: ownerEmail(),
    });
    expect(pasted.ok).toBe(true);
    const proposal = page.locator("[data-proposal]").first();
    await expect(proposal).toBeVisible({ timeout: 20_000 });
    await expect(proposal.locator("[data-proposal-line]")).toHaveText([
      /^Quote from Vinayak.*: ₹950\/plate for 300 Guests at the Sangeet \(₹2,85,000\), live counters extra$/,
    ]);
    await proposal.getByRole("button", { name: "Accept" }).click();
    await expect(proposal.locator("[data-proposal-reason]")).toHaveText(
      /^Accepted by /,
      { timeout: 10_000 },
    );
    await expect(item).toContainText("₹950/plate × 300 = ₹2.85L", {
      timeout: 10_000,
    });
    await expect(item).toContainText("From the Chat");

    // The form Quote is now the older one; its photo opens for this Event.
    await item.getByRole("button", { name: "1 older Quote" }).click();
    const popup = page.waitForEvent("popup");
    await item.getByRole("button", { name: /^Open the photo/ }).click();
    expect((await popup).url()).toContain("/api/storage/");
    await (await popup).close();

    // The sangeet line: Estimate, Listed price and Quote side by side, the
    // Quote ₹40,000 over the planned ₹2,45,000, in words as well as colour.
    const row = cateringRow(page);
    await expect(row).toContainText("₹2,45,000");
    const prices = row.getByRole("list", {
      name: "Vendor prices for Catering",
    });
    await expect(prices).toContainText("Vinayak");
    await expect(prices).toContainText("250");
    await expect(prices).toContainText("₹950/plate × 300 = ₹2.85L");
    const over = prices.locator('[data-verdict="over"]').first();
    await expect(over).toHaveText("₹40,000 over the planned ₹2,45,000");
    await row.scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("budget-comparison-desktop.png"),
    });
    // The same line at reading size, in the Budget's panel.
    await budget(page)
      .getByRole("button", { name: "Open the Budget in a panel" })
      .click();
    const panel = page.getByRole("dialog", { name: "Budget" });
    await expect(
      panel.getByRole("list", { name: "Vendor prices for Catering" }),
    ).toContainText("₹40,000 over the planned ₹2,45,000");
    await expectNoSeriousA11yViolations(page);
    await panel.screenshot({
      path: testInfo.outputPath("budget-panel-desktop.png"),
    });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Booked asks before using the Quote; the line waits for the yes.
    await status.click();
    await page.getByRole("menuitem", { name: "Booked" }).click();
    await expect(status).toContainText("Booked", { timeout: 10_000 });
    const ask = item.getByRole("group", { name: "Use the Quote" });
    await expect(ask).toContainText(
      "Use the ₹2.85L Quote as this line's amount?",
    );
    await expect(row).toContainText("₹2,45,000");
    await expectNoSeriousA11yViolations(page);
    await item.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("booked-ask-desktop.png"),
    });
    await ask.getByRole("button", { name: "Yes, use it" }).click();
    await expect(ask).toBeHidden({ timeout: 10_000 });
    await expect(row).toContainText("₹2,85,000");

    // ₹9,55,000 + ₹2,85,000 on a ₹12,00,000 Budget: the Nudge offers cuts.
    const nudge = page.locator('[data-chat-row="system"]').filter({
      hasText: "The Budget is now ₹40,000 over. Want me to suggest cuts?",
    });
    await expect(nudge).toBeVisible({ timeout: 20_000 });
    await expect(
      nudge.getByRole("button", { name: "Suggest cuts" }),
    ).toBeVisible();

    // At 390 px the Canvas tab's Compact mode keeps the Quotes readable.
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: "Canvas" })
      .click();
    const compact = page.locator('[data-compact-item="shortlistedVendor"]');
    await expect(compact).toContainText("₹950/plate × 300 = ₹2.85L", {
      timeout: 20_000,
    });
    await compact.scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(page);
    await compact.screenshot({
      path: testInfo.outputPath("shortlisted-vendor-390.png"),
    });
    const compactBudget = page.locator('[data-compact-item="budget"]');
    await compactBudget
      .getByRole("list", { name: "Vendor prices for Catering" })
      .scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({
      path: testInfo.outputPath("budget-comparison-390.png"),
    });
    expect(cspViolations).toEqual([]);
  });
});
