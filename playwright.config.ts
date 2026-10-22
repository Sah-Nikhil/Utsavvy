import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (IMPLEMENTATION_PLAN.md section 8). In CI they run against the
 * PR's Vercel preview (PLAYWRIGHT_BASE_URL), sending Vercel's protection bypass
 * header. Locally they run against `bun run dev` on port 3000 unless
 * PLAYWRIGHT_BASE_URL points elsewhere; start the dev server first.
 */
// Locally, read .env.local (Clerk keys and the e2e user); CI passes secrets as env.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: CI, or a fresh clone.
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: bypass
      ? {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "samesitenone",
        }
      : undefined,
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
