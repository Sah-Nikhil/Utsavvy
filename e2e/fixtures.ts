import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * A test that collects Content Security Policy violations and signs in the e2e
 * user on demand. Every spec imports `test` and `expect` from here.
 */
type Fixtures = {
  /** CSP violations reported by the browser on this page so far. */
  cspViolations: string[];
  /** Signs in the e2e user (E2E_CLERK_USER_EMAIL). */
  signIn: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  cspViolations: async ({ page }, provide) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/Content Security Policy|Content-Security-Policy/i.test(text))
        violations.push(text);
    });
    await page.exposeFunction("__reportCsp", (text: string) =>
      violations.push(text),
    );
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const w = window as unknown as { __reportCsp?: (text: string) => void };
        w.__reportCsp?.(
          `${event.violatedDirective} blocked ${event.blockedURI}`,
        );
      });
    });
    await provide(violations);
  },
  signIn: async ({ page }, provide) => {
    await provide(async () => {
      const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
      if (!emailAddress) {
        throw new Error("Set E2E_CLERK_USER_EMAIL to sign in.");
      }
      await setupClerkTestingToken({ page });
      await page.goto("/");
      // A sign-in ticket made with CLERK_SECRET_KEY. A password sign-in from a
      // fresh browser stops at Clerk's Client Trust email code
      // (`needs_client_trust`), which a test can't answer.
      await clerk.signIn({ page, emailAddress });
    });
  },
});

export { expect };
export type { Page };
