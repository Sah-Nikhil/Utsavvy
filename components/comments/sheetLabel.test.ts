import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { sheetEntryLabel } from "./sheetLabel";
import type { CommentView } from "./threads";

const itemId = "item1" as Id<"items">;
const entryId = "entry1" as Id<"entries">;
const onEntry = { kind: "entry" as const, itemId, entryId };

function onTheEntry(entryLabel: string | null): CommentView {
  return {
    _id: "c1" as Id<"comments">,
    rootId: null,
    target: onEntry,
    body: "Called?",
    resolved: false,
    createdAt: 0,
    editedAt: null,
    authorName: "Papa",
    authorImageUrl: null,
    byAssistant: false,
    byYou: false,
    canEdit: false,
    canResolve: false,
    entryLabel,
  };
}

describe("sheetEntryLabel", () => {
  it("follows a rename made while the sheet is open (second review of PR 116, nit 1)", () => {
    expect(
      sheetEntryLabel(onEntry, "Caterer", [onTheEntry("Caterer (veg)")]),
    ).toBe("Caterer (veg)");
  });

  it("uses the row's name before the Entry has any Comments", () => {
    expect(sheetEntryLabel(onEntry, "Caterer", [])).toBe("Caterer");
    expect(sheetEntryLabel(onEntry, "Caterer", undefined)).toBe("Caterer");
  });

  it("names no Entry for a sheet on the whole Item", () => {
    expect(
      sheetEntryLabel({ kind: "item", itemId }, "Caterer", [
        onTheEntry("Caterer"),
      ]),
    ).toBeNull();
  });
});
