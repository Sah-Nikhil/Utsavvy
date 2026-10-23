import { execFileSync } from "node:child_process";
import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test, type Page } from "./fixtures";

/**
 * The Assistant's Canvas tools (S7) as a Member sees them: a web search
 * answer with its citations and "Save as Note", and the Note the Assistant
 * added, pointed at on the Canvas.
 *
 * The stub model (`DEFAULT_MODEL=stub-utsavvy`) never searches or calls a
 * tool, so the reply and its tool calls are seeded through
 * `assistant/tools/core:webAnswerForLocalCheck`, which runs the real
 * `addItem` and `pointAt` tool mutations. It needs a local Convex deployment:
 * set E2E_ASSISTANT_LOCAL=1 against `bun run dev`.
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

test.describe("the Assistant's tools, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_ASSISTANT_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_ASSISTANT_LOCAL=1",
  );

  test("a web search answer shows its citations, saves as a Note, and the Assistant's Note is pointed at", async ({
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

    // The Note the Assistant added is on the Canvas and pointed at.
    await expect(itemNode(page, noteId)).toBeVisible({ timeout: 10_000 });
    await expect(itemNode(page, noteId).locator("[data-pointed]")).toBeVisible({
      timeout: 5_000,
    });

    // The answer shows its two sources, numbered, with their pages' hosts.
    const chat = page.locator("[data-chat]");
    const citations = chat.locator("[data-chat-citations]");
    await expect(citations).toBeVisible({ timeout: 10_000 });
    await expect(citations.getByRole("listitem")).toHaveCount(2);
    await expect(
      citations.getByRole("link", { name: /Wedding menus and per-plate/ }),
    ).toHaveAttribute("href", "https://example.com/pune-caterer-menu");
    await expect(citations).toContainText("example.org");
    await expectNoSeriousA11yViolations(page);

    // Save as Note keeps the answer and its citations on the Canvas.
    const notesBefore = await page.locator('[data-canvas-item="note"]').count();
    await citations.getByRole("button", { name: "Save as Note" }).click();
    await expect(citations.getByText("Saved to Notes")).toBeVisible();
    await expect(page.locator('[data-canvas-item="note"]')).toHaveCount(
      notesBefore + 1,
      { timeout: 10_000 },
    );
    const saved = page
      .locator(".react-flow__node")
      .filter({ hasText: "Pune caterers list about ₹900 to ₹1,600" });
    await expect(saved).toBeVisible();
    await expect(
      saved.getByRole("link", { name: /Wedding menus and per-plate/ }),
    ).toBeVisible();

    expect(cspViolations).toEqual([]);
  });
});
