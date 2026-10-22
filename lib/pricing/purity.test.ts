import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { referenceTable } from "./table";

const here = fileURLToPath(new URL("./", import.meta.url));
const sources = readdirSync(here).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);

describe("lib/pricing runs in Convex and in the browser", () => {
  it.each(sources)("%s has no Convex or React runtime import", (name) => {
    const text = readFileSync(here + name, "utf8");
    // Type-only imports are erased, so they don't tie the code to a runtime.
    const runtimeImports = [
      ...text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+"([^"]+)"/gms),
    ].map((m) => m[1]);
    for (const source of runtimeImports) {
      expect(source).not.toMatch(/^(convex|react|next)(\/|$)/);
      expect(source).not.toMatch(/_generated/);
    }
  });
});

describe("a Listed price feeds a row only in the row's unit", () => {
  it.each(Object.entries(referenceTable))("%s", (_key, row) => {
    for (const feed of row.feeds) expect(feed.unit).toBe(row.unit);
  });
});
