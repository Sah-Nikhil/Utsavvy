import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, BrowserContext, Locator } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The freeform Canvas (S2) with two people on one Event: Meera (the Owner)
 * and Rohan (a Member), each in their own browser context.
 *
 * It needs an Event with the starting Sections. Until S1's `api.events.create`
 * can make one in a fresh preview, the test seeds its own on a local Convex
 * deployment, so it runs only with E2E_CANVAS_LOCAL=1 against `bun run dev`
 * (see docs in the PR for #35) and is skipped elsewhere.
 */

const LOCAL = process.env.E2E_CANVAS_LOCAL === "1";
const OWNER =
  process.env.E2E_CANVAS_OWNER_EMAIL ?? "e2e-meera+clerk_test@example.com";
const MEMBER =
  process.env.E2E_CANVAS_MEMBER_EMAIL ?? "e2e-rohan+clerk_test@example.com";

test.skip(!LOCAL, "Seeds a local Convex deployment; set E2E_CANVAS_LOCAL=1");
test.describe.configure({ mode: "serial" });

function convexRun(fn: string, args: Record<string, unknown>): string {
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
  const out = execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)],
    { encoding: "utf8" },
  );
  return JSON.parse(out.trim()) as string;
}

async function signedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  // EnsureUser makes the `users` row on the first signed-in page.
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

const itemNode = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

/** The node's transform: its position inside its Section. */
const transformOf = (node: Locator) =>
  node.evaluate((el) => (el as HTMLElement).style.transform);

let eventId = "";
let meera: { context: BrowserContext; page: Page };
let rohan: { context: BrowserContext; page: Page };

test.beforeAll(async ({ browser }) => {
  meera = await signedInPage(browser, OWNER);
  rohan = await signedInPage(browser, MEMBER);
  eventId = convexRun("canvas:seedLocalCheck", {
    email: OWNER,
    memberEmails: [MEMBER],
    items: 12,
  });
  for (const { page } of [meera, rohan]) {
    await page.goto(`/events/${eventId}`);
    await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
      timeout: 20_000,
    });
  }
});

test.afterAll(async () => {
  await meera?.context.close();
  await rohan?.context.close();
});

test("shows the four starting Sections with their Items, and passes axe", async () => {
  const { page } = meera;
  for (const name of ["Money and dates", "Vendors", "Inspirations", "Notes"]) {
    await expect(
      page.getByRole("heading", { level: 2, name, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".react-flow__node-item")).toHaveCount(12);
  // Presence: both people show in the header.
  await expect(
    page.locator('[data-mount="presence"] [role="img"]'),
  ).toHaveCount(2, { timeout: 15_000 });
  await expectNoSeriousA11yViolations(page);
});

test("a drag in one browser appears in the other within about a second", async () => {
  const note = meera.page.locator('[data-canvas-item="note"]').first();
  const node = note.locator("xpath=..");
  const id = (await node.getAttribute("data-id"))!;
  const before = await transformOf(itemNode(rohan.page, id));

  await note.hover();
  const handle = note.locator(".canvas-item-handle");
  const box = (await handle.boundingBox())!;
  await meera.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await meera.page.mouse.down();
  await meera.page.mouse.move(box.x + 60, box.y + 50, { steps: 8 });
  await meera.page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
  await meera.page.mouse.up();

  const after = await transformOf(itemNode(meera.page, id));
  expect(after).not.toBe(before);
  await expect
    .poll(() => transformOf(itemNode(rohan.page, id)), { timeout: 2_000 })
    .toBe(after);
});

test("dropping an Item in another Section moves it there, for everyone", async () => {
  const vendorsCount = (page: Page) =>
    page
      .locator('[data-section-kind="vendors"] h2 + span')
      .innerText()
      .then((text) => Number.parseInt(text, 10));
  const before = await vendorsCount(rohan.page);
  const note = meera.page.locator('[data-canvas-item="note"]').last();
  await note.hover();
  const handle = (await note.locator(".canvas-item-handle").boundingBox())!;
  const vendors = (await meera.page
    .locator('[data-section-kind="vendors"]')
    .boundingBox())!;
  await meera.page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await meera.page.mouse.down();
  await meera.page.mouse.move(
    vendors.x + vendors.width / 2,
    vendors.y + vendors.height - 90,
    { steps: 20 },
  );
  await meera.page.mouse.up();
  await expect.poll(() => vendorsCount(rohan.page)).toBe(before + 1);
});

test("keyboard: Tab reaches an Item, Enter selects it, and the other person sees who has it", async () => {
  const { page } = meera;
  const first = page.locator(".react-flow__node-item").first();
  const id = (await first.getAttribute("data-id"))!;
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(first.locator("[data-item-id][data-selected]")).toBeVisible();
  await page.keyboard.press("Tab");
  // Rohan sees Meera's avatar on the Item she selected.
  await expect(
    itemNode(rohan.page, id).getByRole("img", { name: /Meera/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect(first.locator("[data-item-id][data-selected]")).toHaveCount(0);
});

test("the Function filter dims Items for other Functions", async () => {
  const { page } = meera;
  await page.getByRole("button", { name: "Haldi" }).click();
  await expect(
    page.locator('[data-canvas-item][data-function-key="haldi"][data-dimmed]'),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '[data-canvas-item][data-function-key="sangeet"][data-dimmed]',
    ),
  ).not.toHaveCount(0);
  await expect(
    page.locator("[data-canvas-item]:not([data-function-key])[data-dimmed]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Haldi" }).click();
  await expect(page.locator("[data-canvas-item][data-dimmed]")).toHaveCount(0);
});

test("create, rename and delete a custom Section, seen live by the other person", async () => {
  const { page } = meera;
  await page.getByRole("button", { name: "New Section" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Sangeet night");
  await page.getByRole("button", { name: "Add Section" }).click();
  await expect(
    rohan.page.getByRole("heading", { level: 2, name: "Sangeet night" }),
  ).toBeVisible({ timeout: 5_000 });

  await page
    .getByRole("button", { name: "Sangeet night Section actions" })
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Sangeet");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(
    rohan.page.getByRole("heading", { level: 2, name: "Sangeet", exact: true }),
  ).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Sangeet Section actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Section" }).click();
  await page.getByRole("button", { name: "Delete Section" }).click();
  await expect(
    rohan.page.getByRole("heading", { level: 2, name: "Sangeet", exact: true }),
  ).toHaveCount(0, { timeout: 5_000 });
});

test("a new Item lands marked as new, in free space in its starting Section", async () => {
  const id = convexRun("canvas:addNoteForLocalCheck", {
    eventId,
    text: "Book the dhol players",
  });
  for (const { page } of [meera, rohan]) {
    const node = itemNode(page, id);
    await expect(node.locator("[data-arrived]")).toBeVisible({
      timeout: 5_000,
    });
    // Its box overlaps no other Item's box.
    const overlaps = await page.evaluate((newId) => {
      const boxes = [
        ...document.querySelectorAll(".react-flow__node-item"),
      ].map((el) => ({
        id: el.getAttribute("data-id"),
        r: el.getBoundingClientRect(),
      }));
      const mine = boxes.find((b) => b.id === newId)!.r;
      return boxes.filter(
        (b) =>
          b.id !== newId &&
          b.r.left < mine.right &&
          mine.left < b.r.right &&
          b.r.top < mine.bottom &&
          mine.top < b.r.bottom,
      ).length;
    }, id);
    expect(overlaps).toBe(0);
  }
});

test("the Assistant's pointing rings the Item for everyone and pans only the asker's view", async () => {
  const id = (await meera.page
    .locator(".react-flow__node-item")
    .last()
    .getAttribute("data-id"))!;
  const viewport = (page: Page) =>
    page
      .locator(".react-flow__viewport")
      .evaluate((el) => (el as HTMLElement).style.transform);
  const meeraBefore = await viewport(meera.page);
  const rohanBefore = await viewport(rohan.page);

  convexRun("canvas:pointForLocalCheck", {
    eventId,
    email: OWNER,
    itemIds: [id],
  });
  for (const { page } of [meera, rohan]) {
    await expect(itemNode(page, id).locator("[data-pointed]")).toBeVisible({
      timeout: 5_000,
    });
  }
  await expect.poll(() => viewport(meera.page)).not.toBe(meeraBefore);
  expect(await viewport(rohan.page)).toBe(rohanBefore);
});

test("ornaments off hides the corner pieces and lines the Section label up with its Items", async () => {
  const { page } = meera;
  const corners = page.locator('[data-ornament="section-corners"] svg');
  /**
   * Label left minus the left edge of the Notes Section's Items column, where
   * an Item at x = 0 is drawn: 24 px (SECTION_PAD_X) in from the Section's
   * edge, times the zoom.
   */
  const indent = () =>
    page.evaluate(() => {
      const section = document.querySelector('[data-section-kind="notes"]')!;
      const label = section.querySelector("h2")!.getBoundingClientRect();
      const transform = (
        document.querySelector(".react-flow__viewport") as HTMLElement
      ).style.transform;
      const zoom = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? 1);
      const column = section.getBoundingClientRect().left + 24 * zoom;
      return Math.round(label.left - column);
    });

  await expect(corners.first()).toBeVisible();
  expect(await indent()).toBeGreaterThan(0);

  await page.evaluate(() => localStorage.setItem("utsavvy.ornaments", "off"));
  await page.reload();
  await expect(page.locator(".react-flow__node-section")).toHaveCount(4);
  await expect(corners.first()).toBeHidden();
  expect(Math.abs(await indent())).toBeLessThanOrEqual(1);
  await expectNoSeriousA11yViolations(page);

  await page.evaluate(() => localStorage.removeItem("utsavvy.ornaments"));
  await page.reload();
  await expect(corners.first()).toBeVisible();
});
