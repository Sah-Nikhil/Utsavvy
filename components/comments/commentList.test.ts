import { describe, expect, it } from "vitest";
import { readCommentList } from "./ItemComments";

describe("readCommentList", () => {
  it("turns a failed Comments query into a quiet failure, not a throw", () => {
    expect(readCommentList(new Error("boom"))).toEqual({
      comments: undefined,
      failed: true,
    });
  });

  it("passes loading and loaded results through", () => {
    expect(readCommentList(undefined)).toEqual({
      comments: undefined,
      failed: false,
    });
    expect(readCommentList([])).toEqual({ comments: [], failed: false });
  });
});
