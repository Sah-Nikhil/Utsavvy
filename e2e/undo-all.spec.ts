import { execFileSync } from "node:child_process";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * Grouped "Undo all" (X11) as a Member sees it: under the Assistant's Chat
 * reply and on the reply's group in the edit history.
 *
 * The stub model (`DEFAULT_MODEL=stub-utsavvy`) never calls a tool, so the
 * reply and the Note it added are seeded through
 * `assistant/tools/core:webAnswerForLocalCheck`, as e2e/assistant.spec.ts
 * does. It needs a local Convex deployment: set E2E_ASSISTANT_LOCAL=1
 * against `bun run dev`.
 */

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

function convexRun<T>(fn: string, args: Record<string, unknown>): T {
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
  return JSON.parse(out.trim()) as T;
}

const itemNode = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);

test.describe("Undo all, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_ASSISTANT_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_ASSISTANT_LOCAL=1",
  );

  test("undoes an Assistant reply from the Chat, shows the undo in the history, and redoes it from there", async ({
    page,
    signIn,
  }, testInfo) => {
    test.setTimeout(120_000);
    await signIn();
    await page.goto("/events");
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    const eventId = convexRun<string>("canvas:seedLocalCheck", {
      email: ownerEmail(),
      items: 0,
    });
    await page.goto(`/events/${eventId}`);
    await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
      timeout: 20_000,
    });
    const { noteId } = convexRun<{ noteId: string; messageId: string }>(
      "assistant/tools/core:webAnswerForLocalCheck",
      { eventId, email: ownerEmail() },
    );
    await expect(itemNode(page, noteId)).toBeVisible({ timeout: 10_000 });

    // The reply that added the Note offers Undo all.
    const chat = page.locator("[data-chat]");
    const undoAll = chat.getByRole("button", { name: /^Undo all/ });
    await expect(undoAll).toBeVisible({ timeout: 10_000 });
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("chat-desktop.png") });

    await undoAll.click();
    await expect(chat.getByRole("status")).toContainText("Undid 1 of 1.");
    await expect(itemNode(page, noteId)).toHaveCount(0, { timeout: 10_000 });
    // Nothing is left to undo, so the button gives way to "Undone".
    await expect(undoAll).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("chat-undone-desktop.png"),
    });

    // The history shows the undo as its own group, by the Member.
    await page.getByRole("button", { name: "History" }).click();
    const panel = page.getByRole("dialog", { name: "Edit history" });
    const undoGroup = panel
      .locator("li")
      .filter({ hasText: /: Undo all of .*\(1 change\)/ })
      .first();
    await expect(undoGroup).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("Undone")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("history-desktop.png") });

    // Undoing the undo brings the Note back.
    await undoGroup.getByRole("button", { name: /^Undo all/ }).click();
    await expect(panel.getByRole("status")).toContainText("Undid 1 of 1.");
    await page.keyboard.press("Escape");
    await expect(itemNode(page, noteId)).toBeVisible({ timeout: 10_000 });

    // On a phone the redone reply offers Undo all again under it in the
    // Chat, and the history (in the header's menu) shows both groups.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(undoAll).toBeVisible({ timeout: 10_000 });
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("chat-390.png") });
    await page.getByRole("button", { name: /^More/ }).click();
    await page.getByRole("menuitem", { name: "History" }).click();
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /^Undo all/ }).first(),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath("history-390.png") });
  });
});
