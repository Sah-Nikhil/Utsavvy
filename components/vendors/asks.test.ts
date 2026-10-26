import { describe, expect, it } from "vitest";
import { asksForStatus, asksToShortlist, type AskTarget } from "./asks";

// IMPLEMENTATION_PLAN.md section 6: shortlistVendor and setVendorStatus run
// only when the Member's own message asked for that change, to that Vendor.
// When in doubt the answer is no, because the Assistant can always suggest it
// in its reply. The request must name the Vendor, its category, or a card
// just shown ("the second one"), in the same sentence as the verb.

/** M L Caterers, second of four caterer cards just shown. */
const ML: AskTarget = {
  name: "M L Caterers",
  category: "caterer",
  cardPosition: 2,
  cardCount: 4,
  entryLabel: "Caterer",
};
/** Rood Mahal, not on any card. */
const ROOD: AskTarget = {
  name: "Rood Mahal",
  category: "venue",
  cardPosition: null,
  cardCount: 0,
  entryLabel: "Venue",
};
/** The only card just shown. */
const ONLY: AskTarget = { ...ML, cardPosition: 1, cardCount: 1 };

describe("asksToShortlist", () => {
  it.each([
    ["add the second one", ML],
    ["Add Rood Mahal to the Canvas", ROOD],
    ["shortlist M L Caterers for the sangeet", ML],
    ["can you add the second caterer?", ML],
    ["please save that one", ONLY],
    ["let's go with the second one", ML],
    ["add the caterer", ML],
    ["दूसरा वाला जोड़ दो", ML],
  ] as const)("is a request: %s", (text, target) => {
    expect(asksToShortlist(text, target)).toBe(true);
  });

  it.each([
    ["which caterer is cheapest?", ML],
    ["show me caterers for the sangeet", ML],
    ["what does the second one charge?", ML],
    ["don't add any of them yet", ML],
    ["is Rood Mahal big enough for 300 Guests?", ROOD],
    ["", ML],
    // Review of #122, High 1: a verb for something else is not a request.
    ["Keep the budget under ₹5L. Which caterer is cheapest?", ML],
    ["Add a mehendi Function. Which caterer is cheapest?", ML],
    // The request names another card or Vendor than the one being added.
    ["add the third one", ML],
    ["add Vinayak", ML],
    ["add the venue", ML],
    // "that one" is ambiguous when several cards were shown.
    ["please save that one", ML],
  ] as const)("is not a request: %s", (text, target) => {
    expect(asksToShortlist(text, target)).toBe(false);
  });
});

describe("asksForStatus", () => {
  it.each([
    ["mark the caterer booked", "booked", ML],
    ["We booked Rood Mahal!", "booked", ROOD],
    ["we called M L Caterers today", "contacted", ML],
    ["mark M L Caterers as contacted", "contacted", ML],
    ["drop the caterer", "dropped", ML],
    ["the caterer sent a quote, mark it quoted", "quoted", ML],
    ["move Rood Mahal back to considering", "considering", ROOD],
    ["mark the second one booked", "booked", ML],
  ] as const)("%s asks for %s", (text, status, target) => {
    expect(asksForStatus(text, status, target)).toBe(true);
  });

  it.each([
    ["which caterer is cheapest?", "booked", ML],
    ["mark the caterer contacted", "booked", ML],
    ["should we book Rood Mahal?", "booked", ROOD],
    ["don't drop the caterer", "dropped", ML],
    ["show me caterers for the sangeet", "considering", ML],
    // Review of #122, High 1: the status word is about something else.
    ["We booked flight tickets. Which caterer is cheapest?", "booked", ML],
    ["I called Mum about the dates", "contacted", ML],
    ["we booked the photographer", "booked", ML],
    ["mark the third one booked", "booked", ML],
  ] as const)("%s does not ask for %s", (text, status, target) => {
    expect(asksForStatus(text, status, target)).toBe(false);
  });
});
