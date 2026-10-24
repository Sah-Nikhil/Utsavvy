import type { Route } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test } from "./fixtures";

// X2: Pinterest and Instagram References (ADR 0014). The form test serves
// stubbed embed pages, so it never depends on Pinterest or Instagram being up.

const PIN = "https://in.pinterest.com/pin/123456789/";

/** Stands in for `/embed/*`: reports a fixed height, as the real page does. */
async function stubEmbedPages(route: Route) {
  await route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html lang="en"><title>Stub preview</title><body style="margin:0"><div style="height:240px">Stub preview</div><script>parent.postMessage({ type: "utsavvy-embed-height", height: 240 }, "*");</script></body></html>`,
  });
}

test.describe("references", () => {
  test("the embed pages carry their own policy and never index", async ({
    request,
  }) => {
    for (const path of [
      `/embed/pinterest?url=${encodeURIComponent(PIN)}`,
      `/embed/instagram?url=${encodeURIComponent("https://www.instagram.com/p/fA9uwTtkSN/")}`,
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const headers = response.headers();
      expect(headers["content-security-policy"], path).toContain(
        "https://assets.pinterest.com",
      );
      expect(headers["content-security-policy"], path).toContain(
        "frame-ancestors 'self'",
      );
      expect(headers["cache-control"], path).toBe("no-store");
      expect(headers["x-robots-tag"], path).toBe("noindex");
    }
    const pinPath = `/embed/pinterest?url=${encodeURIComponent(PIN)}`;
    const framed = await (
      await request.get(pinPath, { headers: { "sec-fetch-dest": "iframe" } })
    ).text();
    expect(framed).toContain(
      '<a data-pin-do="embedPin" href="https://www.pinterest.com/pin/123456789/"></a>',
    );
    // Opened directly rather than in a card's iframe: only the link.
    const direct = await (
      await request.get(pinPath, { headers: { "sec-fetch-dest": "document" } })
    ).text();
    expect(direct).not.toContain("<a data-pin-do");
    expect(direct).toContain('"script":null');
  });

  test("a pin.it link's embed page shows only the link, with no Pinterest script", async ({
    page,
    cspViolations,
  }) => {
    const platformHosts: string[] = [];
    page.on("request", (request) => {
      const host = new URL(request.url()).hostname;
      if (/(^|\.)(pinterest\.com|pinimg\.com|pin\.it)$/.test(host))
        platformHosts.push(request.url());
    });
    await page.goto(
      `/embed/pinterest?url=${encodeURIComponent("https://pin.it/AbC123")}`,
    );
    await expect(
      page.getByRole("link", { name: "Open on Pinterest" }),
    ).toHaveAttribute("href", "https://pin.it/AbC123");
    expect(platformHosts).toEqual([]);
    expect(cspViolations).toEqual([]);
  });

  test("Paste a link previews the link in the embed iframe, asks what they like and saves", async ({
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
    await page.route("**/embed/**", stubEmbedPages);
    await signIn();

    // An Event of our own, with its Inspirations Section.
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E references ${Date.now()}`);
    await dialog.getByRole("radio", { name: /Host/ }).check();
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });

    await expect(
      page.locator('[data-section-kind="inspirations"] h2 + span'),
    ).toHaveText("0 Items");
    await page.getByRole("button", { name: "Add Inspiration" }).click();
    // Paste a link is its own tab beside S13's Search and Upload.
    await page.getByRole("tab", { name: "Paste a link" }).click();
    const form = page.locator("[data-paste-link]");
    await expect(
      form.getByRole("heading", { name: "Paste a link" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Previews load from Pinterest or Instagram, which receive the usual browser data.",
      ),
    ).toHaveCount(1);

    const link = form.getByLabel("Pinterest or Instagram link");
    await link.fill("https://www.instagram.com/meera/");
    await expect(
      form.getByText(/Paste a Pinterest Pin or board/),
    ).toBeVisible();

    await link.fill(PIN);
    const frame = form.locator('iframe[title="Pinterest preview"]');
    await expect(frame).toHaveAttribute(
      "src",
      `/embed/pinterest?url=${encodeURIComponent("https://www.pinterest.com/pin/123456789/")}`,
    );
    // Sized from the page's height message.
    await expect
      .poll(async () => (await frame.boundingBox())?.height)
      .toBe(240);
    await expect(
      form.getByRole("link", { name: "Open on Pinterest" }),
    ).toHaveAttribute("href", PIN);
    await expect(form.getByText("What do you like in this?")).toBeVisible();
    const colours = form.getByRole("button", { name: "colours" });
    await colours.click();
    await expect(colours).toHaveAttribute("aria-pressed", "true");

    // A different link starts with no chips tapped.
    await link.fill("https://www.instagram.com/p/fA9uwTtkSN/");
    await expect(colours).toHaveAttribute("aria-pressed", "false");

    await link.fill("https://pin.it/AbC123");
    await expect(
      form.getByText(
        "Open it on Pinterest and paste the full Pin link to see a preview.",
      ),
    ).toBeVisible();
    await expect(form.locator("iframe")).toHaveCount(0);

    // No Pinterest or Instagram script runs in the workspace document.
    await expect(
      page.locator('script[src*="pinterest"], script[src*="instagram"]'),
    ).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await link.fill(PIN);
    await colours.click();
    await form.getByLabel("Anything else?").fill("the yellow drapes");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Saved to Inspirations.")).toBeVisible();
    await expect(link).toHaveValue("");
    // The Reference is on the Canvas, in the Inspirations Section, and S13's
    // inspiration card shows its embed through <ReferenceEmbed>.
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-section-kind="inspirations"] h2 + span'),
    ).toHaveText(/^1 Items?$/);
    // The Canvas opens on Money and dates, and a Reference's embed loads only
    // once its card is on screen, so bring the Inspirations Section into view.
    await page.getByRole("button", { name: "Show the whole Canvas" }).click();
    await expect(
      page.locator('[data-section-kind="inspirations"]'),
    ).toBeInViewport();
    await expect(
      page
        .locator('[data-canvas-item="inspiration"]')
        .locator('iframe[title="Pinterest preview"]'),
    ).toHaveAttribute(
      "src",
      `/embed/pinterest?url=${encodeURIComponent("https://www.pinterest.com/pin/123456789/")}`,
    );
    expect(cspViolations).toEqual([]);
  });
});
