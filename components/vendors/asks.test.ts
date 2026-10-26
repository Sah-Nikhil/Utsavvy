import { describe, expect, it } from "vitest";
import starterSet from "../../seed/jaipur-vendors.json";
import {
  asksForStatus,
  asksToShortlist,
  namesVendor,
  type AskTarget,
} from "./asks";

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

// Review of #122, round 2: a name reference is the full distinctive name.
const GANESH: AskTarget = {
  name: "Ganesh Dal Bati Churma",
  category: "caterer",
  cardPosition: 4,
  cardCount: 4,
  entryLabel: "Caterer",
};
const VINAYAK: AskTarget = {
  name: "Vinayak Foods & Catering",
  category: "caterer",
  cardPosition: 2,
  cardCount: 4,
  entryLabel: "Caterer",
};
const NAMED_ADD: AskTarget = {
  name: "Add",
  category: "caterer",
  cardPosition: null,
  cardCount: 0,
  entryLabel: "Caterer",
};

describe("name references, deferral and romanized Hindi", () => {
  it.each([
    ["shortlist Ganesh Dal Bati Churma", GANESH],
    ["add Ganesh Dal Bati please", GANESH],
    ["add Vinayak Foods & Catering", VINAYAK],
    ["dusra wala add karo", ML],
    ["doosra vala shortlist kar do", ML],
    ["add card 2", ML],
    ["add #2", ML],
  ] as const)("is a shortlist request: %s", (text, target) => {
    expect(asksToShortlist(text, target)).toBe(true);
  });

  it.each([
    ["Add Ganesh aarti to the Timeline", GANESH],
    ["add Ganesh", GANESH],
    ["add the photographer", NAMED_ADD],
    ["add caterers later", ML],
    ["add the second one later", ML],
    ["kal add karna", ML],
    ["dusra wala baad mein add karna", ML],
    ["teesra wala add karo", ML],
    ["dusra wala mat add karo", ML],
  ] as const)("is not a shortlist request: %s", (text, target) => {
    expect(asksToShortlist(text, target)).toBe(false);
  });

  it("accepts book Vinayak Foods & Catering for the sangeet", () => {
    expect(
      asksForStatus(
        "book Vinayak Foods & Catering for the sangeet",
        "booked",
        VINAYAK,
      ),
    ).toBe(true);
  });

  it("refuses We booked Ganesh aarti for tomorrow", () => {
    expect(
      asksForStatus("We booked Ganesh aarti for tomorrow", "booked", GANESH),
    ).toBe(false);
  });
});

// Review of #122, round 3. Medium 1: initials ("G.D.") don't end a sentence,
// so every starter Vendor's displayed name works. Low 1: one distinctive
// word is enough when everything left off is generic ("Viresh" for Viresh
// Studio), but never a word another name shares, a request word, or one word
// of a longer distinctive name.
const SEED = starterSet as { name: string; category: string }[];
const bare = (name: string, category: string): AskTarget => ({
  name,
  category,
  cardPosition: null,
  cardCount: 0,
  entryLabel: null,
});

describe("starter Vendors by their displayed names", () => {
  it.each(SEED.map((v) => [v.name, v.category]))(
    "add %s is a request for it",
    (name, category) => {
      expect(asksToShortlist(`add ${name}`, bare(name, category))).toBe(true);
    },
  );

  it("book G.D. Caterer asks to book it", () => {
    expect(
      asksForStatus(
        "book G.D. Caterer",
        "booked",
        bare("G.D. Caterer", "caterer"),
      ),
    ).toBe(true);
  });

  it("still splits real sentences: Add the second one. Which is cheapest?", () => {
    expect(asksToShortlist("Which is cheapest? Add it later.", ML)).toBe(false);
  });

  // Round 4: a name reference needs two distinctive words in order, or the
  // whole displayed name. One word ("Viresh") could be about anything:
  // "Add Viresh to the Guest list".
  it.each([
    ["add Viresh Studio", "Viresh Studio", "photographer"],
    ["add Sapphire Inn", "Sapphire Inn", "venue"],
    ["add Umaid Haveli", "Umaid Haveli", "venue"],
    ["add Bhanwar Singh Palace", "Bhanwar Singh Palace", "venue"],
    ["add Bhanwar Singh", "Bhanwar Singh Palace", "venue"],
    ["shortlist Ganesh Dal Bati", "Ganesh Dal Bati Churma", "caterer"],
    [
      "add The Prince Group of Events",
      "The Prince Group of Events",
      "decorator",
    ],
    ["add Prince Group of Events", "The Prince Group of Events", "decorator"],
  ])("%s names %s", (text, name, category) => {
    expect(asksToShortlist(text, bare(name, category))).toBe(true);
  });

  it.each([
    ["add Ganesh", "Ganesh Dal Bati Churma", "caterer"],
    ["add Viresh", "Viresh Studio", "photographer"],
    ["add Sapphire", "Sapphire Inn", "venue"],
    ["add Umaid", "Umaid Haveli", "venue"],
    ["add Vinayak", "Vinayak Foods & Catering", "caterer"],
    ["add Vinayak Foods", "Vinayak Foods & Catering", "caterer"],
    [
      "Add Vinayak aarti to the Timeline",
      "Vinayak Foods & Catering",
      "caterer",
    ],
    ["Add Viresh to the Guest list", "Viresh Studio", "photographer"],
    [
      "Add the prince to the Guest list",
      "The Prince Group of Events",
      "decorator",
    ],
    ["add Candid", "Candid Life Photography", "photographer"],
    ["add Bhanwar", "Bhanwar Singh Palace", "venue"],
    ["add the photographer", "Add", "caterer"],
    ["add it", "Add", "caterer"],
  ])("%s does not name %s", (text, name, category) => {
    expect(asksToShortlist(text, bare(name, category))).toBe(false);
  });

  it("We booked Vinayak for the aarti tomorrow books nothing", () => {
    expect(
      asksForStatus(
        "We booked Vinayak for the aarti tomorrow",
        "booked",
        bare("Vinayak Foods & Catering", "caterer"),
      ),
    ).toBe(false);
  });

  it("no starter Vendor's name names another", () => {
    for (const a of SEED)
      for (const b of SEED)
        if (a !== b)
          expect(
            namesVendor(`add ${a.name}`, b.name),
            `${a.name} → ${b.name}`,
          ).toBe(false);
  });
});
