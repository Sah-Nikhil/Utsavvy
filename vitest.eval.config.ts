import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// A live run (EVAL_LIVE=1) spends credits, so its key must come from the shell
// for that one run. Bun loads `.env.local` on every run, so a key kept there
// would make every later live run spend without being asked again.
const envLocal = `${root}.env.local`;
if (
  process.env.EVAL_LIVE === "1" &&
  existsSync(envLocal) &&
  /^\s*ANTHROPIC_API_KEY\s*=/m.test(readFileSync(envLocal, "utf8"))
) {
  throw new Error(
    "Remove ANTHROPIC_API_KEY from .env.local and pass it in the shell: EVAL_LIVE=1 ANTHROPIC_API_KEY=... bun run eval",
  );
}

// Scripted Assistant cases (IMPLEMENTATION_PLAN.md section 8). They call the real
// model, so they run only through `bun run eval`, never in CI. Convex functions
// run in `convex-test` exactly as in the unit config's "convex" project: the
// edge runtime, with convex-test inlined.
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    testTimeout: 180_000,
    passWithNoTests: true,
  },
});
