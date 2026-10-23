import { execFileSync } from "node:child_process";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type {
  Browser,
  BrowserContext,
  Locator,
  TestInfo,
} from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The freeform Canvas (S2) with two people on one Event: Meera (the Owner,
 * the e2e user) and Rohan (a Member who joins by the Member link), each in
 * their own browser.
 *
 * The first group runs on PR previews and locally: Meera creates the Event
 * with "New Event" (S1), so the Canvas has S1's starting Sections and its
 * Budget, Timeline and Vendor checklist. It creates an Event nothing cleans
 * up, so it never runs against production.
 *
 * The second group needs Functions, Items and highlights no slice can make
 * yet, so it seeds them through internal functions on a local Convex
 * deployment: it runs only with E2E_CANVAS_LOCAL=1 against `bun run dev`.
 */

const PRODUCTION_HOST = "utsavvy.vercel.app";

function isProduction(baseURL: string | undefined): boolean {
  return baseURL ? new URL(baseURL).hostname === PRODUCTION_HOST : false;
}

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

/** The second test user, a `+clerk_test` address on the e2e user's domain. */
function memberEmail(): string {
  if (process.env.E2E_CANVAS_MEMBER_EMAIL)
    return process.env.E2E_CANVAS_MEMBER_EMAIL;
  return `e2e-rohan+clerk_test@${ownerEmail().split("@")[1]}`;
}

/** Makes the Clerk test user the first time, so CI needs no account set up by hand. */
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
  if (!created.ok)
    throw new Error(`Creating the Clerk test user failed: ${created.status}`);
}

type Person = { context: BrowserContext; page: Page };

async function signedIn(
  browser: Browser,
  testInfo: TestInfo,
  email: string,
): Promise<Person> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
  });
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

const sectionCount = (page: Page, kind: string) =>
  page
    .locator(`[data-section-kind="${kind}"] h2 + span`)
    .innerText()
    .then((text) => Number.parseInt(text, 10));

/** Drags an Item by its handle to a point on the page. */
async function dragItem(
  page: Page,
  item: Locator,
  to: { x: number; y: number },
) {
  await item.hover();
  const handle = (await item.locator(".canvas-item-handle").boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

const waitForCanvas = (page: Page) =>
  expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });

// ---------------------------------------------------------------------------

test.describe("canvas", () => {
  test.describe.configure({ mode: "serial" });

  let meera: Person;
  let rohan: Person;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(
      isProduction(testInfo.project.use.baseURL),
      "Creates an Event, so it runs on PR previews and locally only.",
    );
    testInfo.setTimeout(120_000);
    await ensureClerkUser(ownerEmail(), "Meera");
    await ensureClerkUser(memberEmail(), "Rohan");
    meera = await signedIn(browser, testInfo, ownerEmail());
    rohan = await signedIn(browser, testInfo, memberEmail());

    // Meera creates an Event; Rohan joins by its Member link.
    const { page } = meera;
    await page.getByRole("button", { name: "New Event" }).click();
    const dialog = page.getByRole("dialog", { name: "New Event" });
    await dialog.getByLabel("Event name").fill(`E2E Canvas ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create Event" }).click();
    await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
    const workspace = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "People" }).click();
    const link = page.getByRole("textbox", { name: "Member link address" });
    await expect(link).toHaveValue(/\/join\/[0-9a-f]+$/);
    const join = new URL(await link.inputValue()).pathname;
    await page.keyboard.press("Escape");

    await rohan.page.goto(join);
    await expect(rohan.page).toHaveURL(new RegExp(`${workspace}$`), {
      timeout: 20_000,
    });
    await waitForCanvas(page);
    await waitForCanvas(rohan.page);
  });

  test.afterAll(async () => {
    await meera?.context.close();
    await rohan?.context.close();
  });

  test("shows the four starting Sections and the plan Items, with both people present", async () => {
    const { page } = meera;
    for (const name of [
      "Money and dates",
      "Vendors",
      "Inspirations",
      "Notes",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name, exact: true }),
      ).toBeVisible();
    }
    for (const kind of ["budget", "timeline", "checklist"]) {
      await expect(page.locator(`[data-canvas-item="${kind}"]`)).toHaveCount(1);
    }
    await expect(
      page.locator('[data-mount="presence"] [role="img"]'),
    ).toHaveCount(2, { timeout: 15_000 });
    await expectNoSeriousA11yViolations(page);
  });

  test("a drag in one browser appears in the other within about a second", async () => {
    const budget = meera.page.locator('[data-canvas-item="budget"]');
    const id = (await budget.locator("xpath=..").getAttribute("data-id"))!;
    const before = await transformOf(itemNode(rohan.page, id));
    const box = (await budget.boundingBox())!;
    // Down and right, still inside Money and dates.
    await dragItem(meera.page, budget, {
      x: box.x + box.width / 2 + 10,
      y: box.y + box.height + 40,
    });
    const after = await transformOf(itemNode(meera.page, id));
    expect(after).not.toBe(before);
    await expect
      .poll(() => transformOf(itemNode(rohan.page, id)), { timeout: 2_000 })
      .toBe(after);
  });

  test("dropping an Item in another Section moves it there, for everyone", async () => {
    const before = await sectionCount(rohan.page, "notes");
    const timeline = meera.page.locator('[data-canvas-item="timeline"]');
    const notes = (await meera.page
      .locator('[data-section-kind="notes"]')
      .boundingBox())!;
    await dragItem(meera.page, timeline, {
      x: notes.x + notes.width / 2,
      y: notes.y + notes.height / 2,
    });
    await expect.poll(() => sectionCount(rohan.page, "notes")).toBe(before + 1);
  });

  test("keyboard: Tab reaches an Item, Enter selects it, and the other person sees who has it", async () => {
    const { page } = meera;
    const first = page.locator(".react-flow__node-item").first();
    const id = (await first.getAttribute("data-id"))!;
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(first.locator("[data-item-id][data-selected]")).toBeVisible();
    await expect(
      // Meera's avatar (whatever her test account is called).
      itemNode(rohan.page, id).getByRole("img").first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
    await expect(first.locator("[data-item-id][data-selected]")).toHaveCount(0);
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
    const renamed = rohan.page.getByRole("heading", {
      level: 2,
      name: "Sangeet",
      exact: true,
    });
    await expect(renamed).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Sangeet Section actions" }).click();
    await page.getByRole("menuitem", { name: "Delete Section" }).click();
    await page.getByRole("button", { name: "Delete Section" }).click();
    await expect(renamed).toHaveCount(0, { timeout: 5_000 });
  });

  test("ornaments off hides the corner pieces and lines each Section label up with its Items", async () => {
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
    await waitForCanvas(page);
    await expect(corners.first()).toBeHidden();
    expect(Math.abs(await indent())).toBeLessThanOrEqual(1);
    await expectNoSeriousA11yViolations(page);

    await page.evaluate(() => localStorage.removeItem("utsavvy.ornaments"));
    await page.reload();
    await expect(corners.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------

function convexRun(fn: string, args: Record<string, unknown>): string {
  // The Convex CLI's own script, run by Node, so no shell mangles the JSON.
  // On Windows it can trip a libuv assertion after printing; keep its output.
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
  return JSON.parse(out.trim()) as string;
}

test.describe("canvas, seeded on a local deployment", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    process.env.E2E_CANVAS_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_CANVAS_LOCAL=1",
  );

  let eventId = "";
  let meera: Person;
  let rohan: Person;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    meera = await signedIn(browser, testInfo, ownerEmail());
    rohan = await signedIn(browser, testInfo, memberEmail());
    eventId = convexRun("canvas:seedLocalCheck", {
      email: ownerEmail(),
      memberEmails: [memberEmail()],
      items: 12,
    });
    for (const { page } of [meera, rohan]) {
      await page.goto(`/events/${eventId}`);
      await waitForCanvas(page);
    }
  });

  test.afterAll(async () => {
    await meera?.context.close();
    await rohan?.context.close();
  });

  test("the Function filter dims Items for other Functions", async () => {
    const { page } = meera;
    await page.getByRole("button", { name: "Haldi" }).click();
    await expect(
      page.locator(
        '[data-canvas-item][data-function-key="haldi"][data-dimmed]',
      ),
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
    await expect(page.locator("[data-canvas-item][data-dimmed]")).toHaveCount(
      0,
    );
  });

  test("a new Item lands marked as new, in free space in its starting Section", async () => {
    const id = convexRun("canvas:addNoteForLocalCheck", {
      eventId,
      text: "Book the dhol players",
    });
    for (const { page } of [meera, rohan]) {
      await expect(itemNode(page, id).locator("[data-arrived]")).toBeVisible({
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
      email: ownerEmail(),
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
});
