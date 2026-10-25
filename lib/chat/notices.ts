/*
 * A system notice in the Chat can carry a record in its card ID
 * (`chatAnnotations.card.id`). The ID starts with the kind of record, so the
 * Chat acts only on kinds it knows and shows anything else as a plain notice.
 */

const CITY_REPRICE = "cityReprice:";

/** The card ID of the notice for a failed city re-price: its accepted Proposal. */
export function cityRepriceNoticeId(proposalId: string): string {
  return `${CITY_REPRICE}${proposalId}`;
}

/** What a system notice's card ID asks the Chat to offer, or null for a plain notice. */
export type NoticeAction = { kind: "cityReprice"; proposalId: string } | null;

export function noticeAction(cardId: string | null): NoticeAction {
  if (cardId === null || !cardId.startsWith(CITY_REPRICE)) return null;
  const proposalId = cardId.slice(CITY_REPRICE.length);
  return proposalId === "" ? null : { kind: "cityReprice", proposalId };
}
