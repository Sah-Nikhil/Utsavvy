import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

function runsClerk(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe("the proxy (Clerk's middleware)", () => {
  it.each([
    "/embed/pinterest?url=https%3A%2F%2Fwww.pinterest.com%2Fpin%2F1%2F",
    "/embed/instagram?url=https%3A%2F%2Fwww.instagram.com%2Fp%2Fx%2F",
    "/embed/pinterest",
  ])("leaves the isolated embed page %s alone", (url) => {
    expect(runsClerk(url)).toBe(false);
  });

  it.each([
    "/events/some-event",
    "/events/report.png",
    "/join/abc.css",
    "/settings/x.js",
    "/",
    "/sign-in",
    // Any other path under /embed renders the app's own 404, which uses Clerk.
    "/embed/elsewhere",
  ])("runs on %s", (url) => {
    expect(runsClerk(url)).toBe(true);
  });
});
