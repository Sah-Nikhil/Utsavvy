import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

// S5 smoke test (issue #38): a Member sends a message and two browsers see the
// same streamed reply. The deployment under test answers with the stub model
// (`DEFAULT_MODEL=stub-utsavvy` on its Convex deployment), so no credits are
// spent; STUB_REPLY in convex/assistant/agent.ts is the text it streams.
const STUB_REPLY_FULL = "point at what I changed.";

/** A second test user on the e2e user's domain, made through Clerk's Backend API. */
function memberEmail(): string {
  if (process.env.E2E_CLERK_MEMBER_EMAIL) {
    return process.env.E2E_CLERK_MEMBER_EMAIL;
  }
  const domain = process.env.E2E_CLERK_USER_EMAIL?.split("@")[1];
  if (!domain) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return `e2e-aditi+clerk_test@${domain}`;
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

function chat(page: Page) {
  return page.locator("[data-chat]");
}

test.describe("chat", () => {
  test("a Member's message gets a streamed reply that a second Member sees too", async ({
    page,
    browser,
    signIn,
    cspViolations,
  }, testInfo) => {
    test.setTimeout(150_000);
    const member = memberEmail();
    await ensureClerkUser(process.env.E2E_CLERK_USER_EMAIL!, "Rohan");
    await ensureClerkUser(member, "Aditi");

    // Rohan creates an Event and copies its Member link.
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E chat ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspaceUrl = page.url();
    await page.getByRole("button", { name: "People" }).click();
    const memberLink = page.getByRole("textbox", {
      name: "Member link address",
    });
    await expect(memberLink).toHaveValue(/\/join\/[0-9a-f]{48}$/);
    const joinUrl = await memberLink.inputValue();
    await page.keyboard.press("Escape");

    // Aditi joins in her own browser.
    const aditiContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    });
    const aditi = await aditiContext.newPage();
    await setupClerkTestingToken({ page: aditi });
    await aditi.goto("/");
    await clerk.signIn({ page: aditi, emailAddress: member });
    await aditi.goto(new URL(joinUrl).pathname);
    await expect(aditi).toHaveURL(workspaceUrl, { timeout: 20_000 });
    await expect(chat(aditi).getByText("Plan out loud here")).toBeVisible({
      timeout: 20_000,
    });

    // Rohan asks; both see the reply stream in.
    const composer = chat(page).getByRole("textbox", { name: "Message" });
    await composer.fill("Plan the sangeet");
    await chat(page).getByRole("button", { name: "Send" }).click();
    await expect(composer).toHaveValue("");

    for (const viewer of [page, aditi]) {
      await expect(
        chat(viewer).locator('[data-chat-row="member"]').first(),
      ).toContainText("Plan the sangeet");
    }
    await expect(chat(aditi).locator("[data-replying]")).toContainText(
      /Utsavvy is replying to \S+/,
      { timeout: 20_000 },
    );
    // Aditi reloads mid-reply and picks the same stream up where it is: the
    // reply is partial before the reload and still streaming after it.
    const aditiReply = chat(aditi).locator('[data-chat-row="reply"]').first();
    await expect(aditiReply).toContainText("Namaste", { timeout: 20_000 });
    await expect(aditiReply).toHaveAttribute("data-status", "streaming");
    await expect(aditiReply).not.toContainText(STUB_REPLY_FULL);
    await aditi.reload();
    await expect(
      chat(aditi).locator('[data-chat-row="reply"][data-status="streaming"]'),
    ).toContainText("Namaste", { timeout: 20_000 });
    for (const viewer of [page, aditi]) {
      await expect(
        chat(viewer).locator('[data-chat-row="reply"]').first(),
      ).toContainText(STUB_REPLY_FULL, { timeout: 30_000 });
    }
    // The reply finishes, is announced politely, and the header names the model.
    await expect(chat(page).locator("[data-replying]")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(chat(page).locator("[data-chat-announcer]")).toContainText(
      "Utsavvy replied:",
    );
    await expect(chat(page).locator("[data-chat-model]")).toContainText(
      "stub-utsavvy",
    );

    // A Don't-reply message starts no run, and the toggle resets.
    const dontReply = chat(page).getByRole("switch", { name: "Don't reply" });
    await dontReply.click();
    await expect(dontReply).toBeChecked();
    await composer.fill("Mom says absolutely no DJ");
    await chat(page).getByRole("button", { name: "Send" }).click();
    await expect(dontReply).not.toBeChecked();
    await expect(
      chat(aditi).getByText("Utsavvy read it and stayed quiet."),
    ).toBeVisible({ timeout: 20_000 });
    await expect(chat(page).locator("[data-replying]")).toHaveCount(0);

    await expectNoSeriousA11yViolations(page);
    await aditiContext.close();
    expect(cspViolations).toEqual([]);
  });
});
