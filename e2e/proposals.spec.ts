import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Proposals (S10) with three people on one Event, each in their own browser:
 * Meera (the Owner, the e2e user) asks for a risky change, Papa (a Viewer)
 * sees the Proposal card live without buttons, and Aditi (a Member) accepts
 * it. The history then shows "Utsavvy for Meera, accepted by Aditi".
 *
 * The stub model never calls a tool, so Meera's request and the Assistant's
 * `propose` call are seeded through `proposals:riskyRequestForLocalCheck`,
 * which runs the real `propose` mutation. It needs a local Convex
 * deployment: set E2E_PROPOSALS_LOCAL=1 against `bun run dev`.
 */

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}
const domain = () => ownerEmail().split("@")[1];
const memberEmail = () => `e2e-aditi+clerk_test@${domain()}`;
const viewerEmail = () => `e2e-papa+clerk_test@${domain()}`;

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
  return (out.trim() === "" ? null : JSON.parse(out.trim())) as T;
}

type Person = { context: BrowserContext; page: Page };

async function signedIn(
  browser: Browser,
  testInfo: TestInfo,
  email: string,
  viewport?: { width: number; height: number },
): Promise<Person> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    ...(viewport ? { viewport } : {}),
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

const proposalCard = (page: Page) => page.locator("[data-proposal]").first();

test.describe("proposals, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_PROPOSALS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_PROPOSALS_LOCAL=1",
  );

  test("a Viewer sees the Proposal without buttons, another Member accepts it, and history says who", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    await ensureClerkUser(memberEmail(), "Aditi");
    await ensureClerkUser(viewerEmail(), "Papa");
    const meera = await signedIn(browser, testInfo, ownerEmail());
    const aditi = await signedIn(browser, testInfo, memberEmail());
    const papa = await signedIn(browser, testInfo, viewerEmail(), {
      width: 390,
      height: 844,
    });

    // Meera creates an Event; Aditi joins as a Member, Papa as a Viewer.
    const { page } = meera;
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Proposals ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspace = new URL(page.url()).pathname;
    const eventId = workspace.split("/").at(-1)!;
    await page.getByRole("button", { name: "People" }).click();
    const links: Record<string, string> = {};
    for (const role of ["Member", "Viewer"]) {
      const box = page.getByRole("textbox", { name: `${role} link address` });
      await expect(box).toHaveValue(/\/join\/[0-9a-f]+$/);
      links[role] = new URL(await box.inputValue()).pathname;
    }
    await page.keyboard.press("Escape");
    await aditi.page.goto(links.Member!);
    await papa.page.goto(links.Viewer!);
    for (const person of [aditi, papa])
      await expect(person.page).toHaveURL(new RegExp(`${workspace}$`), {
        timeout: 20_000,
      });

    // Meera's risky request arrives as one Proposal.
    convexRun("proposals:riskyRequestForLocalCheck", {
      eventId,
      email: ownerEmail(),
    });

    // Papa, on a phone, sees the card live in the Chat, without buttons.
    const papaCard = proposalCard(papa.page);
    await expect(papaCard).toBeVisible({ timeout: 20_000 });
    await expect(papaCard.locator("[data-proposal-line]")).toHaveText([
      "Decor ₹3,00,000 to ₹2,20,000",
      'Delete "Drone shoot" (₹60,000)',
      "Contingency ₹1,00,000 to ₹1,80,000",
    ]);
    await expect(papaCard.getByRole("button")).toHaveCount(0);
    await testInfo.attach("viewer-mobile-open", {
      body: await papa.page.screenshot(),
      contentType: "image/png",
    });

    // Aditi accepts it; everyone sees it closed, greyed, with the reason.
    const aditiCard = proposalCard(aditi.page);
    await expect(aditiCard).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousA11yViolations(aditi.page);
    await testInfo.attach("member-open", {
      body: await aditi.page.screenshot(),
      contentType: "image/png",
    });
    await aditiCard.getByRole("button", { name: "Accept" }).click();
    for (const person of [meera, aditi, papa]) {
      await expect(
        proposalCard(person.page).locator("[data-proposal-reason]"),
      ).toHaveText(/^Accepted by Aditi/, { timeout: 10_000 });
    }
    await expect(papaCard).toHaveAttribute("data-proposal-status", "accepted");
    await expectNoSeriousA11yViolations(papa.page);
    await testInfo.attach("viewer-mobile-accepted", {
      body: await papa.page.screenshot(),
      contentType: "image/png",
    });

    // The history groups the three changes under who asked and who accepted.
    // The Owner is the shared e2e user, whose Clerk name isn't always Meera.
    await page.getByRole("button", { name: "History" }).click();
    const panel = page.getByRole("dialog", { name: "Edit history" });
    await expect(
      panel.getByText(
        /^Utsavvy for [^,]+, accepted by Aditi( E2E)? \(3 changes\)$/,
      ),
    ).toBeVisible({ timeout: 10_000 });
    await testInfo.attach("history", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Collision: a second risky request, then Meera edits Decor herself. The
    // card turns out of date at once and offers Ask again.
    await page.keyboard.press("Escape");
    const second = convexRun<{ proposalId: string; decorId: string }>(
      "proposals:riskyRequestForLocalCheck",
      { eventId, email: ownerEmail() },
    );
    const secondCard = aditi.page.locator(
      `[data-proposal="${second.proposalId}"]`,
    );
    await expect(secondCard).toHaveAttribute("data-proposal-status", "open", {
      timeout: 20_000,
    });
    convexRun("proposals:memberEditForLocalCheck", {
      entryId: second.decorId,
      email: ownerEmail(),
      amount: 250_000,
    });
    await expect(secondCard.locator("[data-proposal-reason]")).toHaveText(
      /^Out of date: (?!Aditi|Papa).+ changed this since$/,
      { timeout: 10_000 },
    );
    await expect(
      secondCard.getByRole("button", { name: "Accept" }),
    ).toHaveCount(0);
    await secondCard.scrollIntoViewIfNeeded();
    await expectNoSeriousA11yViolations(aditi.page);
    await testInfo.attach("member-out-of-date", {
      body: await aditi.page.screenshot(),
      contentType: "image/png",
    });
    await secondCard.getByRole("button", { name: "Ask again" }).click();
    await expect(secondCard).toContainText(
      "Asked again. Utsavvy will propose from the current Canvas.",
    );
    await expect(
      aditi.page.getByText(/^Ask again: Cut decor to ₹2,20,000/).first(),
    ).toBeVisible({ timeout: 10_000 });

    for (const person of [meera, aditi, papa]) await person.context.close();
  });
});
