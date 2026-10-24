import { execFileSync } from "node:child_process";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Inspirations (S13): the stock library, uploads and "Use for Theme", as one
 * Member sees them. The first group creates its own Event with "New Event"
 * (upload rights off, so a batch asks for the tick), so it runs on PR
 * previews and locally, never against production.
 *
 * The Chat's stock photo strip needs a reply that called `searchStockImages`,
 * which the stub model never does, so the second group seeds it through
 * `assistant/tools/images:stripForLocalCheck` on a local Convex deployment:
 * set E2E_INSPIRATIONS_LOCAL=1 against `bun run dev`.
 */

const PRODUCTION_HOST = "utsavvy.vercel.app";
const isProduction = (baseURL: string | undefined) =>
  baseURL ? new URL(baseURL).hostname === PRODUCTION_HOST : false;

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

function convexRun<T>(fn: string, args: Record<string, unknown>): T {
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
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
  return JSON.parse(out.trim()) as T;
}

/** Signs in, makes a fresh Event and waits for its Canvas. */
async function newEvent(page: Page, signIn: () => Promise<void>, name: string) {
  await signIn();
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "New Event" }).click();
  const dialog = page.getByRole("dialog", { name: "New Event" });
  await dialog.getByLabel("Event name").fill(`${name} ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create Event" }).click();
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Every request the page makes to Pexels: there must be none (ADR 0012). */
function watchPexels(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    if (/(^|\.)pexels\.com$/.test(new URL(request.url()).hostname))
      hits.push(request.url());
  });
  return hits;
}

const inspirations = (page: Page) =>
  page.locator('[data-canvas-item="inspiration"]');

test.describe("inspirations", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      isProduction(testInfo.project.use.baseURL),
      "Creates an Event, so it runs on PR previews and locally only.",
    );
  });

  test("Search shows the Event's own set, a search adds a credited photo from our own origin, and Use for Theme updates the Theme", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(120_000);
    const pexels = watchPexels(page);
    await newEvent(page, signIn, "E2E Inspirations");

    await page.getByRole("button", { name: "Add Inspiration" }).click();
    const panel = page.getByRole("dialog", { name: "Add Inspiration" });
    await expect(panel.getByRole("tab", { name: "Search" })).toBeVisible();
    await expect(panel.getByRole("tab", { name: "Upload" })).toBeVisible();
    await expect(
      panel.getByRole("tab", { name: "Paste a link" }),
    ).toBeVisible();

    // An empty Search shows the Event's own set, served from /inspirations/.
    const photos = panel.locator("figure img");
    await expect(photos.first()).toBeVisible({ timeout: 20_000 });
    expect(await photos.count()).toBeGreaterThan(6);
    for (const src of await photos.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).getAttribute("src") ?? ""),
    ))
      expect(src).toMatch(/^\/inspirations\/[a-z-]+\/\d+\.webp$/);
    await expectNoSeriousA11yViolations(page);

    await panel
      .getByRole("searchbox", { name: "Search the stock library" })
      .fill("haldi");
    await expect(
      panel.getByText("6 photos from the stock library"),
    ).toBeVisible({
      timeout: 10_000,
    });
    await panel
      .getByRole("button", { name: /^Add: / })
      .first()
      .click();
    await expect(panel.getByRole("button", { name: /^Added: / })).toHaveCount(
      1,
      {
        timeout: 10_000,
      },
    );

    await page.keyboard.press("Escape");
    const card = inspirations(page).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByRole("link", { name: "Pexels" })).toHaveAttribute(
      "href",
      /^https:\/\/www\.pexels\.com\/photo\//,
    );
    await expect(card).toContainText(/Photo by .+ on Pexels/);
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      /^\/inspirations\//,
    );

    await card.getByRole("button", { name: "Use for Theme" }).click();
    await expect(card.getByText("Added to the Theme.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/Utsavvy updated the Theme for .+: \+ /),
    ).toBeVisible({ timeout: 10_000 });

    await expectNoSeriousA11yViolations(page);
    expect(pexels).toEqual([]);
    expect(cspViolations).toEqual([]);
  });

  test("an upload with the rights setting off asks for the tick, then shows on the Canvas credited to its Member", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(120_000);
    await newEvent(page, signIn, "E2E Uploads");
    await page.getByRole("button", { name: "Add Inspiration" }).click();
    const panel = page.getByRole("dialog", { name: "Add Inspiration" });
    await panel.getByRole("tab", { name: "Upload" }).click();

    await panel
      .locator('input[type="file"]')
      .setInputFiles(
        "public/inspirations/wedding-north-indian-hindu/31002035.webp",
      );
    const upload = panel.getByRole("button", { name: "Upload", exact: true });
    await expect(upload).toBeDisabled();
    await panel
      .getByRole("checkbox", {
        name: /Members have the right to use the images/,
      })
      .check();
    await upload.click();
    await expect(panel.getByText("Added to Inspirations")).toBeVisible({
      timeout: 30_000,
    });

    await page.keyboard.press("Escape");
    const card = inspirations(page).first();
    await expect(card).toContainText(/Uploaded by /, { timeout: 10_000 });
    // The picture comes through the Event's own access-checked URL.
    await expect(card.locator("img")).toHaveAttribute("src", /^blob:/, {
      timeout: 20_000,
    });
    await expectNoSeriousA11yViolations(page);
    expect(cspViolations).toEqual([]);
  });
});

test.describe("the stock photo strip, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_INSPIRATIONS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_INSPIRATIONS_LOCAL=1",
  );

  test('"find some haldi decor ideas" shows 6 library photos, and only the tapped one lands, tagged haldi', async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(120_000);
    const eventId = await newEvent(page, signIn, "E2E Strip");
    const result = convexRun<{ ok: boolean; found: number }>(
      "assistant/tools/images:stripForLocalCheck",
      { eventId, email: ownerEmail() },
    );
    expect(result).toMatchObject({ ok: true, found: 6 });

    const strip = page.getByRole("list", { name: "Stock photos" });
    await expect(strip.locator("img")).toHaveCount(6, { timeout: 20_000 });
    await expect(page.getByText(/they land tagged Haldi/)).toBeVisible();
    await expect(inspirations(page)).toHaveCount(0);

    await strip
      .getByRole("button", { name: /^Add: / })
      .nth(1)
      .click();
    await expect(strip.getByRole("button", { name: /^Added: / })).toHaveCount(
      1,
      {
        timeout: 10_000,
      },
    );
    await expect(inspirations(page)).toHaveCount(1, { timeout: 10_000 });
    await expect(inspirations(page).first()).toContainText("Haldi");
    await expectNoSeriousA11yViolations(page);
    expect(cspViolations).toEqual([]);
  });
});
