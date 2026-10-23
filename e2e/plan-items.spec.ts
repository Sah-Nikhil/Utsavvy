import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The Budget, Timeline and Vendor checklist Items, Notes and Suggestions (S4)
 * with two people on one Event: Meera (the Owner, the e2e user) and Rohan (a
 * Member), each in their own browser.
 *
 * The first group runs on PR previews and locally: Meera creates an Event
 * with "New Event", so its Budget, Timeline and Vendor checklist start empty,
 * and both people add and edit Entries live. It creates an Event nothing
 * cleans up, so it never runs against production.
 *
 * The second group needs Estimates, Assumptions, late deadlines, run sheets
 * and a Suggestion that only the first plan (S14) will write, so it seeds them
 * on a local Convex deployment: it runs only with E2E_CANVAS_LOCAL=1 against
 * `bun run dev`.
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

/** The second test user, a `+clerk_test` address on the e2e user's domain. */
function memberEmail(): string {
  if (process.env.E2E_CANVAS_MEMBER_EMAIL)
    return process.env.E2E_CANVAS_MEMBER_EMAIL;
  return `e2e-rohan+clerk_test@${ownerEmail().split("@")[1]}`;
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
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

const waitForCanvas = (page: Page) =>
  expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });

const item = (page: Page, kind: string) =>
  page.locator(`[data-canvas-item="${kind}"]`);

// ---------------------------------------------------------------------------

test.describe("plan items", () => {
  test.describe.configure({ mode: "serial" });

  let meera: Person;
  let rohan: Person;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(
      isProduction(testInfo.project.use.baseURL),
      "Creates an Event, so it runs on PR previews and locally only.",
    );
    testInfo.setTimeout(120_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    await ensureClerkUser(memberEmail(), "Rohan");
    meera = await signedIn(browser, testInfo, ownerEmail());
    rohan = await signedIn(browser, testInfo, memberEmail());

    const { page } = meera;
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Plan ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspace = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "People" }).click();
    const link = page.getByRole("textbox", { name: "Member link address" });
    await expect(link).toHaveValue(/\/join\/[0-9a-f]+$/);
    const join = new URL(await link.inputValue()).pathname;
    await page.keyboard.press("Escape");

    await rohan.page.goto(join);
    await expect(rohan.page).toHaveURL(new RegExp(`${workspace}$`), {
      timeout: 20_000,
    });
    await waitForCanvas(page);
    await waitForCanvas(rohan.page);
  });

  test.afterAll(async () => {
    await meera?.context.close();
    await rohan?.context.close();
  });

  test("an empty plan says how to start and passes axe", async () => {
    const { page } = meera;
    await expect(item(page, "budget")).toContainText("No lines yet");
    await expect(item(page, "timeline")).toContainText("No deadlines yet");
    await expect(item(page, "checklist")).toContainText(
      "No Vendors on the checklist yet",
    );
    await expectNoSeriousA11yViolations(page);
  });

  test("a budget line one person adds and the other edits shows live for both", async () => {
    const budget = item(meera.page, "budget");
    await budget.getByRole("textbox", { name: "New line" }).fill("Favours");
    await budget
      .getByRole("textbox", { name: "Amount in rupees" })
      .fill("18000");
    await budget.getByRole("button", { name: "Add line" }).click();

    const theirs = item(rohan.page, "budget");
    await expect(
      theirs.getByRole("button", { name: "Favours", exact: true }),
    ).toBeVisible({
      timeout: 5_000,
    });
    await expect(theirs).toContainText("₹18,000");
    await expect(theirs).toContainText("No Estimate yet");
    // A Member's own amount is labelled even with no Estimate beside it.
    await expect(theirs.getByText("Your amount")).toBeVisible();

    await theirs.getByTitle("Change the amount for Favours").click();
    const amount = theirs.getByRole("textbox", { name: "Amount for Favours" });
    await amount.fill("2,40,000");
    await amount.press("Enter");
    await expect(budget).toContainText("₹2,40,000", { timeout: 5_000 });
  });

  test("a Timeline deadline ticked done in one browser is done in the other", async () => {
    const timeline = item(meera.page, "timeline");
    await timeline
      .getByRole("textbox", { name: "New Timeline Entry" })
      .fill("Book the DJ");
    await timeline.getByLabel("Date").fill("2026-12-01");
    await timeline.getByRole("button", { name: "Add", exact: true }).click();

    const theirs = item(rohan.page, "timeline");
    await expect(theirs.getByText("Book the DJ")).toBeVisible({
      timeout: 5_000,
    });
    await expect(theirs).toContainText("By 1 Dec 2026");
    await theirs.getByRole("checkbox", { name: "Done: Book the DJ" }).check();
    await expect(
      timeline.getByRole("checkbox", { name: "Done: Book the DJ" }),
    ).toBeChecked({ timeout: 5_000 });
  });

  test("a Vendor added to the checklist is To find until a Vendor is linked", async () => {
    const checklist = item(meera.page, "checklist");
    await checklist
      .getByRole("textbox", { name: "New Vendor to find" })
      .fill("Safa tying");
    await checklist.getByRole("button", { name: "Add", exact: true }).click();
    const theirs = item(rohan.page, "checklist");
    await expect(theirs.getByText("Safa tying")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      theirs.locator('[data-slot="badge"]', { hasText: "To find" }),
    ).toHaveCount(1);
    await expectNoSeriousA11yViolations(rohan.page);
  });
});

// ---------------------------------------------------------------------------

function convexRun(fn: string, args: Record<string, unknown>): string {
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
  return out.trim() === "" ? "" : (JSON.parse(out.trim()) as string);
}

test.describe("plan items, seeded on a local deployment", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    process.env.E2E_CANVAS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_CANVAS_LOCAL=1",
  );

  let meera: Person;
  let rohan: Person;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    await ensureClerkUser(memberEmail(), "Rohan");
    meera = await signedIn(browser, testInfo, ownerEmail());
    rohan = await signedIn(browser, testInfo, memberEmail());
    const eventId = convexRun("canvas:seedLocalCheck", {
      email: ownerEmail(),
      memberEmails: [memberEmail()],
      items: 7,
    });
    convexRun("entries:seedPlanForLocalCheck", { eventId });
    for (const { page } of [meera, rohan]) {
      await page.goto(`/events/${eventId}`);
      await waitForCanvas(page);
    }
  });

  test.afterAll(async () => {
    await meera?.context.close();
    await rohan?.context.close();
  });

  test("every price wears its labelled badge and basis, in lakh grouping", async () => {
    const budget = item(meera.page, "budget");
    await expect(budget.locator('[data-kind="estimate"]').first()).toHaveText(
      "Estimate",
    );
    await expect(
      budget.getByRole("button", {
        name: "Utsavvy reference table, Y tier, Oct 2026",
      }),
    ).not.toHaveCount(0);
    await expect(budget).toContainText("₹2,45,000");
    await expect(budget).toContainText("No Estimate yet");
    // The Budget check's note.
    await expect(budget).toContainText("Tight");
    await expect(budget).toContainText(
      "₹12L is below the typical ₹15.5L for this plan",
    );

    // The researched Suggestion's basis opens to its sources.
    const suggestion = item(meera.page, "suggestion");
    const basis = suggestion.getByRole("button", {
      name: "Researched 22 Oct 2026 · 3 sources",
    });
    await basis.click();
    await expect(basis).toHaveAttribute("aria-expanded", "true");
    await expect(
      suggestion.getByRole("link", { name: /example\.org/ }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(meera.page);
  });

  test("an assumed quantity is confirmed in one tap, for everyone", async () => {
    const budget = item(meera.page, "budget");
    const theirs = item(rohan.page, "budget");
    await expect(
      theirs.getByRole("button", { name: "Confirm 60 plates" }),
    ).toBeVisible();
    await budget.getByRole("button", { name: "Confirm 60 plates" }).click();
    await expect(
      theirs.getByRole("button", { name: "Confirm 60 plates" }),
    ).toHaveCount(0, { timeout: 5_000 });
  });

  test("late deadlines show late and their note; run sheets are grouped per Function with times", async () => {
    const timeline = item(meera.page, "timeline");
    const venues = timeline.locator("li", { hasText: "Book Venues" });
    await expect(venues).toContainText("late");
    await expect(venues).toContainText("call these first");
    const sangeet = timeline.getByRole("region", {
      name: "Run sheet, Sangeet",
    });
    await expect(sangeet.locator("li").first()).toContainText("7:00 pm");
    await expect(sangeet.locator("li").nth(1)).toContainText("7:30 pm");
    const wedding = timeline.getByRole("region", {
      name: "Run sheet, Wedding",
    });
    await expect(wedding.locator("li").last()).toContainText("1:00 am");
    await expect(
      timeline.getByRole("button", { name: /^Confirm 7:00 pm/ }),
    ).toBeVisible();

    const checklist = item(meera.page, "checklist");
    await expect(checklist).toContainText("book by 30 Oct 2026");
    await expect(
      checklist.locator('[data-slot="badge"]', { hasText: "To find" }),
    ).toHaveCount(3);
  });

  test("Add to plan turns the Suggestion into a budget line and a Timeline Entry", async () => {
    const suggestion = item(meera.page, "suggestion");
    await suggestion.getByRole("button", { name: "Add to plan" }).click();
    await expect(suggestion).toContainText("In the plan");
    await expect(
      item(rohan.page, "budget").getByText(
        "Rajasthani folk musicians at the sangeet dinner",
      ),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      item(rohan.page, "timeline").getByText(
        "Rajasthani folk musicians at the sangeet dinner",
      ),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(rohan.page);
  });

  test("a Note edited in one browser changes in the other", async () => {
    const note = item(meera.page, "note").first();
    await note.getByRole("button", { name: "Edit" }).click();
    await note
      .getByRole("textbox", { name: "Note text" })
      .fill("Ask about parking for 80 cars");
    await note.getByRole("button", { name: "Save" }).click();
    await expect(
      item(rohan.page, "note").getByText("Ask about parking for 80 cars"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
