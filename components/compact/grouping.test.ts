import { describe, expect, it } from "vitest";
import {
  EVENT_WIDE_GROUP,
  groupItems,
  moveWithin,
  type CompactItem,
  type CompactSection,
} from "./grouping";

// S16 seam (issue #49): Compact mode shows the same Items in collapsible
// groups, by kind (the Canvas's Sections) or by Function, in the person's own
// order. Fixtures follow the Jaipur wedding: haldi, mehendi and sangeet.

const sections: CompactSection[] = [
  { _id: "s-notes", name: "Notes", order: 3 },
  { _id: "s-money", name: "Money and dates", order: 0 },
  { _id: "s-insp", name: "Inspirations", order: 2 },
];

const functions = [
  { key: "haldi", name: "Haldi" },
  { key: "mehendi", name: "Mehendi" },
  { key: "sangeet", name: "Sangeet" },
];

function item(
  _id: string,
  sectionId: string,
  functionKey: string | null,
  y: number,
  x = 0,
): CompactItem {
  return { _id, sectionId, functionKey, position: { x, y } };
}

const items: CompactItem[] = [
  item("budget", "s-money", null, 0),
  item("timeline", "s-money", null, 0, 400),
  item("mehendi-note", "s-notes", "mehendi", 200),
  item("sangeet-note", "s-notes", "sangeet", 0),
  item("venue-note", "s-notes", null, 400),
  item("haldi-photo", "s-insp", "haldi", 0),
];

const ids = (groups: ReturnType<typeof groupItems>) =>
  groups.map((g) => ({
    key: g.key,
    label: g.label,
    items: g.items.map((i) => i._id),
  }));

describe("groupItems by Function", () => {
  it("puts Event-wide Items in their own group, after the Functions in the Event's order", () => {
    const groups = groupItems({
      grouping: "function",
      sections,
      functions,
      items,
      order: [],
    });
    expect(ids(groups)).toEqual([
      { key: "function:haldi", label: "Haldi", items: ["haldi-photo"] },
      { key: "function:mehendi", label: "Mehendi", items: ["mehendi-note"] },
      { key: "function:sangeet", label: "Sangeet", items: ["sangeet-note"] },
      {
        key: EVENT_WIDE_GROUP,
        label: "Event-wide",
        items: ["budget", "timeline", "venue-note"],
      },
    ]);
  });

  it("counts an Item whose Function no longer exists as Event-wide, and leaves out empty Functions", () => {
    const groups = groupItems({
      grouping: "function",
      sections,
      functions: [...functions, { key: "reception", name: "Reception" }],
      items: [item("orphan", "s-notes", "baraat", 0), items[2]!],
      order: [],
    });
    expect(ids(groups)).toEqual([
      { key: "function:mehendi", label: "Mehendi", items: ["mehendi-note"] },
      { key: EVENT_WIDE_GROUP, label: "Event-wide", items: ["orphan"] },
    ]);
  });
});

describe("groupItems by kind", () => {
  it("has one group per Section in Section order, Items in reading order, empty Sections kept", () => {
    const groups = groupItems({
      grouping: "kind",
      sections: [
        ...sections,
        { _id: "s-custom", name: "Sangeet ideas", order: 4 },
      ],
      functions,
      items,
      order: [],
    });
    expect(ids(groups)).toEqual([
      {
        key: "section:s-money",
        label: "Money and dates",
        items: ["budget", "timeline"],
      },
      { key: "section:s-insp", label: "Inspirations", items: ["haldi-photo"] },
      {
        key: "section:s-notes",
        label: "Notes",
        items: ["sangeet-note", "mehendi-note", "venue-note"],
      },
      { key: "section:s-custom", label: "Sangeet ideas", items: [] },
    ]);
  });
});

describe("personal order and the Function filter", () => {
  it("puts the person's ordered Items first and new Items after them, ignoring Items that are gone", () => {
    const groups = groupItems({
      grouping: "kind",
      sections,
      functions,
      items,
      order: [
        {
          group: "section:s-notes",
          itemIds: ["venue-note", "deleted-note", "mehendi-note"],
        },
      ],
    });
    expect(ids(groups).find((g) => g.key === "section:s-notes")?.items).toEqual(
      ["venue-note", "mehendi-note", "sangeet-note"],
    );
  });

  it("hides Items for other Functions and keeps Event-wide Items when one Function is picked", () => {
    const groups = groupItems({
      grouping: "kind",
      sections,
      functions,
      items,
      order: [],
      functionKey: "mehendi",
    });
    expect(ids(groups).map((g) => g.items)).toEqual([
      ["budget", "timeline"],
      [],
      ["mehendi-note", "venue-note"],
    ]);
  });
});

describe("moveWithin", () => {
  it("moves an Item one place up or down, and does nothing past either end", () => {
    const list = ["a", "b", "c"];
    expect(moveWithin(list, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveWithin(list, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveWithin(list, "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveWithin(list, "c", 1)).toEqual(["a", "b", "c"]);
  });
});
