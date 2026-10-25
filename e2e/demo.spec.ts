import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test } from "./fixtures";
import { convexLocal } from "./local-convex";

/**
 * The demo Event (S19a). The e2e user plays judge-member: the spec points
 * `DEMO_JUDGE_MEMBER_ID` at the e2e user's Clerk ID, runs `demo:reset`, and
 * opens the demo Event from "Open the demo Event". The banner shows there and
 * on no other Event.
 *
 * It changes a Convex deployment's settings and data, so it runs only against
 * a local deployment: set E2E_DEMO_LOCAL=1 with `bun run dev` on a local
 * backend. `convexLocal` refuses any other deployment.
 */

function email(): string {
  const value = process.env.E2E_CLERK_USER_EMAIL;
  if (!value) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return value;
}

/** The e2e user's Clerk ID, making the user the first time. */
async function clerkUserId(address: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Set CLERK_SECRET_KEY to find the test user.");
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
  const found = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(address)}`,
    { headers },
  );
  if (!found.ok) throw new Error(`Clerk user lookup failed: ${found.status}`);
  const users = (await found.json()) as { id: string }[];
  if (users[0]) return users[0].id;
  const created = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [address],
      first_name: "Judge",
      last_name: "E2E",
      skip_password_requirement: true,
    }),
  });
  if (!created.ok)
    throw new Error(`Creating the Clerk test user failed: ${created.status}`);
  return ((await created.json()) as { id: string }).id;
}

test.describe("The demo Event, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_DEMO_LOCAL !== "1",
    "Resets the demo Event on a local Convex deployment; set E2E_DEMO_LOCAL=1",
  );

  test("judge-member finds Meera weds Rohan with its banner, and no other Event has one", async ({
    page,
    signIn,
  }, testInfo) => {
    test.setTimeout(180_000);
    const judge = await clerkUserId(email());
    convexLocal(["env", "set", "DEMO_JUDGE_MEMBER_ID", judge]);
    convexLocal(["run", "demo:reset", "{}"]);

    await signIn();
    await page.goto("/events?open=demo");
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });

    const banner = page.locator("[data-demo-banner]");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveText(
      "Demo Event: the people, Quotes and Comments here are made up. Vendor facts come from each Vendor's own website, or for a few, its public Instagram profile, checked by hand.",
    );
    await expect(
      page.getByRole("heading", { name: "Meera weds Rohan" }),
    ).toBeVisible();
    // The seeded plan and Chat are there.
    const budget = page.locator('[data-canvas-item="budget"]');
    await expect(budget).toContainText("Estimates sit near the low end", {
      timeout: 20_000,
    });
    await expect(page.getByText(/^Plan the sangeet properly/)).toBeVisible();
    // A plain seeded reply has no annotation and still shows as Utsavvy's reply.
    await expect(
      page
        .locator('[data-chat-row="reply"]')
        .filter({ hasText: "I reworked the sangeet's run sheet" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("demo-desktop.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(banner).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("demo-phone.png") });

    // Any other Event: no banner.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/events");
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog
      .getByLabel("Event name")
      .fill(`E2E not the demo ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    await expect(page.locator('[data-canvas-item="budget"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-demo-banner]")).toHaveCount(0);
  });
});
