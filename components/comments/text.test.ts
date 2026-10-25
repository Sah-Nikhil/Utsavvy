import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { commentErrorText } from "./CommentComposer";
import { isBlankComment } from "./text";

describe("isBlankComment", () => {
  it("is blank for whitespace and invisible characters only", () => {
    for (const body of ["", "  ", "\n\t", "​", "‌‍", "﻿", " ⁠ ​ "])
      expect(isBlankComment(body), JSON.stringify(body)).toBe(true);
  });

  it("is not blank for real text, including the joiners Hindi needs", () => {
    for (const body of ["ok", "क्‍ष", "किसी‌ने", "​hi"])
      expect(isBlankComment(body), JSON.stringify(body)).toBe(false);
  });
});

describe("commentErrorText", () => {
  it("says which limit a full Item hit", () => {
    const text = commentErrorText(
      new ConvexError({ kind: "CommentRefused", problem: "tooMany" }),
    );
    expect(text).toContain("500 Comments");
    expect(text).not.toMatch(/resolve/i);
  });
});
