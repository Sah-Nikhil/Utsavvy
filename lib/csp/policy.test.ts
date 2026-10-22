import { describe, expect, it } from "vitest";
import { embedPolicy, mainPolicy, type CspEnvironment } from "./policy";

const ENVIRONMENTS: CspEnvironment[] = [
  { development: false, vercelPreview: false },
  { development: false, vercelPreview: true },
  { development: true, vercelPreview: false },
];

/** The sources of one directive in a serialised policy. */
function sources(policy: string, directive: string): string[] {
  const entry = policy
    .split("; ")
    .find((part) => part.startsWith(`${directive} `));
  return entry === undefined ? [] : entry.split(" ").slice(1);
}

describe("the /embed policy", () => {
  it.each(ENVIRONMENTS)(
    "lets Pinterest's board avatars and video Pins load (%o)",
    (env) => {
      const policy = embedPolicy(env);
      expect(sources(policy, "img-src")).toContain("https://s.pinimg.com");
      expect(sources(policy, "media-src")).toContain("https://v1.pinimg.com");
    },
  );
});

describe("the main policy", () => {
  it.each(ENVIRONMENTS)("allows no Pinterest host (%o)", (env) => {
    const policy = mainPolicy(env);
    expect(policy).not.toContain("pinimg.com");
    expect(policy).not.toContain("pinterest.com");
  });
});
