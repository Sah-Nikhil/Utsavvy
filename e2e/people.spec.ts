import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

// S1 smoke test (issue #34): create an Event, open its Viewer link as a second
// test user, and see the Viewer in the people list.

/**
 * The second test user: E2E_CLERK_VIEWER_EMAIL, or a `+clerk_test` address on
 * the e2e user's domain. It is created through Clerk's Backend API the first
 * time, so CI needs no extra account set up by hand.
 */
function viewerEmail(): string {
  if (process.env.E2E_CLERK_VIEWER_EMAIL) {
    return process.env.E2E_CLERK_VIEWER_EMAIL;
  }
  const owner = process.env.E2E_CLERK_USER_EMAIL;
  const domain = owner?.split("@")[1];
  if (!domain) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return `e2e-viewer+clerk_test@${domain}`;
}

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
  if (!created.ok) {
    throw new Error(
      `Creating the Clerk test user failed: ${created.status} ${await created.text()}`,
    );
  }
}

async function openPeople(page: Page) {
  await page.getByRole("button", { name: "People" }).click();
  await expect(page.locator('[data-mount="people-panel"]')).toBeVisible();
}

test.describe("people", () => {
  test("a Viewer joins by the Viewer link and shows in the people list", async ({
    page,
    browser,
    signIn,
    cspViolations,
  }, testInfo) => {
    test.setTimeout(120_000);
    const viewer = viewerEmail();
    await ensureClerkUser(process.env.E2E_CLERK_USER_EMAIL!, "Meera");
    await ensureClerkUser(viewer, "Papa");

    // The Owner creates an Event.
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    const name = `E2E wedding ${Date.now()}`;
    await dialog.getByLabel("Event name").fill(name);
    await dialog.getByRole("radio", { name: /Host/ }).check();
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspaceUrl = page.url();

    // The Owner sees both links and copies the Viewer link's address.
    await openPeople(page);
    const viewerLink = page.getByRole("textbox", {
      name: "Viewer link address",
    });
    await expect(viewerLink).toHaveValue(/\/join\/[0-9a-f]{48}$/);
    const joinUrl = await viewerLink.inputValue();
    await expect(page.locator("[data-person]")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Host" })).toContainText(
      "(Host)",
    );

    // A second test user opens the Viewer link in their own browser.
    const viewerContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    });
    const viewerPage = await viewerContext.newPage();
    await setupClerkTestingToken({ page: viewerPage });
    await viewerPage.goto("/");
    await clerk.signIn({ page: viewerPage, emailAddress: viewer });
    await viewerPage.goto(new URL(joinUrl).pathname);
    await expect(viewerPage).toHaveURL(workspaceUrl, { timeout: 20_000 });

    // The Viewer sees the people list but no links or role controls.
    await openPeople(viewerPage);
    await expect(
      viewerPage.getByRole("list", { name: "Viewers" }),
    ).toBeVisible();
    await expect(
      viewerPage.getByRole("heading", { name: "Invite links" }),
    ).toHaveCount(0);
    await expect(
      viewerPage.getByRole("button", { name: /Change .* role/ }),
    ).toHaveCount(0);
    await viewerContext.close();

    // The Owner's list updates live with the Viewer.
    const viewers = page.getByRole("list", { name: "Viewers" });
    await expect(viewers).toBeVisible({ timeout: 20_000 });
    await expect(viewers.locator("[data-person]")).toHaveCount(1);
    await expect(viewers).toContainText("(Viewer)");
    await expectNoSeriousA11yViolations(page);
    expect(cspViolations).toEqual([]);
  });

  test("/terms lists every outside service, with Gemini's free-tier disclosure", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Terms and privacy" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Terms and privacy" }),
    ).toBeVisible();
    for (const service of [
      "Clerk",
      "Convex",
      "Anthropic",
      "Google Gemini",
      "Web research for Estimates",
      "Geoapify",
      "Google Maps",
      "Pinterest and Instagram",
    ]) {
      await expect(page.getByText(service, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByText(/Google may use those prompts and replies to improve/),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
