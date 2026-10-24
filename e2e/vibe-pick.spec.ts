import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * S18 smoke test (issue #51): Aarav's 6th birthday Brief from
 * docs/design/first-brief.md reaches the Brief summary, where the child
 * birthday set's 12 vibe pick photos show with their Pexels credits. Tapping
 * 3 and "Use these 3" adds them to the Canvas as Inspirations and gives the
 * Theme colours and style words, which the Brief summary shows. The
 * deployment answers with the stub model (`DEFAULT_MODEL=stub-utsavvy`), whose
 * canned BriefExtraction for this Brief is the worked example's. It creates
 * an Event nothing cleans up, so it never runs against production.
 */

const AARAV =
  "Aarav's 6th birthday party in Jaipur on Saturday 12 December, about 35 kids and their parents, budget 1.5 lakh.";

const chat = (page: Page) => page.locator("[data-chat]");

test.describe("the vibe pick", () => {
  test.skip(
    process.env.E2E_TARGET === "production",
    "Production never runs the stub model; PR previews run this test.",
  );

  test("Aarav's birthday picks 3 photos: they become Inspirations and the Theme gets colours and style words", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(150_000);
    const pexels: string[] = [];
    page.on("request", (request) => {
      if (/(^|\.)pexels\.com$/.test(new URL(request.url()).hostname))
        pexels.push(request.url());
    });

    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Aarav ${Date.now()}`);
    await dialog.getByRole("radio", { name: /Birthday/ }).click();
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });

    await chat(page)
      .getByRole("textbox", { name: "Describe what you're planning" })
      .fill(AARAV);
    await chat(page).getByRole("button", { name: "Start planning" }).click();

    const summary = chat(page).locator("[data-brief-summary]");
    await expect(summary).toBeVisible({ timeout: 60_000 });
    const pick = summary.getByRole("region", { name: "Pick a look" });
    await expect(pick).toBeVisible({ timeout: 20_000 });

    // The set's 12 vibe pick photos, from our own origin, each credited.
    const figures = pick.locator("figure");
    await expect(figures).toHaveCount(12);
    await expect(figures.getByRole("button", { pressed: false })).toHaveCount(
      12,
    );
    for (const figure of await figures.all()) {
      await expect(figure.locator("figcaption")).toContainText(
        /^Photo by .+ on Pexels$/,
      );
      await expect(
        figure.getByRole("link", { name: "Pexels" }),
      ).toHaveAttribute("href", /^https:\/\/www\.pexels\.com\/photo\//);
      await expect(figure.locator("img")).toHaveAttribute(
        "src",
        /^\/inspirations\/birthday-child\/\d+\.webp$/,
      );
    }
    await expect(summary.locator('[data-brief-field="theme"]')).toContainText(
      "Not picked yet",
    );
    await expectNoSeriousA11yViolations(page);

    // "Show me more" adds 12 more from the same set.
    await pick.getByRole("button", { name: "Show me more" }).click();
    await expect(figures).toHaveCount(24);

    // Tap 3; a double tap on "Use these 3" still adds each once.
    for (const i of [0, 2, 4]) await figures.nth(i).getByRole("button").click();
    await expect(figures.getByRole("button", { pressed: true })).toHaveCount(3);
    await pick.getByRole("button", { name: "Use these 3" }).dblclick();

    const picked = summary.locator('[data-vibe-pick="picked"]');
    await expect(picked).toContainText(
      "3 photos picked for the look, now in Inspirations.",
      { timeout: 20_000 },
    );
    const theme = summary.locator('[data-brief-field="theme"]');
    await expect(theme).not.toContainText("Not picked yet");

    // The Canvas has the 3 photos as Inspirations, with their credits.
    const cards = page.locator('[data-canvas-item="inspiration"]');
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await expect(cards.first()).toContainText(/Photo by .+ on Pexels/);

    expect(pexels).toEqual([]);
    expect(cspViolations).toEqual([]);
  });
});
