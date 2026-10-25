import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { commentErrorText } from "./CommentComposer";
import { isBlankComment, mentionsAssistant } from "./text";

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

describe("mentionsAssistant", () => {
  it("finds @Utsavvy as a word, in any case and next to punctuation", () => {
    for (const body of [
      "@Utsavvy is this enough?",
      "is this hall big enough, @utsavvy?",
      "@UTSAVVY.",
      "(@Utsavvy) help",
      "पूछो @Utsavvy",
    ])
      expect(mentionsAssistant(body), body).toBe(true);
  });

  it("ignores addresses, longer words and no mention", () => {
    for (const body of [
      "mail hi@utsavvy.in",
      "@Utsavvyfan said so",
      "@utsavvy.in is the site",
      "Utsavvy, help",
      "",
    ])
      expect(mentionsAssistant(body), body).toBe(false);
  });
});
