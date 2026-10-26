import { describe, expect, it } from "vitest";
import { asksForStatus, asksToShortlist } from "./asks";

// IMPLEMENTATION_PLAN.md section 6: shortlistVendor and setVendorStatus run
// only when the Member's own message asked for that change. When in doubt the
// answer is no, because the Assistant can always suggest it in its reply.

describe("asksToShortlist", () => {
  it.each([
    "add the second one",
    "Add Rood Mahal to the Canvas",
    "shortlist M L Caterers for the sangeet",
    "can you add the first caterer?",
    "please save that one",
    "let's go with the second venue",
    "दूसरा वाला जोड़ दो",
  ])("is a request: %s", (text) => {
    expect(asksToShortlist(text)).toBe(true);
  });

  it.each([
    "which caterer is cheapest?",
    "show me caterers for the sangeet",
    "what does the second one charge?",
    "don't add any of them yet",
    "is Rood Mahal big enough for 300 Guests?",
    "",
  ])("is not a request: %s", (text) => {
    expect(asksToShortlist(text)).toBe(false);
  });
});

describe("asksForStatus", () => {
  it.each([
    ["mark the caterer booked", "booked"],
    ["We booked Rood Mahal!", "booked"],
    ["we called M L Caterers today", "contacted"],
    ["mark Viresh Studio as contacted", "contacted"],
    ["drop the photographer", "dropped"],
    ["the decorator sent a quote, mark it quoted", "quoted"],
    ["move Harika Bagh back to considering", "considering"],
  ] as const)("%s asks for %s", (text, status) => {
    expect(asksForStatus(text, status)).toBe(true);
  });

  it.each([
    ["which caterer is cheapest?", "booked"],
    ["mark the caterer contacted", "booked"],
    ["should we book Rood Mahal?", "booked"],
    ["don't drop the photographer", "dropped"],
    ["show me caterers for the sangeet", "considering"],
  ] as const)("%s does not ask for %s", (text, status) => {
    expect(asksForStatus(text, status)).toBe(false);
  });
});
