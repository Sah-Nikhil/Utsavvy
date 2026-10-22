import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Scripted Assistant cases (IMPLEMENTATION_PLAN.md section 8). They call the real
// model against a dedicated Convex dev deployment, so they run only through
// `bun run eval`, never in CI.
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    testTimeout: 180_000,
    passWithNoTests: true,
  },
});
