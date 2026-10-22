import { expectNoSeriousA11yViolations } from "./axe";
import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("every response carries the Content Security Policy and no strict Referrer-Policy", async ({
    request,
  }) => {
    for (const path of ["/", "/sign-in", "/terms"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBeLessThan(400);
      const csp = response.headers()["content-security-policy"];
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("wss://*.convex.cloud");
      expect(csp, path).not.toContain("pinterest");
      const referrer = response.headers()["referrer-policy"];
      expect([undefined, "strict-origin-when-cross-origin"], path).toContain(
        referrer,
      );
    }
    const embed = await request.get("/embed/pinterest");
    expect(embed.headers()["content-security-policy"]).toContain(
      "https://assets.pinterest.com",
    );
  });

  test("the landing renders in the three fonts", async ({
    page,
    cspViolations,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() => {
      const font = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element)
          .fontFamily;
      return {
        display: font("h1"),
        hindi: font("p[lang=hi]"),
        text: font("main p:not([lang])"),
      };
    });
    expect(families.display).toMatch(/Fraunces/i);
    expect(families.hindi).toMatch(/Tiro Devanagari Hindi/i);
    expect(families.text).toMatch(/Anek Devanagari/i);
    await expectNoSeriousA11yViolations(page);
    expect(cspViolations).toEqual([]);
  });

  test("a signed-out visit to /events redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/events/some-event");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a signed-in person reaches /events and the workspace shell", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    await signIn();
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Your Events" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto("/events/smoke-test-event");
    for (const mount of ["banner", "canvas", "chat", "google-places"]) {
      await expect(page.locator(`[data-mount="${mount}"]`)).toBeAttached();
    }
    for (const label of [
      "People",
      "History",
      "Event settings",
      "Add Inspiration",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await page.getByRole("button", { name: "People" }).click();
    await expect(page.locator('[data-mount="people-panel"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expectNoSeriousA11yViolations(page);
    expect(cspViolations).toEqual([]);
  });
});
