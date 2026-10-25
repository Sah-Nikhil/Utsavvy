import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Nudges and @Utsavvy in Comments (S17). Meera (the Owner, the e2e user)
 * types two budget lines that put the Budget ₹40,000 over; plain code posts
 * the Nudge in the Chat, and its "Suggest cuts" button sends the ready-made
 * request as hers. Then she asks @Utsavvy in a Comment on the Caterer line,
 * and the answer arrives in the thread with one line in the Chat.
 *
 * Members set the Budget total through the Brief, which this test doesn't
 * walk, so `nudges:budgetForLocalCheck` sets it. It needs a local Convex
 * deployment running the stub model: set E2E_NUDGES_LOCAL=1 against
 * `bun run dev`.
 */

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

/** Makes the Clerk test user the first time, so no account is set up by hand. */
async function ensureClerkUser(email: string, firstName: string) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Set CLERK_SECRET_KEY to create test users.");
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
  const found = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!found.ok) throw new Error(`Clerk user lookup failed: ${found.status}`);
  if (((await found.json()) as unknown[]).length > 0) return;
  const created = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [email],
      first_name: firstName,
      last_name: "E2E",
      skip_password_requirement: true,
    }),
  });
  if (!created.ok)
    throw new Error(`Creating the Clerk test user failed: ${created.status}`);
}

function convexRun(fn: string, args: Record<string, unknown>): void {
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
  // On Windows it can trip a libuv assertion after printing; keep its output.
  try {
    execFileSync(
      process.execPath,
      ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)],
      { encoding: "utf8" },
    );
  } catch (error) {
    if ((error as { stdout?: string }).stdout === undefined) throw error;
  }
}

type Person = { context: BrowserContext; page: Page };

async function signedIn(
  browser: Browser,
  testInfo: TestInfo,
  email: string,
): Promise<Person> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
  });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

const budget = (page: Page) => page.locator('[data-canvas-item="budget"]');

async function addLine(page: Page, label: string, amount: string) {
  await budget(page).getByRole("textbox", { name: "New line" }).fill(label);
  await budget(page)
    .getByRole("textbox", { name: "Amount in rupees" })
    .fill(amount);
  await budget(page).getByRole("button", { name: "Add line" }).click();
  await expect(
    budget(page).getByRole("button", { name: label, exact: true }),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("Nudges and @Utsavvy, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_NUDGES_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_NUDGES_LOCAL=1",
  );

  test("the over-budget Nudge sends its request, and @Utsavvy answers in a Comment thread", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    const meera = await signedIn(browser, testInfo, ownerEmail());
    const { page } = meera;

    try {
      await page.getByRole("button", { name: "New Event" }).click();
      const dialog = page.getByRole("dialog", { name: "New Event" });
      await dialog.getByLabel("Event name").fill(`E2E Nudges ${Date.now()}`);
      await dialog.getByRole("button", { name: "Create Event" }).click();
      await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, {
        timeout: 20_000,
      });
      const eventId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect(budget(page)).toBeVisible({ timeout: 20_000 });
      convexRun("nudges:budgetForLocalCheck", {
        eventId,
        budgetTotal: 1_200_000,
      });

      // ₹9,55,000 + ₹2,85,000 on a ₹12,00,000 Budget: ₹40,000 over.
      await addLine(page, "Venue", "955000");
      await addLine(page, "Caterer", "285000");

      const nudge = page.locator('[data-chat-row="system"]').filter({
        hasText: "The Budget is now ₹40,000 over. Want me to suggest cuts?",
      });
      await expect(nudge).toBeVisible({ timeout: 20_000 });
      const button = nudge.getByRole("button", { name: "Suggest cuts" });
      await expect(button).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({
        path: testInfo.outputPath("nudge-desktop.png"),
      });

      // Reachable by keyboard; the request goes out as Meera's own message.
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(nudge).toContainText("asked Utsavvy: Suggest cuts", {
        timeout: 10_000,
      });
      await expect(
        page.getByText(
          "Suggest cuts to bring the Budget back within its total.",
        ),
      ).toBeVisible();

      // @Utsavvy in a Comment on the Caterer line.
      await budget(page)
        .getByRole("listitem")
        .filter({ hasText: "Caterer" })
        .getByRole("button", { name: "Comment on this Entry" })
        .click();
      const sheet = page.getByRole("dialog", { name: "Comments" });
      await sheet
        .getByRole("textbox", { name: "Comment on this Entry" })
        .fill("@Utsavvy is ₹2,85,000 fair for 150 Guests?");
      await sheet.getByRole("button", { name: "Comment", exact: true }).click();
      const reply = sheet.getByRole("article", {
        name: /^Comment by Utsavvy for /,
      });
      await expect(reply).toContainText("Utsavvy's test model", {
        timeout: 30_000,
      });
      await expect(
        page.locator('[data-chat-row="system"]').filter({
          hasText: /^Utsavvy answered .+ in a Comment on Caterer$/,
        }),
      ).toBeVisible({ timeout: 10_000 });
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({
        path: testInfo.outputPath("comment-ask-desktop.png"),
      });

      // The Nudge and the thread at phone width: the Chat tab, then the
      // thread opened again from the Canvas tab.
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Chat", exact: true }).click();
      await expect(nudge).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({ path: testInfo.outputPath("nudge-phone.png") });
      await page.getByRole("button", { name: "Canvas", exact: true }).click();
      await page
        .getByRole("button", { name: "2 Comments on this Entry" })
        .first()
        .click();
      await expect(reply).toBeVisible({ timeout: 10_000 });
      await expectNoSeriousA11yViolations(page);
      await page.screenshot({
        path: testInfo.outputPath("comment-ask-phone.png"),
      });
    } finally {
      await meera.context.close();
    }
  });
});
