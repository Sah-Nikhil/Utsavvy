import { describe, expect, it } from "vitest";
import { seenAt } from "./expiry";

// Review of PR #105, round 2: the card can't wait for the expiry job to close
// a Proposal; it shows it expired, without Accept, from `expiresAt` on.
const view = {
  status: {
    kind: "open" as const,
    text: "Waiting for a Member to accept or reject",
  },
  canDecide: true,
  canAskAgain: false,
  expiresAt: 1_000,
};

describe("seenAt", () => {
  it("shows an open Proposal as open, with Accept, until it expires", () => {
    expect(seenAt(view, 999)).toEqual(view);
  });

  it("shows an open Proposal as expired, without Accept, from its expiry on", () => {
    expect(seenAt(view, 1_000)).toEqual({
      ...view,
      status: { kind: "expired", text: "Expired" },
      canDecide: false,
    });
  });

  it("leaves a closed Proposal's own reason alone", () => {
    const outOfDate = {
      ...view,
      status: { kind: "outOfDate" as const, text: "Out of date" },
      canDecide: false,
      canAskAgain: true,
    };
    expect(seenAt(outOfDate, 5_000)).toEqual(outOfDate);
  });
});
