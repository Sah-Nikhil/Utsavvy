import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Runs once in Playwright's main process, before any worker starts, so the
 * Clerk testing token it fetches (CLERK_FAPI, CLERK_TESTING_TOKEN) reaches
 * every worker. Needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.
 */
export default async function globalSetup() {
  await clerkSetup();
}
