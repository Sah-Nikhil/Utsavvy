import { describe, expect, it } from "vitest";
import {
  modelCaption,
  runNotice,
  stopState,
  type RunSummary,
} from "./runState";

const base: RunSummary = {
  _id: "run1" as RunSummary["_id"],
  messageId: "m1",
  status: "running",
  requestedBy: "rohan" as RunSummary["requestedBy"],
  requestedByName: "Rohan",
  stoppedByName: null,
  model: "claude-sonnet-5-5",
  createdAt: 0,
  startedAt: 1_000,
  endedAt: null,
};

describe("runNotice", () => {
  it("tells everyone the next queued message is answered next", () => {
    expect(runNotice({ ...base, status: "queued" }, 0, false)).toEqual({
      tone: "queued",
      text: "Queued: Utsavvy answers this next",
    });
  });

  it("counts the messages ahead of a later queued one", () => {
    expect(runNotice({ ...base, status: "queued" }, 2, false)?.text).toBe(
      "Queued: 2 messages ahead",
    );
  });

  it("names who stopped a reply", () => {
    expect(
      runNotice({ ...base, status: "stopped", stoppedByName: "Aditi" }, 0, true)
        ?.text,
    ).toBe("Stopped by Aditi");
  });

  it("shows a short notice for a failed run with no reply", () => {
    expect(runNotice({ ...base, status: "failed" }, 0, false)).toEqual({
      tone: "problem",
      text: "Utsavvy couldn't answer this time. Try asking again in a moment.",
    });
  });

  it("says a reply that broke partway stopped partway", () => {
    expect(runNotice({ ...base, status: "failed" }, 0, true)?.text).toBe(
      "Utsavvy stopped partway. Ask again for the full answer.",
    );
  });

  it("says nothing for a running or finished reply", () => {
    expect(runNotice(base, 0, true)).toBeNull();
    expect(runNotice({ ...base, status: "done" }, 0, true)).toBeNull();
  });
});

describe("stopState", () => {
  const rohan = { membershipId: "rohan", canPost: true };
  const aditi = { membershipId: "aditi", canPost: true };

  it("lets the asker stop at once", () => {
    expect(stopState(base, rohan, 1_500)).toEqual({
      visible: true,
      allowed: true,
      secondsLeft: 0,
    });
  });

  it("makes other Members wait until 30 seconds have passed", () => {
    expect(stopState(base, aditi, 21_000)).toEqual({
      visible: true,
      allowed: false,
      secondsLeft: 10,
    });
    expect(stopState(base, aditi, 31_000)).toEqual({
      visible: true,
      allowed: true,
      secondsLeft: 0,
    });
  });

  it("gives a Viewer no Stop at all, even after 30 seconds (L7)", () => {
    const papa = { membershipId: "papa", canPost: false };
    expect(stopState(base, papa, 31_000)).toEqual({
      visible: false,
      allowed: false,
      secondsLeft: 0,
    });
  });
});

describe("modelCaption", () => {
  it("shows the model that answered the latest reply", () => {
    expect(modelCaption({ model: "claude-sonnet-5-5", fallback: false })).toBe(
      "claude-sonnet-5-5",
    );
  });

  it("marks the automatic fallback", () => {
    expect(modelCaption({ model: "gemini-3.8-flash", fallback: true })).toBe(
      "gemini-3.8-flash, standing in for Claude",
    );
  });

  it("says nothing has answered yet", () => {
    expect(modelCaption(null)).toBe("No replies yet");
  });
});
