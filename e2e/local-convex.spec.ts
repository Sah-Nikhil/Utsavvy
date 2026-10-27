import { expect, test } from "@playwright/test";
import { convexLocal, localDeploymentProblem } from "./local-convex";

/**
 * The guard in front of the Convex CLI calls some specs make to seed data
 * (review of #119, M2): they may only ever run against a local backend.
 * Pure checks, no browser.
 */

test.describe("localDeploymentProblem", () => {
  test("accepts a local or anonymous deployment", () => {
    expect(
      localDeploymentProblem({
        CONVEX_DEPLOYMENT:
          "local:local-sah_nikhil-utsavvy-4613 # team: sah-nikhil, project: utsavvy",
      }),
    ).toBeNull();
    expect(
      localDeploymentProblem({
        CONVEX_DEPLOYMENT: "anonymous:anonymous-utsavvy",
      }),
    ).toBeNull();
  });

  test("accepts a local backend URL when no deployment is named", () => {
    expect(
      localDeploymentProblem({
        NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      }),
    ).toBeNull();
    expect(
      localDeploymentProblem({ CONVEX_URL: "http://localhost:3250" }),
    ).toBeNull();
  });

  test("refuses a cloud dev or production deployment, even with a local URL beside it", () => {
    expect(
      localDeploymentProblem({ CONVEX_DEPLOYMENT: "dev:adjoining-cod-123" }),
    ).toMatch(/dev:adjoining-cod-123/);
    expect(
      localDeploymentProblem({
        CONVEX_DEPLOYMENT: "prod:veracious-shark-534",
        NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      }),
    ).not.toBeNull();
  });

  test("refuses a cloud URL, a deploy key, and nothing at all", () => {
    expect(
      localDeploymentProblem({
        NEXT_PUBLIC_CONVEX_URL: "https://adjoining-cod-123.convex.cloud",
      }),
    ).not.toBeNull();
    expect(
      localDeploymentProblem({
        CONVEX_DEPLOYMENT: "local:local-x",
        CONVEX_DEPLOY_KEY: "preview:secret",
      }),
    ).toMatch(/CONVEX_DEPLOY_KEY/);
    expect(localDeploymentProblem({})).not.toBeNull();
  });
});

test.describe("convexLocal", () => {
  test("refuses to run anything against a cloud deployment", () => {
    expect(() =>
      convexLocal(["run", "demo:reset", "{}"], {
        CONVEX_DEPLOYMENT: "prod:veracious-shark-534",
      }),
    ).toThrow(/local/);
  });

  test("throws when the CLI exits with an error", () => {
    expect(() =>
      convexLocal(["no-such-command"], {
        ...process.env,
        CONVEX_DEPLOYMENT: "local:local-x",
      }),
    ).toThrow();
  });
});
