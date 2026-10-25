import { describe, expect, it } from "vitest";
import { composeNote, noteChips, noteTooLong } from "./note";

describe("noteChips", () => {
  it("offers the post type's chips, then the Theme's words, each once", () => {
    expect(
      noteChips("pin", ["royal Rajputana", "Flowers", "marigold"]),
    ).toEqual([
      "colours",
      "the stage",
      "flowers",
      "lighting",
      "the outfit",
      "royal Rajputana",
      "marigold",
    ]);
  });

  it("offers the entry for a Reel", () => {
    expect(noteChips("reel", [])).toContain("the entry");
  });
});

describe("composeNote", () => {
  it("joins the tapped chips and the free text", () => {
    expect(composeNote(["colours", "flowers"], " love the teal drapes ")).toBe(
      "colours, flowers; love the teal drapes",
    );
  });

  it("keeps either part alone", () => {
    expect(composeNote(["the stage"], "")).toBe("the stage");
    expect(composeNote([], "brass lanterns")).toBe("brass lanterns");
  });

  it("is null when the Member said nothing", () => {
    expect(composeNote([], "   ")).toBeNull();
  });
});

describe("noteTooLong", () => {
  it("counts characters as a person does, like the server", () => {
    // "मेहंदी" is 6 UTF-16 code units but 3 characters; 500 of them fit.
    expect(noteTooLong("मेहंदी".repeat(166))).toBe(false);
    expect(noteTooLong("🌼".repeat(500))).toBe(false);
    expect(noteTooLong("a".repeat(500))).toBe(false);
    expect(noteTooLong("a".repeat(501))).toBe(true);
  });

  it("is false for no note", () => {
    expect(noteTooLong(null)).toBe(false);
  });
});
