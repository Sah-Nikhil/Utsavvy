import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

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
