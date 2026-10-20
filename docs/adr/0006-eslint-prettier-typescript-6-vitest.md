# ESLint and Prettier, TypeScript pinned to 6.0, and Vitest instead of bun test

Code is linted with ESLint (`eslint-config-next` plus the Convex ESLint plugin) and formatted with Prettier. TypeScript is pinned to 6.0, and tests run on Vitest with `convex-test`, even though the project uses bun. Browser tests use Playwright. Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15).

Three choices here look odd without context:

- **TypeScript 6.0, although 7.0 is the `latest` release.** ESLint's TypeScript support (`typescript-eslint` 8.72) requires `typescript` ">=4.8.4 <6.1.0", because TypeScript 7 "does not currently provide the JavaScript compiler API". Move to 7 only once `typescript-eslint` supports it.
- **Vitest, not `bun test`.** Convex's official test library, `convex-test`, runs under Vitest with the `edge-runtime` environment (`@edge-runtime/vm`). Bun's runner is Jest-style and the Convex docs don't cover it.
- **ESLint + Prettier, not Biome.** Next.js 16 removed `next lint`, so we had a free choice. ESLint keeps Next.js's own rules and the Convex plugin. Prettier's check also fails on CRLF line endings, which the build workflow relies on.

## Considered options

- **Biome with TypeScript 7**: faster checks, but it loses Next.js's and Convex's lint rules.
- **TypeScript 7 for type checking only, under an npm alias, next to 6.0 for ESLint**: two TypeScript versions in one repo confuse agents.

## Consequences

`bun test` must never be used: it starts Bun's own runner, not Vitest. Always run `bun run test`.

## Sources

Checked 2026-10-21: npm registry (`typescript-eslint@8.72.0` peer dependencies, `typescript@7.0.2`), [Next.js TypeScript config](https://nextjs.org/docs/app/api-reference/config/typescript), [Next.js ESLint config](https://nextjs.org/docs/app/api-reference/config/eslint), [convex-test](https://docs.convex.dev/testing/convex-test), [bun test](https://bun.com/docs/test).
