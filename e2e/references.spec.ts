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
    const pinterest = await (
      await request.get(`/embed/pinterest?url=${encodeURIComponent(PIN)}`)
    ).text();
    expect(pinterest).toContain(
      '<a data-pin-do="embedPin" href="https://www.pinterest.com/pin/123456789/"></a>',
    );
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

  test("Paste a link previews the link in the embed iframe and asks what they like", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    await page.route("**/embed/**", stubEmbedPages);
    await signIn();
    await page.goto("/events/smoke-test-event");
    await page.getByRole("button", { name: "Add Inspiration" }).click();

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
    await form.getByRole("button", { name: "colours" }).click();
    await expect(form.getByRole("button", { name: "colours" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(form.getByRole("button", { name: "Save" })).toBeEnabled();

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
    expect(cspViolations).toEqual([]);
  });
});
