import { describe, expect, it } from "vitest";
import { cityRepriceNoticeId, noticeAction } from "./notices";

// Review of #118, nit: a system notice's card ID says what kind of record it
// carries, and the Chat acts only on kinds it knows.
describe("noticeAction", () => {
  it("reads a city re-price notice back to its Proposal", () => {
    expect(noticeAction(cityRepriceNoticeId("k17abc"))).toEqual({
      kind: "cityReprice",
      proposalId: "k17abc",
    });
  });

  it.each([[null], ["k17abc"], ["nudge:k17abc"], ["cityReprice:"]])(
    "treats %j as a plain notice",
    (id) => {
      expect(noticeAction(id)).toBeNull();
    },
  );
});
