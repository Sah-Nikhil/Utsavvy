import { execFileSync } from "node:child_process";
import { lineEndingProblems } from "./line-endings";

// Part of `bun run lint`. See scripts/line-endings.ts.
const output = execFileSync("git", ["ls-files", "-z", "--eol"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const problems = lineEndingProblems(output);
if (problems.length > 0) {
  for (const p of problems)
    console.error(
      `${p.path}: ${p.eol.toUpperCase()} line endings in the ${p.where}`,
    );
  console.error(
    `\n${problems.length} file(s) need LF line endings. Working-tree only: run` +
      " `git checkout-index --force -- <file>` on a file with no local changes" +
      " to rewrite it from the index. In the index: convert the file to LF and" +
      " stage it again.",
  );
  process.exit(1);
}
