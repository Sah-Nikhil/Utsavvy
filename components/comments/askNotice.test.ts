import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { askNotice } from "./askNotice";

describe("askNotice", () => {
  it("says nothing once the question is queued", () => {
    expect(askNotice({ runId: "run1" })).toBeNull();
  });

  it("tells a Viewer the Comment stands, with nothing to retry", () => {
    expect(askNotice({ runId: null })).toEqual({
      text: "Your Comment is posted. Only Members can ask Utsavvy, so it won't answer this one.",
      retry: false,
    });
  });

  it("offers a retry when the question didn't reach Utsavvy, without promising a new Comment", () => {
    const full = askNotice({
      error: new ConvexError({ kind: "TooManyQueued", max: 3 }),
    });
    expect(full).toEqual({
      text: "Your Comment is posted, but you already have 3 questions waiting for Utsavvy. Try again when one is answered.",
      retry: true,
    });
    const dropped = askNotice({ error: new Error("connection lost") });
    expect(dropped?.retry).toBe(true);
    expect(dropped?.text).toBe(
      "Your Comment is posted, but Utsavvy didn't get the question.",
    );
  });
});
