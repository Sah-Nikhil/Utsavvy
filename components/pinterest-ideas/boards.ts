import type { EventType } from "@/lib/types/brief";
import seed from "@/seed/pinterest-boards.json";

// S21: the public boards on Utsavvy's own Pinterest account (ADR 0014), one per
// Function or theme. Sah-Nikhil curates them by hand; the seed holds only each
// board's key, label, link, Event types and Function keys.

export type Board = {
  key: string;
  label: string;
  /** `https://www.pinterest.com/<account>/<board>/` */
  url: string;
  eventTypes: EventType[];
  /** The Functions the board is for; empty for a theme board. */
  functionKeys: string[];
};

export const PINTEREST_BOARDS: Board[] = seed as Board[];

export type BoardsEvent = {
  eventType: EventType;
  /** The Event's Functions, in their order. */
  functions: { key: string }[];
};

/**
 * The boards for an Event's type: the chosen Function's first, then those for
 * the Event's other Functions in the Event's order, then the theme boards and
 * the rest in the seed's order.
 */
export function boardsForEvent(
  event: BoardsEvent,
  functionKey?: string | null,
  boards: Board[] = PINTEREST_BOARDS,
): Board[] {
  const order = event.functions.map((fn) => fn.key);
  if (functionKey) order.unshift(functionKey);
  const rank = (board: Board) => {
    const ranks = board.functionKeys
      .map((key) => order.indexOf(key))
      .filter((index) => index >= 0);
    return ranks.length === 0 ? order.length : Math.min(...ranks);
  };
  return boards
    .filter((board) => board.eventTypes.includes(event.eventType))
    .map((board, index) => ({ board, index, rank: rank(board) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ board }) => board);
}
