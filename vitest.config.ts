import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Always `bun run test`, never `bun test` (ADR 0006): Bun's own runner can't run convex-test.
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    // 5 s isn't enough when the suite runs beside `next dev` and a local Convex
    // backend on Windows: a cold convex-test import or the stock library's
    // 288-file check can pass it, and the test fails only that once.
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: [
            "convex/**",
            "e2e/**",
            "evals/**",
            "node_modules/**",
            ".next/**",
          ],
          environment: "node",
        },
      },
    ],
  },
});
