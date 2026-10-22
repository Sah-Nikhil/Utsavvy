// TEMPORARY (X2 #56 deployed CSP check): runs the real embeds through the
// Paste a link form on the PR preview, attaches screenshots and every CSP
// violation, then fails on purpose so CI uploads the report. Reverted after.
import { expect, test } from "./fixtures";

const CASES = [
  [
    "pin",
    "https://www.pinterest.com/pin/51-haldi-decor-ideas-for-a-beautiful-celebration--845973111266327654/",
  ],
  ["board", "https://www.pinterest.com/umadnair66/haldi/"],
  ["in-pin", "https://in.pinterest.com/pin/317222367521420277/"],
  ["post", "https://www.instagram.com/p/BsOGulcndj-/"],
  ["reel", "https://www.instagram.com/reel/C8CaBfWs1mr/"],
] as const;
const VIEWS = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 900 }],
] as const;

for (const [view, viewport] of VIEWS) {
  for (const [name, url] of CASES) {
    test(`deployed ${name} ${view}`, async ({
      page,
      signIn,
      cspViolations,
    }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await signIn();
      await page.goto("/events/smoke-test-event");
      await page.getByRole("button", { name: "Add Inspiration" }).click();
      const form = page.locator("[data-paste-link]");
      await form.getByLabel("Pinterest or Instagram link").fill(url);
      const frame = form.locator("iframe");
      await expect(frame).toBeAttached();
      await page.waitForTimeout(15_000);
      const box = await frame.boundingBox();
      await frame.scrollIntoViewIfNeeded();
      await info.attach(`${name}-${view}.png`, {
        body: await form.screenshot(),
        contentType: "image/png",
      });
      const scripts = await page
        .locator('script[src*="pinterest"], script[src*="instagram"]')
        .count();
      const result = {
        name,
        view,
        height: box?.height,
        scripts,
        violations: cspViolations,
      };
      console.log(`X2PROBE ${JSON.stringify(result)}`);
      await info.attach(`${name}-${view}.json`, {
        body: JSON.stringify(result, null, 1),
        contentType: "application/json",
      });
      expect("probe", "fails on purpose so CI uploads the report").toBe("done");
    });
  }
}
