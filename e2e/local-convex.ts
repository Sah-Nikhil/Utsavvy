import { execFileSync } from "node:child_process";

/**
 * The Convex CLI, for specs that seed data or change settings before they
 * test, and only ever against a local backend (review of #119, M2). The CLI
 * targets whatever deployment `.env.local` selects, so a spec run while it
 * points at the cloud dev deployment would otherwise change that deployment.
 */

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** The first word of a setting, without an inline `# team: ...` comment. */
function firstWord(value: string | undefined): string {
  return (value ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Why the Convex CLI would not be talking to a local backend, or null when it
 * would: `CONVEX_DEPLOYMENT` starting `local:` or `anonymous:`, or, with no
 * deployment named, a Convex URL on 127.0.0.1 or localhost. A deploy key
 * always points at a cloud deployment.
 */
export function localDeploymentProblem(env: Env): string | null {
  if (firstWord(env.CONVEX_DEPLOY_KEY) !== "") {
    return "CONVEX_DEPLOY_KEY is set, which points the Convex CLI at a cloud deployment.";
  }
  const deployment = firstWord(env.CONVEX_DEPLOYMENT);
  if (deployment !== "") {
    return deployment.startsWith("local:") ||
      deployment.startsWith("anonymous:")
      ? null
      : `CONVEX_DEPLOYMENT is ${deployment}, not a local deployment.`;
  }
  const url =
    firstWord(env.CONVEX_URL) || firstWord(env.NEXT_PUBLIC_CONVEX_URL);
  if (url === "") return "No Convex deployment or URL is set.";
  try {
    if (LOCAL_HOSTS.has(new URL(url).hostname)) return null;
  } catch {
    // Not a URL: refused below.
  }
  return `The Convex URL ${url} is not a local backend.`;
}

/**
 * Runs the Convex CLI's own script with Node, so no shell mangles JSON
 * arguments. Refuses unless the deployment is local, and throws on any
 * non-zero exit, so a failed seed or reset fails the spec instead of letting
 * it pass on data left from an earlier run.
 */
export function convexLocal(args: string[], env: Env = process.env): string {
  const problem = localDeploymentProblem(env);
  if (problem !== null) {
    throw new Error(
      `Refusing to run "convex ${args.join(" ")}": ${problem} These specs only run against a local backend.`,
    );
  }
  return execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args],
    { encoding: "utf8", env: env as NodeJS.ProcessEnv, stdio: "pipe" },
  );
}
