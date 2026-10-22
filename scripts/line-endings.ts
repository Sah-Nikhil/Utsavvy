/**
 * Read-only check that every tracked text file uses LF line endings, in the
 * index and in the working tree (CLAUDE.md, ADR 0006). Files that
 * `.gitattributes` marks `eol=crlf` (`*.cmd`, `*.bat`) and binary files are
 * skipped. Prettier only covers the files it formats; this covers the rest,
 * Markdown and `docs/` included, without rewriting anything.
 */

export type LineEndingProblem = {
  path: string;
  where: "index" | "working tree";
  eol: string;
};

/**
 * Parses `git ls-files -z --eol` output. Each entry looks like
 * "i/lf    w/crlf  attr/text=auto eol=lf \t<path>", entries end with NUL.
 */
export function lineEndingProblems(lsFilesEol: string): LineEndingProblem[] {
  const problems: LineEndingProblem[] = [];
  for (const entry of lsFilesEol.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const [index = "", worktree = "", ...attr] = entry
      .slice(0, tab)
      .trim()
      .split(/\s+/);
    const path = entry.slice(tab + 1);
    if (attr.join(" ").includes("eol=crlf")) continue;
    for (const [where, info] of [
      ["index", index],
      ["working tree", worktree],
    ] as const) {
      const eol = info.slice(2);
      if (eol === "crlf" || eol === "mixed")
        problems.push({ path, where, eol });
    }
  }
  return problems;
}
