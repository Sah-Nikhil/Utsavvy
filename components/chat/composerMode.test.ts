import { describe, expect, it } from "vitest";
import { composerMode } from "./composerMode";

describe("the composer's Don't reply switch", () => {
  it("sends to the Members only when Don't reply is on", () => {
    expect(composerMode(false, true)).toMatchObject({
      replies: false,
      dontReply: true,
      dontReplyDisabled: false,
      placeholder: "Message the other Members…",
      note: null,
    });
    expect(composerMode(false, false)).toMatchObject({
      replies: true,
      placeholder: "Ask Utsavvy, or tell the Members…",
    });
  });

  it("is off and says why while a Canvas selection is attached (L12)", () => {
    for (const dontReply of [true, false]) {
      expect(composerMode(true, dontReply)).toEqual({
        replies: true,
        dontReply: false,
        dontReplyDisabled: true,
        placeholder: "Ask Utsavvy about the selection…",
        note: "Utsavvy answers messages that point at the Canvas.",
      });
    }
  });
});
