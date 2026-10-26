/*
 * Whether a Member's own message asks for a Vendor change (IMPLEMENTATION_PLAN.md
 * section 6): `shortlistVendor` and `setVendorStatus` have no Proposal op, so
 * they run only when the message asked for that change. When in doubt the
 * answer is no; the Assistant then suggests the change in its reply and a
 * Member makes it with a tap. Pure, so Convex and its tests share it.
 */

export type VendorLinkStatus =
  "considering" | "contacted" | "quoted" | "booked" | "dropped";

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

/** One sentence carries the change: it has a verb for it and isn't a question about something, or a "don't". */
function asksIn(text: string, verb: RegExp): boolean {
  return sentences(text).some(
    (sentence) =>
      verb.test(sentence) &&
      !NEGATION.test(sentence) &&
      !ASKING_ABOUT.test(sentence),
  );
}

const SHORTLIST_VERB =
  /\b(add|shortlist|save|keep|put|go with|take|choose|pick|select)\b|जोड़|डाल|रख/i;

/** "add the second one", "shortlist M L Caterers"; not "which caterer is cheapest?". */
export function asksToShortlist(text: string): boolean {
  return asksIn(text, SHORTLIST_VERB);
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
 * Whether the message asks to set a link to `status`: it names that status
 * (or a word for it, such as "we called them" for Contacted) in a sentence
 * that isn't a question about something or a "don't".
 */
export function asksForStatus(text: string, status: VendorLinkStatus): boolean {
  return asksIn(text, STATUS_WORDS[status]);
}
