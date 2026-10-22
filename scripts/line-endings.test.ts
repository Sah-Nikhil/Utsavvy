import { describe, expect, it } from "vitest";
import { lineEndingProblems } from "./line-endings";

const entry = (index: string, worktree: string, attr: string, path: string) =>
  `i/${index}    w/${worktree}    attr/${attr} \t${path}\0`;

describe("lineEndingProblems", () => {
  it("passes LF files, including Markdown under docs/", () => {
    expect(
      lineEndingProblems(
        entry("lf", "lf", "text=auto eol=lf", "docs/adr/0006.md") +
          entry("lf", "lf", "text=auto eol=lf", "app/page.tsx"),
      ),
    ).toEqual([]);
  });

  it("flags CRLF or mixed endings in the index or the working tree", () => {
    expect(
      lineEndingProblems(
        entry("crlf", "crlf", "text=auto eol=lf", "README.md") +
          entry("lf", "crlf", "text=auto eol=lf", "docs/notes.md") +
          entry("mixed", "lf", "text=auto eol=lf", "lib/a.ts"),
      ),
    ).toEqual([
      { path: "README.md", where: "index", eol: "crlf" },
      { path: "README.md", where: "working tree", eol: "crlf" },
      { path: "docs/notes.md", where: "working tree", eol: "crlf" },
      { path: "lib/a.ts", where: "index", eol: "mixed" },
    ]);
  });

  it("skips files .gitattributes keeps as CRLF, and binary files", () => {
    expect(
      lineEndingProblems(
        entry("crlf", "crlf", "text eol=crlf", "scripts/setup.cmd") +
          entry("crlf", "crlf", "text eol=crlf", "run.bat") +
          entry("-text", "-text", "-text", "public/logo.png"),
      ),
    ).toEqual([]);
  });

  it("handles paths with spaces and a file deleted from the working tree", () => {
    expect(
      lineEndingProblems(
        entry("crlf", "", "text=auto eol=lf", "docs/My notes.md"),
      ),
    ).toEqual([{ path: "docs/My notes.md", where: "index", eol: "crlf" }]);
  });
});
