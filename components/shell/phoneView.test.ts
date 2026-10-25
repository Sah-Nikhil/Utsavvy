import { describe, expect, it } from "vitest";
import { initialPhoneView, phoneView, type PhoneView } from "./phoneView";

// S16 seam (issue #49): on a phone the Chat is the main view and the Canvas tab
// is Compact mode. Tapping a reference in the Chat follows the person's mobile
// pointing (their own setting, else the Event default): "jump" goes to the
// Canvas tab with the Item highlighted and "Back to Chat"; "sheet" opens a
// preview sheet over the Chat.

const budget = { kind: "item", itemId: "budget" } as const;
const mehendiEntry = {
  kind: "entry",
  itemId: "checklist",
  entryId: "mehendi-artist",
} as const;

describe("phoneView", () => {
  it("opens on the Chat with nothing highlighted", () => {
    expect(initialPhoneView).toEqual({
      tab: "chat",
      focus: null,
      backToChat: false,
      sheet: null,
    });
  });

  it("jumps to the Canvas tab with the Item highlighted and Back to Chat, for 'jump'", () => {
    const next = phoneView(initialPhoneView, {
      type: "reference",
      target: budget,
      pointing: "jump",
    });
    expect(next).toEqual({
      tab: "canvas",
      focus: budget,
      backToChat: true,
      sheet: null,
    });
  });

  it("opens a preview sheet over the Chat, for 'sheet'", () => {
    const next = phoneView(initialPhoneView, {
      type: "reference",
      target: mehendiEntry,
      pointing: "sheet",
    });
    expect(next).toEqual({
      tab: "chat",
      focus: null,
      backToChat: false,
      sheet: mehendiEntry,
    });
  });

  it("goes back to the Chat from a jump and clears the highlight", () => {
    const jumped = phoneView(initialPhoneView, {
      type: "reference",
      target: budget,
      pointing: "jump",
    });
    expect(phoneView(jumped, { type: "backToChat" })).toEqual(initialPhoneView);
  });

  it("drops Back to Chat once the person picks a tab themselves", () => {
    const jumped = phoneView(initialPhoneView, {
      type: "reference",
      target: budget,
      pointing: "jump",
    });
    const onCanvas = phoneView(jumped, { type: "tab", tab: "canvas" });
    expect(onCanvas.backToChat).toBe(false);
    expect(phoneView(onCanvas, { type: "tab", tab: "chat" })).toEqual(
      initialPhoneView,
    );
  });

  it("closes the preview sheet, or opens its Item on the Canvas tab", () => {
    const withSheet: PhoneView = phoneView(initialPhoneView, {
      type: "reference",
      target: budget,
      pointing: "sheet",
    });
    expect(phoneView(withSheet, { type: "closeSheet" })).toEqual(
      initialPhoneView,
    );
    expect(phoneView(withSheet, { type: "openSheetOnCanvas" })).toEqual({
      tab: "canvas",
      focus: budget,
      backToChat: true,
      sheet: null,
    });
  });
});
