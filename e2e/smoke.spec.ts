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
    // /embed/pinterest keeps an opaque origin even when opened directly; one
    // policy only, so the sandbox replaces rather than adds to the /embed one.
    const pinterestPolicies = embed
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "content-security-policy");
    expect(pinterestPolicies).toHaveLength(1);
    expect(pinterestPolicies[0]!.value).toMatch(
      /; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox$/,
    );
    const instagram = await request.get("/embed/instagram");
    expect(instagram.headers()["content-security-policy"]).toContain(
      "https://www.instagram.com",
    );
    expect(instagram.headers()["content-security-policy"]).not.toContain(
      "sandbox",
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

  test("a signed-out visit to /embed/* gets the page without Clerk's handshake", async ({
    page,
  }) => {
    // Clerk's handshake is a navigation through *.clerk.accounts.dev.
    const clerkRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        /\.clerk\.accounts\.dev$/.test(new URL(request.url()).hostname)
      )
        clerkRequests.push(request.url());
    });
    const path = `/embed/pinterest?url=${encodeURIComponent("https://pin.it/AbC123")}`;
    const response = await page.goto(path);
    // X2's references spec checks the page itself (it arrives with #56); this
    // checks only that the proxy lets the request straight through.
    // Every hop stays on our origin. (On a preview, Vercel's protection bypass
    // may redirect once to the same URL to set its cookie.)
    const hops: string[] = [];
    for (
      let request = response?.request() ?? null;
      request !== null;
      request = request.redirectedFrom()
    )
      hops.push(new URL(request.url()).origin);
    expect(new Set(hops)).toEqual(new Set([new URL(page.url()).origin]));
    expect(new URL(page.url()).pathname).toBe("/embed/pinterest");
    expect(clerkRequests).toEqual([]);
  });

  for (const path of [
    "/events/some-event",
    // A dotted ID must not slip past the proxy's static-file exclusion.
    "/events/report.png",
    "/join/abc.css",
    "/settings/x.js",
  ]) {
    test(`a signed-out visit to ${path} redirects to sign-in`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }

  test("a signed-in person reaches /events and the workspace shell", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    const accountErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Convex/.test(message.text()))
        accountErrors.push(message.text());
    });
    await signIn();
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Your Events" }),
    ).toBeVisible();
    // Clerk -> Convex: ensureMe made the users row with the Clerk token, and an
    // authenticated query (users.me) reads it back.
    await expect(page.locator("[data-account-ready]")).toBeVisible({
      timeout: 20_000,
    });
    expect(accountErrors).toEqual([]);
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
