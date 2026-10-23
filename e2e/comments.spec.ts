import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Comments (S8) with two people on one Event, each in their own browser:
 * Meera (the Owner, the e2e user) and Papa, a Viewer who joins by the Viewer
 * link. Papa Comments on the Budget, Meera sees it live and replies, Papa
 * edits and resolves his own Comment, and can't edit Meera's.
 *
 * Meera creates the Event with "New Event" (S1), which nothing cleans up, so
 * this runs on PR previews and locally, never against production.
 */

const PRODUCTION_HOST = "utsavvy.vercel.app";

function isProduction(baseURL: string | undefined): boolean {
  return baseURL ? new URL(baseURL).hostname === PRODUCTION_HOST : false;
}

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

/** The Viewer, a `+clerk_test` address on the e2e user's domain. */
function viewerEmail(): string {
  if (process.env.E2E_COMMENTS_VIEWER_EMAIL)
    return process.env.E2E_COMMENTS_VIEWER_EMAIL;
  return `e2e-papa+clerk_test@${ownerEmail().split("@")[1]}`;
}

/** Makes the Clerk test user the first time, so CI needs no account set up by hand. */
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
  // EnsureUser makes the `users` row on the first signed-in page.
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

const budget = (page: Page) => page.locator('[data-canvas-item="budget"]');
/** The Budget's Comment count, found by its label so it is still found behind an open sheet. */
const commentButton = (page: Page) =>
  budget(page).locator("footer button[aria-label]");
const sheet = (page: Page) => page.getByRole("dialog", { name: "Comments" });

test.describe("comments", () => {
  test.describe.configure({ mode: "serial" });

  let meera: Person;
  let papa: Person;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(
      isProduction(testInfo.project.use.baseURL),
      "Creates an Event, so it runs on PR previews and locally only.",
    );
    testInfo.setTimeout(120_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    await ensureClerkUser(viewerEmail(), "Papa");
    meera = await signedIn(browser, testInfo, ownerEmail());
    papa = await signedIn(browser, testInfo, viewerEmail());

    // Meera creates an Event; Papa joins by its Viewer link.
    const { page } = meera;
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Comments ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspace = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "People" }).click();
    const link = page.getByRole("textbox", { name: "Viewer link address" });
    await expect(link).toHaveValue(/\/join\/[0-9a-f]+$/);
    const join = new URL(await link.inputValue()).pathname;
    await page.keyboard.press("Escape");

    await papa.page.goto(join);
    await expect(papa.page).toHaveURL(new RegExp(`${workspace}$`), {
      timeout: 20_000,
    });
    for (const person of [meera, papa])
      await expect(budget(person.page)).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await meera?.context.close();
    await papa?.context.close();
  });

  test("a Viewer Comments on an Item and the Owner sees the count live", async () => {
    await expect(commentButton(papa.page)).toHaveAttribute(
      "aria-label",
      "Comment",
    );
    await commentButton(papa.page).click();
    const papaSheet = sheet(papa.page);
    await expect(papaSheet).toBeVisible();
    await expect(papaSheet.getByText("No Comments yet")).toBeVisible();
    await expectNoSeriousA11yViolations(papa.page);

    await papaSheet
      .getByRole("textbox", { name: "Add a Comment" })
      .fill("Is this hall big enough for our relatives from Kota?");
    await papaSheet
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await expect(
      papaSheet.getByText(
        "Is this hall big enough for our relatives from Kota?",
      ),
    ).toBeVisible();
    await expect(
      papaSheet.getByRole("article", { name: "Comment by You" }),
    ).toBeVisible();

    await expect(commentButton(meera.page)).toHaveAttribute(
      "aria-label",
      "1 Comment",
      {
        timeout: 5_000,
      },
    );
  });

  test("the Owner replies, and the Viewer sees the reply but can't edit it", async () => {
    await commentButton(meera.page).click();
    const meeraSheet = sheet(meera.page);
    await meeraSheet.getByRole("button", { name: /^Reply to / }).click();
    await meeraSheet
      .getByRole("textbox", { name: /^Reply to / })
      .fill("It seats 300. Let's visit on Sunday.");
    await meeraSheet
      .getByRole("button", { name: "Reply", exact: true })
      .click();
    await expect(
      meeraSheet.getByText("It seats 300.", { exact: false }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(meera.page);

    const papaSheet = sheet(papa.page);
    const reply = papaSheet
      .getByRole("article")
      .filter({ hasText: "It seats 300." });
    await expect(reply).toBeVisible({ timeout: 5_000 });
    await expect(
      reply.getByRole("button", { name: "Edit your Comment" }),
    ).toHaveCount(0);
    await expect(commentButton(meera.page)).toHaveAttribute(
      "aria-label",
      "2 Comments",
    );
  });

  test("the Viewer edits and resolves their own Comment", async () => {
    const papaSheet = sheet(papa.page);
    const mine = papaSheet.getByRole("article", { name: "Comment by You" });
    await mine.getByRole("button", { name: "Edit your Comment" }).click();
    const box = papaSheet.getByRole("textbox", { name: "Edit your Comment" });
    await box.fill("Is this hall big enough for 120 relatives from Kota?");
    await papaSheet.getByRole("button", { name: "Save" }).click();
    await expect(
      sheet(meera.page).getByText("120 relatives from Kota"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(sheet(meera.page).getByText("(edited)")).toBeVisible();

    await papaSheet.getByRole("button", { name: "Resolve" }).click();
    await expect(
      papaSheet.getByText("Every thread here is resolved."),
    ).toBeVisible();
    await expect(
      sheet(meera.page).getByRole("button", { name: "Resolved (1)" }),
    ).toBeVisible({ timeout: 5_000 });
    await meera.page.keyboard.press("Escape");
    await expect(commentButton(meera.page)).toHaveAttribute(
      "aria-label",
      "Comment",
    );
  });
  test("a Comment on an Entry shows its count on that row, for everyone", async () => {
    const checklist = (page: Page) =>
      page.locator('[data-canvas-item="checklist"]');
    await checklist(meera.page)
      .getByRole("textbox", { name: "New Vendor to find" })
      .fill("Caterer for the sangeet");
    await checklist(meera.page)
      .getByRole("button", { name: "Add", exact: true })
      .click();
    const row = (page: Page) =>
      checklist(page)
        .locator("[data-entry-id]")
        .filter({ hasText: "Caterer for the sangeet" });
    await expect(row(papa.page)).toBeVisible({ timeout: 5_000 });

    await row(papa.page)
      .getByRole("button", { name: "Comment on this Entry" })
      .click();
    const papaSheet = sheet(papa.page);
    await expect(
      papaSheet.getByText("On an Entry in the Vendor checklist"),
    ).toBeVisible();
    await papaSheet
      .getByRole("textbox", { name: "Comment on this Entry" })
      .fill("Do they do Rajasthani thali?");
    await papaSheet
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await expect(
      papaSheet.getByText("Do they do Rajasthani thali?"),
    ).toBeVisible();

    await expect(
      row(meera.page).locator('[data-entry-comments="1"]'),
    ).toHaveAttribute("aria-label", "1 Comment on this Entry", {
      timeout: 5_000,
    });
  });
});
