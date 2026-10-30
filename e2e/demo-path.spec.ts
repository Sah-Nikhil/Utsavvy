import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type {
  Browser,
  BrowserContext,
  Locator,
  TestInfo,
} from "@playwright/test";
import {
  DEMO_QUOTE_PASTE,
  PLAN_THE_SANGEET,
  ROHAN_CATERING_NOTE,
  SANGEET_GUESTS_PROPOSAL,
} from "../seed/demo/meera-weds-rohan";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";
import { convexLocal } from "./local-convex";

/**
 * The 2-minute demo script (IMPLEMENTATION_PLAN.md section 9.3, S19b issue
 * #53), walked beat by beat after `demo:reset`. Each beat is one named step,
 * so a beat the fallback table in section 10 drops is skipped by its name in
 * `DROPPED`, and a beat blocked by an app bug is marked in `FIXME` with the
 * bug named.
 *
 * The e2e user plays judge-member and a second Clerk test user plays
 * judge-viewer: the spec points `DEMO_JUDGE_MEMBER_ID` and
 * `DEMO_JUDGE_VIEWER_ID` at them and resets the demo Event. The Assistant
 * answers from the stub model (`DEFAULT_MODEL=stub-utsavvy`) with research
 * off, so 0:08 shows the table-path numbers exactly. The stub never calls a
 * tool, so the three beats where the real model would call one run that
 * tool's real server path through a local check function instead:
 * `quotes:pasteForLocalCheck` (the WhatsApp paste), `demo:cutsForLocalCheck`
 * (the cuts after "Suggest cuts") and
 * `assistant/tools/images:stripForLocalCheck` ("find some haldi decor
 * ideas").
 *
 * It changes a Convex deployment's settings and data, so it runs only against
 * a local deployment: set E2E_DEMO_LOCAL=1 with `bun run dev` on a local
 * backend. `convexLocal` refuses any other deployment. CI's preview run skips
 * it and runs `e2e/demo.spec.ts` instead (S19b's criterion, amended 29 Oct in
 * docs/plans/build-slices.md). Set E2E_DEMO_SHOTS=<dir> to also save each beat's screenshot there.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const GANESH =
  "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat.";

/** Beats the section 10 fallback table drops: none, as every slice in the script merged. */
const DROPPED = new Set<string>([]);
const QUOTE_BEAT =
  "0:50 WhatsApp Quote → Proposal, Accept, Booked, ₹40,000 over, Suggest cuts Nudge";
/** Beats an app bug blocks, by name, with the bug: none. */
const FIXME = new Map<string, string>([]);

function memberEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}
const viewerEmail = () =>
  `e2e-judge-viewer+clerk_test@${memberEmail().split("@")[1]}`;

/** A Clerk test user's ID, making the user the first time. */
async function clerkUserId(email: string, firstName: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Set CLERK_SECRET_KEY to find the test users.");
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
  const found = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!found.ok) throw new Error(`Clerk user lookup failed: ${found.status}`);
  const users = (await found.json()) as { id: string }[];
  if (users[0]) return users[0].id;
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
  return ((await created.json()) as { id: string }).id;
}

/** Runs a function on the local backend and parses what it prints. */
function convexRun<T>(fn: string, args: Record<string, unknown>): T {
  const out = convexLocal(["run", fn, JSON.stringify(args)]).trim();
  return (out === "" ? null : JSON.parse(out)) as T;
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
    viewport: DESKTOP,
  });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  return { context, page };
}

/** Opens the demo Event from "Open the demo Event" and waits for its Canvas. */
/**
 * Pans the Canvas the way a Member does, dragging empty Canvas, until
 * `target` is in the clear: the point at its centre is the target itself.
 * At the demo's 1280 x 800 the Vendors Section's Map button starts past the
 * window's right edge, behind the Chat. Left to Playwright, a click scrolls
 * the Canvas's clipped (overflow hidden) layers to reach it, which shifts
 * what is drawn away from where React Flow has it: the click, or a later
 * one, lands on a Section header or the Function chips instead (#131).
 */
async function panTo(page: Page, target: Locator) {
  const canvas = page.locator("[data-canvas]");
  for (let drags = 0; drags < 8; drags++) {
    const clear = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit !== null && el.contains(hit);
    });
    if (clear) return;
    const box = await target.boundingBox();
    if (box === null) throw new Error("The control isn't drawn at all");
    const plan = await canvas.evaluate(
      (element, at) => {
        const r = element.getBoundingClientRect();
        const chat = document.querySelector("[data-chat]");
        const right = Math.min(
          r.right,
          window.innerWidth,
          chat?.getBoundingClientRect().left ?? Infinity,
        );
        const bottom = Math.min(r.bottom, window.innerHeight);
        // At most 300 px a drag, towards the middle of the open Canvas.
        const clamp = (n: number) => Math.max(-300, Math.min(300, n));
        const dx = clamp((r.left + right) / 2 - at.x);
        const dy = clamp((r.top + bottom) / 2 - at.y);
        for (let y = r.top + 60; y < bottom - 20; y += 12)
          for (let x = r.left + 20; x < right - 20; x += 12) {
            const ex = x + dx;
            const ey = y + dy;
            if (ex < r.left + 10 || ex > right - 10) continue;
            if (ey < r.top + 10 || ey > bottom - 10) continue;
            const hit = document.elementFromPoint(x, y);
            if (
              hit?.closest(".react-flow__pane") &&
              !hit.closest(".react-flow__node")
            )
              return { x, y, dx, dy };
          }
        return null;
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    if (plan === null) throw new Error("No empty Canvas to drag");
    await page.mouse.move(plan.x, plan.y);
    await page.mouse.down();
    await page.mouse.move(plan.x + plan.dx, plan.y + plan.dy, { steps: 8 });
    await page.mouse.up();
  }
  throw new Error("Couldn't pan the control into view");
}

async function openDemo(page: Page): Promise<string> {
  await page.goto("/events?open=demo");
  await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.locator("[data-demo-banner]")).toBeVisible({
    timeout: 20_000,
  });
  return new URL(page.url()).pathname;
}

const chat = (page: Page) => page.locator("[data-chat]");
const budget = (page: Page) => page.locator('[data-canvas-item="budget"]');
const shortlisted = (page: Page, name: RegExp) =>
  page.locator('[data-canvas-item="shortlistedVendor"]').filter({
    hasText: name,
  });

test.describe("the demo path, on a local deployment", () => {
  test.skip(
    process.env.E2E_DEMO_LOCAL !== "1",
    "Resets the demo Event on a local Convex deployment; set E2E_DEMO_LOCAL=1",
  );
  // A missing control fails its beat in seconds, not at the test's timeout.
  test.use({ actionTimeout: 20_000 });

  test("the 2-minute script, beat by beat, after a reset", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(600_000);
    const shotsDir = process.env.E2E_DEMO_SHOTS;
    const people: Person[] = [];

    /** One beat of section 9.3: skipped by name when dropped or blocked. */
    async function beat(name: string, body: () => Promise<void>) {
      if (DROPPED.has(name))
        return test.step.skip(`${name} (dropped by section 10)`, body);
      const bug = FIXME.get(name);
      if (bug !== undefined) {
        testInfo.annotations.push({ type: "fixme", description: name });
        return test.step.skip(`${name} (fixme: ${bug})`, body);
      }
      return test.step(name, body);
    }

    /** Saves one beat's screenshot in the test's output, and in E2E_DEMO_SHOTS. */
    async function shot(page: Page, file: string) {
      const body = await page.screenshot();
      await testInfo.attach(file, { body, contentType: "image/png" });
      if (shotsDir) await page.screenshot({ path: `${shotsDir}/${file}.png` });
    }

    const memberId = await clerkUserId(memberEmail(), "Judge");
    const viewerId = await clerkUserId(viewerEmail(), "Viewer");
    const member = await signedIn(browser, testInfo, memberEmail());
    people.push(member);
    const { page } = member;

    let eventId = "";
    try {
      await test.step("reset: zero internal.nudges.check, Chat as seeded", async () => {
        convexLocal(["env", "set", "DEMO_JUDGE_MEMBER_ID", memberId]);
        convexLocal(["env", "set", "DEMO_JUDGE_VIEWER_ID", viewerId]);
        convexLocal(["run", "demo:reset", "{}"]);
        const after = convexRun<{
          eventId: string;
          pendingNudgeChecks: number;
          nudges: number;
          chat: { role: string; text: string }[];
        }>("demo:afterResetForLocalCheck", {});
        eventId = after.eventId;
        expect(after.pendingNudgeChecks).toBe(0);
        expect(after.nudges).toBe(0);
        expect(after.chat).toEqual([
          { role: "user", text: PLAN_THE_SANGEET.request },
          { role: "assistant", text: PLAN_THE_SANGEET.reply },
          { role: "user", text: SANGEET_GUESTS_PROPOSAL.request },
          { role: "assistant", text: SANGEET_GUESTS_PROPOSAL.reply },
          { role: "user", text: ROHAN_CATERING_NOTE },
        ]);
      });

      await beat("0:00 Title card", async () => {
        await page.goto("/");
        await expect(
          page.getByRole("heading", {
            name: /Plan your wedding, birthday or community festival/,
          }),
        ).toBeVisible();
        // A link drawn as a button: Base UI gives it the button role.
        await expect(
          page.getByRole("button", { name: "Open the demo Event" }),
        ).toHaveAttribute("href", "/events?open=demo", { timeout: 20_000 });
        await shot(page, "0-00-title");
      });

      await beat(
        "0:08 Ganesh utsav Brief → ₹36,000 short flag, plan at budget anyway",
        async () => {
          await page.goto("/events");
          await expect(page.locator("[data-account-ready]")).toBeVisible({
            timeout: 20_000,
          });
          await page.getByRole("button", { name: "New Event" }).click();
          const dialog = page.getByRole("dialog", { name: "New Event" });
          await dialog
            .getByLabel("Event name")
            .fill(`E2E demo Ganeshotsav ${Date.now()}`);
          await dialog.getByRole("radio", { name: /Community/ }).click();
          await dialog.getByRole("button", { name: "Create Event" }).click();
          await expect(page).toHaveURL(/\/events\/[a-z0-9]+$/, {
            timeout: 20_000,
          });
          await chat(page)
            .getByRole("textbox", { name: "Describe what you're planning" })
            .fill(GANESH);
          await chat(page)
            .getByRole("button", { name: "Start planning" })
            .click();

          // Utsavvy proposes the festival's dates, then asks for the Guests.
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

          const summary = chat(page).locator("[data-brief-summary]");
          await expect(summary.locator("[data-budget-flag]")).toHaveText(
            "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short.",
            { timeout: 60_000 },
          );
          await expect(
            summary.getByRole("button", { name: /^Raise the budget/ }),
          ).toBeVisible();
          // Research is stubbed off, so every line is on the reference table.
          await expect(summary.locator("[data-budget-basis]")).toContainText(
            "Based on Utsavvy's reference table for all 14 lines.",
          );
          await shot(page, "0-08-brief-flag");

          await summary
            .getByRole("button", { name: "Plan at my budget anyway" })
            .click();
          const progress = chat(page).locator("[data-plan-progress]");
          await expect(progress).toBeVisible({ timeout: 20_000 });
          await expect(
            progress.locator("[data-plan-progress-line]"),
          ).toHaveText("Your first plan is on the Canvas.", {
            timeout: 90_000,
          });
          // Daily aarti is one Function over a date range.
          const aarti = page.locator(
            'section[aria-label^="Run sheet, Daily aarti"]',
          );
          await expect(aarti).toHaveCount(1, { timeout: 20_000 });
          await expect(aarti).toContainText("4 Sep to 13 Sep");
          const share = page.locator("dt", { hasText: "Per household" });
          await expect(
            share.locator("xpath=following-sibling::dd[1]"),
          ).toHaveText("₹1,000");
          await expectNoSeriousA11yViolations(page);
          await shot(page, "0-08-plan");
        },
      );

      await beat(
        "0:35 Meera weds Rohan: Budget, Timeline, run sheet, Vendors on the map",
        async () => {
          expect(await openDemo(page)).toBe(`/events/${eventId}`);
          await expect(
            page.getByRole("heading", { name: "Meera weds Rohan" }),
          ).toBeVisible();
          await expect(budget(page)).toContainText("₹25,00,000", {
            timeout: 20_000,
          });
          await expect(budget(page)).toContainText(
            "Estimates sit near the low end",
          );
          // Late bookings are pulled into this week and marked late.
          const deadlines = page.locator('section[aria-label="Deadlines"]');
          await expect(deadlines).toContainText("late");
          await expect(
            page.locator('section[aria-label="Run sheet, Wedding"]'),
          ).toContainText("Vidaai");
          await shot(page, "0-35-canvas");

          const mapButton = page
            .getByRole("button", { name: "Map", exact: true })
            .first();
          await panTo(page, mapButton);
          await mapButton.click();
          const sheet = page.getByRole("dialog", {
            name: "Vendors on the map",
          });
          await expect(sheet.locator("[data-map-ready] canvas")).toBeVisible({
            timeout: 30_000,
          });
          const tone = (name: string) =>
            sheet.locator(`.maplibregl-marker [data-marker-tone="${name}"]`);
          await expect(tone("booked")).toHaveCount(1);
          await expect(tone("quoted")).toHaveCount(1);
          await expect(tone("considering")).toHaveCount(1);
          await expectNoSeriousA11yViolations(page);
          await shot(page, "0-35-map");
          await page.keyboard.press("Escape");
          await expect(sheet).toBeHidden();
        },
      );

      const eventPath = `/events/${eventId}`;
      /** Later beats start on the demo Event, even when an earlier one is skipped. */
      async function onDemo() {
        if (new URL(page.url()).pathname !== eventPath) await openDemo(page);
      }
      const caterer = shortlisted(page, /Caterer/);

      await beat(QUOTE_BEAT, async () => {
        await onDemo();
        // The script's paste names the sangeet (section 9.3, 29 Oct).
        const pasted = convexRun<{ ok: boolean }>("quotes:pasteForLocalCheck", {
          eventId,
          email: memberEmail(),
          text: DEMO_QUOTE_PASTE,
        });
        expect(pasted.ok).toBe(true);
        const proposal = chat(page).locator("[data-proposal]").last();
        await expect(proposal.locator("[data-proposal-line]")).toHaveText(
          [
            /^Quote from .+: ₹950\/plate for 300 Guests at the Sangeet \(₹2,85,000\), live counters extra$/,
          ],
          { timeout: 20_000 },
        );
        await shot(page, "0-50-quote-proposal");
        await proposal.getByRole("button", { name: "Accept" }).click();
        await expect(proposal.locator("[data-proposal-reason]")).toHaveText(
          /^Accepted by /,
          { timeout: 10_000 },
        );
        await expect(caterer).toContainText("₹950/plate × 300 = ₹2.85L", {
          timeout: 10_000,
        });

        // The Quote prices the sangeet's catering line, and no other line.
        await expect(
          budget(page)
            .getByRole("list", { name: "Vendor prices for Catering" })
            .filter({ hasText: "₹950/plate × 300 = ₹2.85L" }),
        ).toHaveCount(1);
        const row = budget(page)
          .locator('section[aria-label="Sangeet"] li[data-entry-id]')
          .filter({
            has: page.getByRole("button", { name: "Catering", exact: true }),
          });
        const prices = row.getByRole("list", {
          name: "Vendor prices for Catering",
        });
        // Estimate, Listed price and Quote side by side, never added up.
        await expect(row).toContainText("₹2,45,000");
        await expect(row).toContainText("Estimate");
        await expect(row).toContainText("₹3L to ₹6L");
        await expect(prices).toContainText("Listed price");
        await expect(prices).toContainText("₹850/plate × 300 = ₹2.55L");
        await expect(prices).toContainText("₹950/plate × 300 = ₹2.85L");
        // The line's verdict, beside the sangeet's own total.
        await expect(
          prices.locator('[data-verdict="over"]').first(),
        ).toHaveText("₹40,000 over the planned ₹2,45,000");
        await row.scrollIntoViewIfNeeded();
        await shot(page, "0-50-budget-line");

        // Booked asks before using the Quote; Yes puts the Budget over.
        const status = caterer.getByRole("button", { name: /^Status for / });
        await panTo(page, status);
        await status.click();
        await page.getByRole("menuitem", { name: "Booked" }).click();
        await expect(status).toContainText("Booked", { timeout: 10_000 });
        const ask = caterer.getByRole("group", { name: "Use the Quote" });
        await expect(ask).toContainText(
          "Use the ₹2.85L Quote as this line's amount?",
        );
        const yes = ask.getByRole("button", { name: "Yes, use it" });
        await panTo(page, yes);
        await yes.click();
        await expect(ask).toBeHidden({ timeout: 10_000 });
        await expect(row).toContainText("₹2,85,000");

        const nudge = page.locator('[data-chat-row="system"]').filter({
          hasText: "The Budget is now ₹40,000 over. Want me to suggest cuts?",
        });
        await expect(nudge).toBeVisible({ timeout: 20_000 });
        await expect(
          nudge.getByRole("button", { name: "Suggest cuts" }),
        ).toBeVisible();
        await expectNoSeriousA11yViolations(page);
        await shot(page, "0-50-nudge");
      });

      await beat(
        "1:05 Suggest cuts → Proposal, Viewer sees it live without Accept and Comments, Accept, history",
        async () => {
          await onDemo();
          const viewer = await signedIn(browser, testInfo, viewerEmail());
          people.push(viewer);
          await viewer.page.goto(eventPath);
          await expect(viewer.page.locator("[data-demo-banner]")).toBeVisible({
            timeout: 20_000,
          });
          // A Viewer can't edit the Canvas.
          await expect(budget(viewer.page)).toBeVisible({ timeout: 20_000 });
          await expect(
            budget(viewer.page).getByRole("textbox", { name: "New line" }),
          ).toHaveCount(0);

          const nudge = page.locator('[data-chat-row="system"]').filter({
            hasText: "The Budget is now ₹40,000 over. Want me to suggest cuts?",
          });
          // 1:05 starts where 0:50 left the Budget: ₹40,000 over.
          await expect(nudge).toBeVisible({ timeout: 20_000 });
          // The reset's own photos are days old in the story: no Nudge asks
          // to match the Theme to them once the Nudge check has run.
          await expect(
            chat(page)
              .locator('[data-chat-row="system"]')
              .filter({ hasText: /added a photo/ }),
          ).toHaveCount(0);
          await nudge.getByRole("button", { name: "Suggest cuts" }).click();
          await expect(nudge).toContainText("asked Utsavvy: Suggest cuts", {
            timeout: 10_000,
          });
          // The stub's reply to the request ends before the cuts arrive.
          await expect(
            chat(page).getByText("Utsavvy's test model").last(),
          ).toBeVisible({ timeout: 30_000 });
          const { proposalId } = convexRun<{ proposalId: string }>(
            "demo:cutsForLocalCheck",
            { email: memberEmail() },
          );

          const viewerCard = viewer.page.locator(
            `[data-proposal="${proposalId}"]`,
          );
          await expect(viewerCard).toBeVisible({ timeout: 20_000 });
          await expect(viewerCard.locator("[data-proposal-line]")).toHaveText([
            "Outfits ₹1,12,000 to ₹75,000",
            "Invitations ₹17,000 to ₹12,000",
          ]);
          await expect(viewerCard.getByRole("button")).toHaveCount(0);
          await shot(viewer.page, "1-05-viewer-proposal");

          // The Viewer leaves a Comment on the Budget.
          await budget(viewer.page)
            .locator("footer button[aria-label]")
            .click();
          const sheet = viewer.page.getByRole("dialog", { name: "Comments" });
          await sheet
            .getByRole("textbox", { name: "Add a Comment" })
            .fill("Outfits can come from the family tailor, that's fine.");
          await sheet
            .getByRole("button", { name: "Comment", exact: true })
            .click();
          await expect(
            sheet.getByRole("article", { name: "Comment by You" }),
          ).toBeVisible({ timeout: 10_000 });
          await shot(viewer.page, "1-05-viewer-comment");
          await viewer.page.keyboard.press("Escape");

          const card = page.locator(`[data-proposal="${proposalId}"]`);
          await card.getByRole("button", { name: "Accept" }).click();
          for (const p of [page, viewer.page])
            await expect(
              p.locator(
                `[data-proposal="${proposalId}"] [data-proposal-reason]`,
              ),
            ).toHaveText(/^Accepted by judge-member/, { timeout: 10_000 });
          // ₹42,000 freed on a ₹40,000 overrun: back within the ₹25,00,000.
          await expect(budget(page).getByText("Over budget by")).toHaveCount(
            0,
            {
              timeout: 10_000,
            },
          );
          await expect(budget(page)).toContainText("Event total₹24,98,000");

          await page.getByRole("button", { name: "History" }).click();
          const history = page.getByRole("dialog", { name: "Edit history" });
          await expect(
            history.getByText(/^Utsavvy for judge-member/).first(),
          ).toBeVisible({ timeout: 10_000 });
          await expectNoSeriousA11yViolations(page);
          await shot(page, "1-05-history");
          await page.keyboard.press("Escape");
        },
      );

      await beat(
        "1:30 haldi decor ideas → 6 stock photos, add two, Use for Theme → decor Suggestion",
        async () => {
          await onDemo();
          const strip = convexRun<{ ok: boolean; found: number }>(
            "assistant/tools/images:stripForLocalCheck",
            { eventId, email: memberEmail() },
          );
          expect(strip).toMatchObject({ ok: true, found: 6 });
          const photos = page
            .getByRole("list", { name: "Stock photos" })
            .last();
          await expect(photos.locator("img")).toHaveCount(6, {
            timeout: 20_000,
          });
          const inspirations = page.locator('[data-canvas-item="inspiration"]');
          const before = await inspirations.count();
          // Rohan's two haldi photos from the seed are already on the Canvas.
          const added = photos.getByRole("button", { name: /^Added: / });
          await expect(added).toHaveCount(2);
          for (const count of [3, 4]) {
            await photos
              .getByRole("button", { name: /^Add: / })
              .first()
              .click();
            await expect(added).toHaveCount(count, { timeout: 10_000 });
          }
          await expect(inspirations).toHaveCount(before + 2, {
            timeout: 10_000,
          });
          await shot(page, "1-30-strip");

          const suggestions = page.locator('[data-canvas-item="suggestion"]');
          const suggestionsBefore = await suggestions.count();
          const card = inspirations.last();
          const useForTheme = card.getByRole("button", {
            name: "Use for Theme",
          });
          await panTo(page, useForTheme);
          await useForTheme.click();
          await expect(card.getByText("Added to the Theme.")).toBeVisible({
            timeout: 20_000,
          });
          await expect(
            chat(page)
              .getByRole("list", { name: "Chat messages" })
              .getByText(/Utsavvy updated the Theme for .+: \+ /),
          ).toBeVisible({ timeout: 10_000 });
          await expect(suggestions).toHaveCount(suggestionsBefore + 1, {
            timeout: 30_000,
          });
          await expect(suggestions.last()).toContainText("₹");
          await expectNoSeriousA11yViolations(page);
          await shot(page, "1-30-theme");
        },
      );

      await beat(
        "1:45 Phone: Chat first, Canvas tab in Compact mode",
        async () => {
          const phone = await browser.newContext({
            baseURL: testInfo.project.use.baseURL,
            extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
            viewport: PHONE,
            storageState: await member.context.storageState(),
          });
          const phonePage = await phone.newPage();
          people.push({ context: phone, page: phonePage });
          await setupClerkTestingToken({ page: phonePage });
          await phonePage.goto(eventPath);
          const tab = (name: string) =>
            phonePage
              .getByRole("navigation", { name: "Workspace" })
              .getByRole("button", { name, exact: true });
          await expect(tab("Chat")).toHaveAttribute("aria-current", "page", {
            timeout: 20_000,
          });
          await expect(chat(phonePage)).toBeVisible();
          await expect(phonePage.locator("[data-demo-banner]")).toBeVisible();
          await expectNoSeriousA11yViolations(phonePage);
          await shot(phonePage, "1-45-phone-chat");
          await tab("Canvas").click();
          await expect(
            phonePage.locator('[data-compact-item="budget"]'),
          ).toBeVisible({ timeout: 20_000 });
          await expect(
            phonePage.locator('[data-compact-item="shortlistedVendor"]'),
          ).toHaveCount(5);
          await expectNoSeriousA11yViolations(phonePage);
          await shot(phonePage, "1-45-phone-canvas");
        },
      );
    } finally {
      for (const person of people) await person.context.close();
    }
  });
});
