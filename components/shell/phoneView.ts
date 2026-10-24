/*
 * The phone workspace's view state (S16): the Chat is the main view, the
 * Canvas tab shows Compact mode. A reference tapped in the Chat follows the
 * person's mobile pointing (their own setting, else the Event default):
 * "jump" goes to the Canvas tab with the Item highlighted and a "Back to Chat"
 * button; "sheet" previews the Item in a sheet over the Chat.
 */

export type MobilePointing = "jump" | "sheet";

/** What a reference points at: an Item, or something on it. Only `itemId` decides where to go. */
export type PhoneTarget = { kind: string; itemId: string };

export type PhoneView = {
  tab: "chat" | "canvas";
  /** The Item to scroll to and highlight on the Canvas tab. */
  focus: PhoneTarget | null;
  /** The Canvas tab was opened from a reference, so it offers "Back to Chat". */
  backToChat: boolean;
  /** The Item previewed in a sheet over the Chat. */
  sheet: PhoneTarget | null;
};

export type PhoneViewAction =
  | { type: "reference"; target: PhoneTarget; pointing: MobilePointing }
  | { type: "tab"; tab: PhoneView["tab"] }
  | { type: "backToChat" }
  | { type: "closeSheet" }
  | { type: "openSheetOnCanvas" };

export const initialPhoneView: PhoneView = {
  tab: "chat",
  focus: null,
  backToChat: false,
  sheet: null,
};

function jumpTo(target: PhoneTarget): PhoneView {
  return { tab: "canvas", focus: target, backToChat: true, sheet: null };
}

export function phoneView(
  state: PhoneView,
  action: PhoneViewAction,
): PhoneView {
  switch (action.type) {
    case "reference":
      return action.pointing === "jump"
        ? jumpTo(action.target)
        : { ...initialPhoneView, sheet: action.target };
    case "tab":
      return action.tab === "chat"
        ? initialPhoneView
        : { ...state, tab: "canvas", backToChat: false, sheet: null };
    case "backToChat":
    case "closeSheet":
      return initialPhoneView;
    case "openSheetOnCanvas":
      return state.sheet ? jumpTo(state.sheet) : state;
  }
}
