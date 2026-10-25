import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * S14 (issue #47): each of the three first Briefs in
 * docs/design/first-brief.md goes from the Member's words to "Make my plan",
 * and the plan fills the Canvas while the Chat's progress card ticks. The
 * deployment under test answers with the stub model (`DEFAULT_MODEL=stub-utsavvy`),
 * whose canned drafts are the worked examples', and with no Claude key every
 * line is priced from the reference table, so the totals are the worked
 * examples' exactly. It creates Events nothing cleans up, so it never runs
 * against production.
 */

const JAIPUR =
  "My sister's wedding in Jaipur in February 2027, around 300 people, budget 25 lakh.";
const AARAV =
  "Aarav's 6th birthday party in Jaipur on Saturday 12 December, about 35 kids and their parents, budget 1.5 lakh.";
const GANESH =
  "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat.";

function chat(page: Page) {
  return page.locator("[data-chat]");
}

async function newEvent(
  page: Page,
  kind: RegExp,
  name: string,
  brief: string,
): Promise<void> {
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog", { name: "New Event" });
  await dialog.getByLabel("Event name").fill(`${name} ${Date.now()}`);
  await dialog.getByRole("radio", { name: kind }).click();
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await chat(page)
    .getByRole("textbox", { name: "Describe what you're planning" })
    .fill(brief);
  await chat(page).getByRole("button", { name: "Start planning" }).click();
}

/** Taps a plan button on the summary and waits for the plan to land. */
async function makePlan(page: Page, button: string): Promise<void> {
  const summary = chat(page).locator("[data-brief-summary]");
  await expect(summary.locator("[data-budget-basis]")).toBeVisible({
    timeout: 60_000,
  });
  await summary.getByRole("button", { name: button }).click();
  const progress = chat(page).locator("[data-plan-progress]");
  await expect(progress).toBeVisible({ timeout: 20_000 });
  await expect(progress.locator("[data-plan-progress-line]")).toHaveText(
    "Your first plan is on the Canvas.",
    { timeout: 90_000 },
  );
  await expect(progress).toHaveAttribute("data-plan-progress", "done");
  // The plan buttons are gone: a second tap can't start another plan.
  await expect(summary.getByRole("button", { name: button })).toHaveCount(0);
}

test.describe("the first plan", () => {
  test.skip(
    process.env.E2E_TARGET === "production",
    "Production never runs the stub model; PR previews run this test.",
  );

  test("the Jaipur wedding: five Functions, 14 Vendors to find, late bookings this week", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(240_000);
    await signIn();
    await newEvent(page, /Wedding/, "E2E Jaipur wedding", JAIPUR);
    const tradition = chat(page).locator('[data-brief-question="tradition"]');
    await expect(tradition).toBeVisible({ timeout: 30_000 });
    await tradition.getByRole("button", { name: "North Indian Hindu" }).click();
    const functions = chat(page).locator('[data-brief-question="functions"]');
    await expect(functions).toBeVisible({ timeout: 30_000 });
    await functions.getByRole("button", { name: "Plan these 5" }).click();
    await makePlan(page, "Make my plan");

    await expect(page.getByText("14 to find")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('section[aria-label="Run sheet, Wedding"]'),
    ).toContainText("Vidaai");
    await expect(page.getByText("Book Venues").first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // After the plan, 300 to 400 Guests arrives as one Proposal; nothing
    // changes on the Brief until a Member accepts it.
    const summary = chat(page).locator("[data-brief-summary]");
    await summary
      .locator('[data-brief-field="guests"]')
      .getByRole("button")
      .click();
    await summary.getByLabel("Guests", { exact: true }).fill("400");
    await page.keyboard.press("Enter");
    await expect(chat(page).locator("[data-proposal]")).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(
      chat(page)
        .getByRole("list", { name: "Chat messages" })
        .getByText(/300 to 400 Guests: .*Venue capacity to recheck/),
    ).toBeVisible();
    await expect(summary.locator('[data-brief-field="guests"]')).toContainText(
      "300",
    );
    expect(cspViolations).toEqual([]);
  });

  test("Aarav's birthday: one Function, comfortably within ₹1.5L", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(180_000);
    await signIn();
    await newEvent(page, /Birthday/, "E2E Aarav's birthday", AARAV);
    await makePlan(page, "Make my plan");

    await expect(
      page.locator('section[aria-label="Run sheet, Party"]'),
    ).toContainText("Cake-cutting", { timeout: 20_000 });
    await expect(page.getByText("6 to find")).toBeVisible();
    expect(cspViolations).toEqual([]);
  });

  test("the Ganesh utsav at its budget anyway: daily aarti over its range, ₹1,000 per household", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(180_000);
    await signIn();
    await newEvent(page, /Community/, "E2E Ganeshotsav plan", GANESH);
    const festival = chat(page).getByRole("button", {
      name: "Yes, 4 to 14 Sep 2027",
    });
    await expect(festival).toBeVisible({ timeout: 30_000 });
    await festival.click();
    const group = chat(page).locator('[data-brief-question="guests"]');
    await expect(group).toBeVisible({ timeout: 30_000 });
    await group.getByRole("button", { name: "Type my own" }).click();
    await group.getByLabel("Type a number").fill("400");
    await page.keyboard.press("Enter");
    await makePlan(page, "Plan at my budget anyway");

    // Daily aarti is one Function with a date range, not ten.
    const aarti = page.locator('section[aria-label^="Run sheet, Daily aarti"]');
    await expect(aarti).toHaveCount(1, { timeout: 20_000 });
    await expect(aarti).toContainText("4 Sep to 13 Sep");
    const share = page.locator("dt", { hasText: "Per household" });
    await expect(share).toBeVisible();
    await expect(share.locator("xpath=following-sibling::dd[1]")).toHaveText(
      "₹1,000",
    );
    expect(cspViolations).toEqual([]);
  });
});
