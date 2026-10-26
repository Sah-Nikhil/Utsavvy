import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * S11 smoke test (issue #44): the Pune Ganesh utsav Brief from
 * docs/design/first-brief.md reaches the Brief summary with the "₹36,000
 * short" flag. The deployment under test answers with the stub model
 * (`DEFAULT_MODEL=stub-utsavvy`), whose canned BriefExtraction for this Brief
 * is the worked example's, and with no Claude key Estimate research is off, so
 * every line is priced from the reference table, as with `stubEstimateDeps`.
 * It creates an Event nothing cleans up, so it never runs against production.
 */

const GANESH =
  "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat.";

function chat(page: Page) {
  return page.locator("[data-chat]");
}

test.describe("the first Brief", () => {
  test.skip(
    process.env.E2E_TARGET === "production",
    "Production never runs the stub model; PR previews run this test.",
  );

  test("the Ganesh utsav reaches the summary with the ₹36,000 flag", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(120_000);
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Ganeshotsav ${Date.now()}`);
    await dialog.getByRole("radio", { name: /Community/ }).click();
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });

    // The opening line, word for word from first-brief.md.
    await expect(
      chat(page)
        .getByRole("list", { name: "Chat messages" })
        .getByText(
          "Tell me about what you're planning: what you're celebrating, where, roughly when, for how many people, and your budget if you have one.",
        ),
    ).toBeVisible({ timeout: 20_000 });
    await chat(page)
      .getByRole("textbox", { name: "Describe what you're planning" })
      .fill(GANESH);
    await chat(page).getByRole("button", { name: "Start planning" }).click();

    // Q3: the festival's dates, proposed for confirming.
    const festival = chat(page).getByRole("button", {
      name: "Yes, 4 to 14 Sep 2027",
    });
    await expect(festival).toBeVisible({ timeout: 30_000 });
    await festival.click();

    // Q4: Guests at the busiest programme, typed with the keyboard.
    const group = chat(page).locator('[data-brief-question="guests"]');
    await expect(group).toBeVisible({ timeout: 30_000 });
    await group.getByRole("button", { name: "Type my own" }).click();
    await group.getByLabel("Type a number").fill("400");
    await page.keyboard.press("Enter");

    // The summary card arrives, says it is checking prices, then shows the flag.
    const summary = chat(page).locator("[data-brief-summary]");
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary.locator("[data-budget-flag]")).toHaveText(
      "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short.",
      { timeout: 60_000 },
    );
    await expect(
      summary.getByRole("button", {
        name: "Raise the budget to about ₹2.76L",
      }),
    ).toBeVisible();
    await expect(
      summary.getByRole("button", { name: "Plan at my budget anyway" }),
    ).toBeVisible();
    await expect(summary.locator("[data-budget-basis]")).toContainText(
      "Based on Utsavvy's reference table for all 14 lines.",
    );
    await expect(
      summary.locator('[data-brief-function="cultural_night"]'),
    ).toContainText("400");

    // X12 (#69): the previewed fixes beside "Raise the budget", worked out
    // from the Budget check's ranges.
    const fixes = summary.locator("[data-budget-fixes]");
    const skip = fixes.getByRole("button", { name: /Skip the cultural night/ });
    await expect(skip).toContainText("New minimum about ₹1.90L, which fits.");
    await expect(
      fixes.getByRole("button", { name: /Plan for 250 Guests instead of 400/ }),
    ).toContainText("still about ₹2,000 short");

    await expectNoSeriousA11yViolations(page);

    // Tapping a fix edits the Brief; the Budget check runs again and the flag goes.
    await skip.click();
    await expect(summary.locator("[data-budget-flag]")).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(
      summary.locator('[data-brief-function="cultural_night"]'),
    ).toHaveCount(0);
    await expect(
      summary.getByRole("button", { name: "Make my plan" }),
    ).toBeVisible();
    expect(cspViolations).toEqual([]);
  });
});
