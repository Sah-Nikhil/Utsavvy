import { readFileSync } from "node:fs";
import type { Route } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test } from "./fixtures";

// S21: Browse ideas on Pinterest (ADR 0014). The embed page is stubbed, so the
// test never depends on Pinterest being up; the deployed check covers the real
// widget.

type SeedBoard = {
  key: string;
  label: string;
  url: string;
  eventTypes: string[];
};
const seed = JSON.parse(
  readFileSync(
    new URL("../seed/pinterest-boards.json", import.meta.url),
    "utf8",
  ),
) as SeedBoard[];
const weddingBoards = seed.filter((board) =>
  board.eventTypes.includes("wedding"),
);

/** The sheet's board frame: the board's link and a scroll height for the screen. */
function boardSrc(url: string) {
  // encodeURIComponent leaves only letters, digits, %, and - _ . ! ~ * ' ( ).
  const escaped = encodeURIComponent(url).replace(/[.*()]/g, "\\$&");
  return new RegExp(`^/embed/pinterest\\?url=${escaped}&height=\\d+$`);
}

/** Stands in for `/embed/pinterest`: reports a fixed height, as the real page does. */
async function stubEmbedPage(route: Route) {
  await route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html lang="en"><title>Stub board</title><body style="margin:0"><div style="height:300px">Stub board</div><script>parent.postMessage({ type: "utsavvy-embed-height", height: 300 }, "*");</script></body></html>`,
  });
}

test.describe("pinterest ideas", () => {
  test("Browse ideas on Pinterest lists the Event's boards, shows one and offers Paste a link", async ({
    page,
    signIn,
    cspViolations,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    test.skip(
      baseURL !== undefined &&
        new URL(baseURL).hostname === "utsavvy.vercel.app",
      "Creates an Event, so it runs on PR previews and locally only.",
    );
    test.setTimeout(120_000);
    await page.route("**/embed/**", stubEmbedPage);
    await signIn();

    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Pinterest ${Date.now()}`);
    await dialog.getByRole("radio", { name: /Wedding/ }).check();
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });

    async function openSheet(from: "panel" | "section") {
      if (from === "panel") {
        await page.getByRole("button", { name: "Add Inspiration" }).click();
        await page
          .getByRole("dialog", { name: "Add Inspiration" })
          .getByRole("button", { name: "Browse ideas on Pinterest" })
          .click();
      } else {
        await page
          .locator('[data-section-kind="inspirations"]')
          .getByRole("button", { name: "Browse ideas on Pinterest" })
          .click();
      }
      const sheet = page.getByRole("dialog", {
        name: "Browse ideas on Pinterest",
      });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText("Loading boards…")).toHaveCount(0, {
        timeout: 20_000,
      });
      return sheet;
    }

    let sheet = await openSheet("panel");
    if (weddingBoards.length === 0) {
      // Until Utsavvy's boards are in the seed, every Event has none.
      await expect(
        sheet.getByText("No Pinterest boards for this kind of Event yet."),
      ).toBeVisible();
      await expect(
        sheet.getByRole("heading", { name: "Paste a link" }),
      ).toBeVisible();
    } else {
      const boards = sheet.getByRole("navigation", {
        name: "Pinterest boards",
      });
      const first = weddingBoards[0]!;
      await expect(boards.getByRole("button")).toHaveCount(
        weddingBoards.length,
      );
      await expect(
        boards.getByRole("button", { name: first.label }),
      ).toHaveAttribute("aria-pressed", "true");

      const panel = sheet.locator(`[data-pinterest-board="${first.key}"]`);
      await expect(
        panel.getByRole("heading", { name: first.label }),
      ).toBeVisible();
      await expect(
        panel.getByRole("link", { name: "Open board on Pinterest" }),
      ).toHaveAttribute("href", first.url);
      await expect(panel.locator("iframe")).toHaveAttribute(
        "src",
        boardSrc(first.url),
      );
      await expect(
        panel.getByText(
          "This board loads from Pinterest, which receives the usual browser data.",
        ),
      ).toBeVisible();
      await expect(
        panel.getByText(
          "Found one you like? Tap it to open it on Pinterest, copy its link and paste it here.",
        ),
      ).toBeVisible();
      await expect(
        panel.getByRole("heading", { name: "Paste a link" }),
      ).toBeVisible();
      await expect(
        page
          .frameLocator(`[data-pinterest-board="${first.key}"] iframe`)
          .getByText("Stub board"),
      ).toBeVisible();

      await expectNoSeriousA11yViolations(page, { exclude: ["iframe"] });

      const second = weddingBoards[1];
      if (second !== undefined) {
        await boards.getByRole("button", { name: second.label }).click();
        await expect(
          sheet.locator(`[data-pinterest-board="${second.key}"] iframe`),
        ).toHaveAttribute("src", boardSrc(second.url));
      }
    }
    await expectNoSeriousA11yViolations(page, { exclude: ["iframe"] });

    // Closing and opening again, after going back to the Events list, works.
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    const workspace = page.url();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.goto(workspace);
    // This time from the Inspirations Section header on the Canvas.
    sheet = await openSheet("section");
    if (weddingBoards.length > 0)
      await expect(
        sheet.getByRole("button", { name: weddingBoards[0]!.label }),
      ).toHaveAttribute("aria-pressed", "true");
    else
      await expect(
        sheet.getByText("No Pinterest boards for this kind of Event yet."),
      ).toBeVisible();

    expect(cspViolations).toEqual([]);
  });
});
