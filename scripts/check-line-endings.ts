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
    `\n${problems.length} file(s) need LF line endings.\n` +
      "Working tree only (checked out before .gitattributes existed, or by an" +
      " older Git with core.autocrlf=true): for a file with no local changes," +
      " delete it and run `git checkout -- <file>`.\n" +
      "In the index: convert the file to LF and stage it again.",
  );
  process.exit(1);
}
