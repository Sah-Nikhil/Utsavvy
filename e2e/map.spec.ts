import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expectNoSeriousA11yViolations } from "./axe";
import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "./fixtures";

/**
 * The Vendor map (S15): the Vendors Section's "Map" opens Jaipur full screen
 * in Utsavvy's own style, with our own Markers (Shortlisted Vendors by status,
 * the other starter Vendors faint, approximate ones hollow and labelled), the
 * Vendors without an address listed beside it, the map credits, the Function
 * filter, and an approximate Marker moved into place from the keyboard and by
 * dragging.
 *
 * Seeds a local Convex deployment through `canvas:seedLocalCheck`,
 * `entries:seedPlanForLocalCheck` and `map:seedForLocalCheck`: set
 * E2E_MAP_LOCAL=1 against `bun run dev`. E2E_MAP_SHOTS=<dir> also saves the
 * review screenshots (city and street zoom, desktop and 390 px wide).
 */

function ownerEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
  return email;
}

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
  // A function that returns null prints nothing.
  return out.trim() === "" ? "" : (JSON.parse(out.trim()) as string);
}

/** Signs in, makes a Jaipur Event with a small plan and four Shortlisted Vendors, opens its Canvas. */
async function seededEvent(page: Page, signIn: () => Promise<void>) {
  await signIn();
  await page.goto("/events");
  await expect(page.locator("[data-account-ready]")).toBeVisible({
    timeout: 20_000,
  });
  const eventId = convexRun("canvas:seedLocalCheck", {
    email: ownerEmail(),
    items: 3,
  });
  convexRun("entries:seedPlanForLocalCheck", { eventId });
  convexRun("map:seedForLocalCheck", { eventId });
  await page.goto(`/events/${eventId}`);
  await expect(page.locator(".react-flow__node-section")).toHaveCount(4, {
    timeout: 20_000,
  });
  return eventId;
}

/** Opens the map from the Vendors Section: on the Canvas, or in the phone's list. */
async function openMap(page: Page, phone = false) {
  if (phone) {
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav).toBeVisible();
    await nav.getByRole("button", { name: "Canvas" }).click();
  }
  await page.getByRole("button", { name: "Map", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Vendors on the map" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-map-ready] canvas")).toBeVisible({
    timeout: 20_000,
  });
  return sheet;
}

test.describe("the Vendor map, seeded on a local deployment", () => {
  test.skip(
    process.env.E2E_MAP_LOCAL !== "1",
    "Seeds a local Convex deployment; set E2E_MAP_LOCAL=1",
  );

  test("shows Jaipur in our own style with our own Markers, filters by Function and moves an approximate Marker", async ({
    page,
    signIn,
    cspViolations,
  }) => {
    test.setTimeout(180_000);
    await seededEvent(page, signIn);
    const sheet = await openMap(page);

    // 16 starter Vendors: 14 with a Marker, 2 listed without an address.
    const markers = sheet.locator(".maplibregl-marker");
    await expect(markers).toHaveCount(14);
    // Every Marker is ours, never MapLibre's default pin.
    await expect(
      sheet.locator(".maplibregl-marker [data-marker-tone]"),
    ).toHaveCount(14);
    await expect(sheet.locator('[aria-label="Map marker"]')).toHaveCount(0);
    await expect(
      sheet.locator('.maplibregl-marker [data-marker-tone="booked"]'),
    ).toHaveCount(1);
    await expect(
      sheet.locator('.maplibregl-marker [data-marker-tone="quoted"]'),
    ).toHaveCount(1);
    await expect(
      sheet.locator('.maplibregl-marker [data-marker-tone="other"]'),
    ).toHaveCount(10);
    // Approximate Markers are hollow and say so; Wedding Velvet's is exact.
    const rood = sheet.locator('[data-marker-id][aria-label^="Rood Mahal,"]');
    await expect(rood).toHaveAttribute(
      "aria-label",
      "Rood Mahal, Venue, Quoted, approximate",
    );
    // At city zoom the hollow stamp says it quietly; "approximate" is written
    // under it only on hover or keyboard focus.
    const roodTag = rood.locator("[data-approximate-tag]");
    await expect(roodTag).toBeHidden();
    await rood.hover();
    await expect(roodTag).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(roodTag).toBeHidden();
    // Each status has its own shape, drawn in the list's key too.
    await expect(
      sheet.getByRole("list", { name: "Marker key" }).getByRole("listitem"),
    ).toHaveCount(7);
    await expect(
      sheet.locator('[data-marker-id][aria-label^="Wedding Velvet,"]'),
    ).not.toContainText("approximate");

    // The list draws each Marker as the map does: hollow when approximate.
    const roodRow = sheet
      .locator("[data-list-vendor]")
      .filter({ hasText: "Rood Mahal" });
    await expect(roodRow.locator("[data-approximate]")).toHaveCount(1);
    await expect(
      sheet
        .locator("[data-list-vendor]")
        .filter({ hasText: "Wedding Velvet" })
        .locator("[data-approximate]"),
    ).toHaveCount(0);

    const noAddress = sheet.getByRole("region", { name: "Without an address" });
    await expect(noAddress).toContainText("Vinayak Foods & Catering");
    await expect(noAddress).toContainText("Ganesh Dal Bati Churma");

    // The credits, near the map.
    const credits = sheet.locator(".maplibregl-ctrl-attrib");
    await expect(credits).toContainText("OpenFreeMap");
    await expect(credits).toContainText("OpenMapTiles");
    await expect(credits).toContainText("OpenStreetMap");
    await expect(credits).toContainText("Geoapify");

    // Every Marker is reachable from the list by keyboard.
    const listButtons = sheet.locator("[data-list-vendor]");
    await expect(listButtons).toHaveCount(14);
    const ids = await listButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-list-vendor")),
    );
    for (const id of ids) {
      await sheet.locator(`[data-list-vendor="${id}"]`).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(":focus")).toHaveAttribute(
        "data-marker-id",
        id!,
      );
    }

    await expectNoSeriousA11yViolations(page);

    // The sangeet (300 Guests, catering planned at ₹2,45,000): M L Caterers
    // (from ₹850 a plate, ₹2.55L) is above the line; G.D. Caterer has no
    // comparable price, so it stays, marked "no price".
    await sheet
      .getByRole("group", { name: "Category" })
      .getByRole("button", { name: "Caterers" })
      .click();
    await sheet
      .getByRole("group", { name: "Function" })
      .getByRole("button", { name: /Sangeet/ })
      .click();
    await expect(sheet.locator("[data-list-vendor]")).toHaveCount(1);
    const gd = sheet.locator("[data-list-vendor]").first();
    await expect(gd).toContainText("G.D. Caterer");
    await expect(gd).toContainText("no price");
    await expect(sheet.getByText("M L Caterers")).toHaveCount(0);
    await expect(markers).toHaveCount(1);
    await sheet
      .getByRole("group", { name: "Category" })
      .getByRole("button", { name: "All" })
      .click();
    await sheet
      .getByRole("group", { name: "Function" })
      .getByRole("button", { name: "Any Function" })
      .click();
    await expect(markers).toHaveCount(14);

    // Move Rood Mahal from the keyboard: arrows, then Enter saves it.
    await sheet
      .locator("[data-list-vendor]")
      .filter({ hasText: "Rood Mahal" })
      .click();
    await expect(rood).toBeFocused();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowUp");
    await page.keyboard.press("Enter");
    await expect(rood).toHaveAttribute(
      "aria-label",
      "Rood Mahal, Venue, Quoted",
    );
    await expect(rood).not.toContainText("approximate");

    // Drag Umaid Haveli into place with the mouse.
    const umaid = sheet.locator(
      '[data-marker-id][aria-label^="Umaid Haveli,"]',
    );
    await sheet
      .locator("[data-list-vendor]")
      .filter({ hasText: "Umaid Haveli" })
      .click();
    await page.waitForTimeout(900); // the fly-to
    const box = (await umaid.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 50, { steps: 8 });
    await page.mouse.up();
    await expect(umaid).toHaveAttribute(
      "aria-label",
      "Umaid Haveli, Venue, Considering",
    );

    // Selecting a Marker: the petals bloom and pool into it, then a ring
    // comes around it, solid for an exact Marker (Umaid Haveli, just moved)
    // and dotted for an approximate one.
    const opacity = (el: ReturnType<typeof sheet.locator>) =>
      el.evaluate((node) => getComputedStyle(node).opacity);
    const selected = sheet.locator('[data-marker-id][aria-pressed="true"]');
    await expect(selected).toHaveAttribute("aria-label", /^Umaid Haveli,/);
    const petals = selected.locator('[data-ornament="petals"]');
    await expect
      .poll(() => petals.evaluate((n) => getComputedStyle(n).animationName))
      .toBe("stamp-petals");
    const ring = selected.locator("[data-selection-ring]");
    await expect(ring).toHaveAttribute("data-selection-ring", "solid");
    await expect.poll(() => opacity(ring)).toBe("1");
    await sheet
      .locator("[data-list-vendor]")
      .filter({ hasText: "Harika Bagh" })
      .click();
    await expect(selected).toHaveAttribute("aria-label", /^Harika Bagh,/);
    await expect(selected.locator("[data-selection-ring]")).toHaveAttribute(
      "data-selection-ring",
      "dotted",
    );
    await expect
      .poll(() => opacity(selected.locator("[data-selection-ring]")))
      .toBe("1");
    // Deselecting fades Umaid Haveli's ring back out.
    await expect
      .poll(() => opacity(umaid.locator("[data-selection-ring]")))
      .toBe("0");

    // With Ornaments off the petals go, with the prints; the ring, the shape
    // and its colour stay.
    await page.evaluate(() => {
      document.documentElement.dataset.ornaments = "off";
    });
    await expect(selected.locator('[data-ornament="petals"]')).toBeHidden();
    await expect
      .poll(() => opacity(selected.locator("[data-selection-ring]")))
      .toBe("1");
    await expect(selected.locator("[data-stamp-shape]")).toBeVisible();
    await expect(
      sheet.locator('[data-ornament="misregistration"]').first(),
    ).toBeHidden();
    await expect(sheet.locator('[data-ornament="diamond"]')).toBeHidden();
    await expect(sheet.locator(".maplibregl-marker")).toHaveCount(14);
    await expectNoSeriousA11yViolations(page);
    await page.evaluate(() => {
      delete document.documentElement.dataset.ornaments;
    });

    // With reduced motion there are no petals and the ring is there at once.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await sheet
      .locator("[data-list-vendor]")
      .filter({ hasText: "Sapphire Inn" })
      .click();
    await expect(selected).toHaveAttribute("aria-label", /^Sapphire Inn,/);
    await expect(selected.locator('[data-ornament="petals"]')).toBeHidden();
    expect(await opacity(selected.locator("[data-selection-ring]"))).toBe("1");
    await page.emulateMedia({ reducedMotion: null });

    expect(cspViolations).toEqual([]);
  });

  test("review screenshots: Jaipur at city and street zoom, desktop and phone", async ({
    page,
    signIn,
  }) => {
    const dir = process.env.E2E_MAP_SHOTS;
    test.skip(!dir, "Set E2E_MAP_SHOTS=<dir> to save the review screenshots");
    test.setTimeout(240_000);
    mkdirSync(dir!, { recursive: true });
    await seededEvent(page, signIn);
    const marker = (sheet: Locator, name: string) =>
      sheet.locator(`[data-marker-id][aria-label^="${name},"]`);
    /** Selects a Marker on the map and lets the bloom and ring finish. */
    const select = async (sheet: Locator, name: string) => {
      await marker(sheet, name).click();
      // Off the Marker, so its hover tag doesn't show in the picture.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(900);
    };
    for (const [label, size] of [
      ["desktop", { width: 1440, height: 900 }],
      ["390", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(size);
      const sheet = await openMap(page, label === "390");
      await page.waitForTimeout(3_000); // the tiles
      await page.screenshot({ path: `${dir}/jaipur-city-${label}.png` });
      await select(sheet, "Rood Mahal");
      await page.screenshot({
        path: `${dir}/jaipur-selected-approximate-${label}.png`,
      });
      await select(sheet, "Wedding Velvet");
      await page.screenshot({
        path: `${dir}/jaipur-selected-exact-${label}.png`,
      });
      await sheet
        .locator("[data-list-vendor]")
        .filter({ hasText: "Rood Mahal" })
        .click();
      await page.waitForTimeout(800);
      await sheet.getByRole("button", { name: "Zoom in" }).click();
      await page.mouse.move(2, 2);
      await page.waitForTimeout(3_000);
      await page.screenshot({ path: `${dir}/jaipur-street-${label}.png` });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }

    // The selection, frozen at three moments: petals blooming, pooling into
    // the stamp, and the dotted ring in place.
    await page.setViewportSize({ width: 1440, height: 900 });
    // Let the workspace switch back from the phone layout first.
    await expect(
      page.getByRole("navigation", { name: "Workspace" }),
    ).toBeHidden();
    await page.waitForTimeout(800);
    let sheet = await openMap(page);
    await page.waitForTimeout(3_000);
    const rood = marker(sheet, "Rood Mahal");
    const box = (await rood.boundingBox())!;
    const clip = {
      x: box.x + box.width / 2 - 70,
      y: box.y + box.height / 2 - 70,
      width: 140,
      height: 140,
    };
    await rood.click();
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.pause()),
    );
    await page.mouse.move(2, 2);
    for (const [n, ms] of [
      [1, 200],
      [2, 420],
      [3, 900],
    ] as const) {
      await page.evaluate((t) => {
        for (const a of document.getAnimations()) a.currentTime = t;
      }, ms);
      await page.screenshot({ path: `${dir}/anim-${n}-${ms}ms.png`, clip });
    }
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.play()),
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // The same view with the Ornaments setting off: flat colours and shapes,
    // and the ring without petals.
    await page.evaluate(() => {
      document.documentElement.dataset.ornaments = "off";
    });
    sheet = await openMap(page);
    await page.waitForTimeout(3_000);
    await select(sheet, "Rood Mahal");
    await page.screenshot({ path: `${dir}/jaipur-ornaments-off-desktop.png` });
  });
});
