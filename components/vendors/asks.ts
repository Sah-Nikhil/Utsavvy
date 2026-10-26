/*
 * Whether a Member's own message asks for a Vendor change (IMPLEMENTATION_PLAN.md
 * section 6): `shortlistVendor` and `setVendorStatus` have no Proposal op, so
 * they run only when the message asked for that change, to that Vendor. When
 * in doubt the answer is no; the Assistant then suggests the change in its
 * reply and a Member makes it with a tap. Pure, so Convex and its tests share it.
 *
 * One sentence has to carry both the verb and the Vendor it is about: the
 * Vendor's name, its category ("book the caterer"), its checklist Entry's own
 * label, or its number on the Vendor cards just shown ("add the second one").
 * A verb about something else ("Keep the budget under ₹5L", "We booked flight
 * tickets") is not a request.
 */

export type VendorLinkStatus =
  "considering" | "contacted" | "quoted" | "booked" | "dropped";

/** The Vendor (or link) a tool call would change. */
export type AskTarget = {
  name: string;
  category: string;
  /** Its number on the newest Vendor cards in the Chat, or null when it isn't on them. */
  cardPosition: number | null;
  /** How many Vendors those cards show (0 when there are none). */
  cardCount: number;
  /** For a status: the checklist Entry's label, such as "Caterer" or "Mehendi artist". */
  entryLabel?: string | null;
};

/** A question that asks about something rather than for something. */
const ASKING_ABOUT =
  /^\s*(which|what|how|why|when|where|who|is|are|does|do|did|should|shall)\b/i;
const NEGATION = /\b(don'?t|do not|not|never|no need)\b|मत|नहीं/i;

/** Splits a message into sentences, keeping Hindi's danda as a stop. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।\n])/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Lowercase words only, so "M.L. Caterers" and "m l caterers" compare equal. */
function words(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** Words in a Vendor's name that don't single it out. */
const GENERIC = new Set([
  "the",
  "and",
  "caterer",
  "caterers",
  "catering",
  "food",
  "foods",
  "event",
  "events",
  "group",
  "photography",
  "photographer",
  "studio",
  "hall",
  "banquet",
  "decoration",
  "decorators",
  "decor",
  "flowers",
  "wedding",
  "weddings",
  "jaipur",
]);

function namesVendor(sentence: string, name: string): boolean {
  const said = words(sentence);
  const full = words(name).trim();
  if (full !== "" && said.includes(` ${full} `)) return true;
  return full
    .split(" ")
    .some(
      (token) =>
        token.length >= 4 && !GENERIC.has(token) && said.includes(` ${token} `),
    );
}

const CATEGORY_WORDS: Record<string, RegExp> = {
  venue: /\b(venues?|halls?|lawns?|banquets?)\b/i,
  caterer: /\b(caterers?|catering|food)\b/i,
  decorator: /\b(decorators?|decor|decoration)\b/i,
  photographer: /\b(photographers?|photography|photos?)\b/i,
};

function namesCategory(sentence: string, category: string): boolean {
  return CATEGORY_WORDS[category]?.test(sentence) ?? false;
}

function namesOtherCategory(sentence: string, category: string): boolean {
  return Object.entries(CATEGORY_WORDS).some(
    ([other, pattern]) => other !== category && pattern.test(sentence),
  );
}

function namesEntry(sentence: string, label: string | null | undefined) {
  if (!label) return false;
  const said = words(sentence);
  const full = words(label).trim();
  return full !== "" && said.includes(` ${full} `);
}

const ORDINALS: [RegExp, number][] = [
  [/\b(first|1st)\b|पहल[ाे]/i, 1],
  [/\b(second|2nd)\b|दूसर[ाे]/i, 2],
  [/\b(third|3rd)\b|तीसर[ाे]/i, 3],
  [/\b(fourth|4th)\b|चौथ[ाे]/i, 4],
  [/\b(fifth|5th)\b|पा[ंँ]चव[ाे]/i, 5],
  [/\b(sixth|6th)\b|छठ[ाे]/i, 6],
];

/** The card number a sentence names: "the second one", "#2", "number 2". */
function cardNumberIn(sentence: string): number | null {
  const numbered = /(?:#|\bno\.?\s*|\bnumber\s*)(\d{1,2})\b/i.exec(sentence);
  if (numbered) return Number(numbered[1]);
  for (const [pattern, n] of ORDINALS) if (pattern.test(sentence)) return n;
  return null;
}

/** "that one", "it": only clear when the cards showed one Vendor. */
const POINTING = /\b(that|this|it|them)\b|वह|वो|ये|इसे|उसे/i;

/** Whether the sentence is about the target Vendor. */
function about(sentence: string, target: AskTarget): boolean {
  if (namesVendor(sentence, target.name)) return true;
  if (namesOtherCategory(sentence, target.category)) return false;
  const number = cardNumberIn(sentence);
  if (number !== null) return number === target.cardPosition;
  if (namesCategory(sentence, target.category)) return true;
  if (namesEntry(sentence, target.entryLabel)) return true;
  return (
    target.cardCount === 1 &&
    target.cardPosition === 1 &&
    POINTING.test(sentence)
  );
}

/** One sentence carries the change: the verb, about this Vendor, not a question about something or a "don't". */
function asksIn(text: string, verb: RegExp, target: AskTarget): boolean {
  return sentences(text).some(
    (sentence) =>
      verb.test(sentence) &&
      !NEGATION.test(sentence) &&
      !ASKING_ABOUT.test(sentence) &&
      about(sentence, target),
  );
}

const SHORTLIST_VERB =
  /\b(add|shortlist|save|keep|put|go with|take|choose|pick|select)\b|जोड़|डाल|रख/i;

/** "add the second one", "shortlist M L Caterers"; not "which caterer is cheapest?". */
export function asksToShortlist(text: string, target: AskTarget): boolean {
  return asksIn(text, SHORTLIST_VERB, target);
}

/** Words that ask for each status. */
const STATUS_WORDS: Record<VendorLinkStatus, RegExp> = {
  considering: /\bconsider(ing)?\b/i,
  contacted:
    /\b(contacted|contact|called|call|rang|spoke|messaged|whatsapp(ed)?|emailed|reached out)\b/i,
  quoted: /\b(quoted|quote)\b/i,
  booked: /\b(booked|book|confirmed|finali[sz]ed)\b/i,
  dropped: /\b(drop|dropped|remove|removed|cancel|cancelled|rejected)\b/i,
};

/**
 * Whether the message asks to set this link to `status`: it names that status
 * (or a word for it, such as "we called them" for Contacted) in a sentence
 * about this Vendor that isn't a question about something or a "don't".
 */
export function asksForStatus(
  text: string,
  status: VendorLinkStatus,
  target: AskTarget,
): boolean {
  return asksIn(text, STATUS_WORDS[status], target);
}
