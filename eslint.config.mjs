import convexPlugin from "@convex-dev/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Matches a hex colour such as #fff, #FFF2C8 or #333A8380 inside a string.
const HEX_COLOUR =
  "/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/";
const HEX_MESSAGE =
  "Use a semantic colour token (app/globals.css) instead of a raw hex colour (IMPLEMENTATION_PLAN.md section 7.4).";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...convexPlugin.configs.recommended,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${HEX_COLOUR}]`, message: HEX_MESSAGE },
        {
          selector: `TemplateElement[value.raw=${HEX_COLOUR}]`,
          message: HEX_MESSAGE,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "convex/_generated/**",
    ".agents/**",
    ".claude/**",
    ".screenshots/**",
  ]),
]);
