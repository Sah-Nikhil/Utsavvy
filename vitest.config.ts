import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Always `bun run test`, never `bun test` (ADR 0006): Bun's own runner can't run convex-test.
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
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
