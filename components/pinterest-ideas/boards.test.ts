import { describe, expect, it } from "vitest";
import { boardsForEvent, type Board } from "./boards";

// Fixture boards in the seed's shape. The real seed waits for Utsavvy's
// Pinterest account, so these tests never depend on what it holds.
const ACCOUNT = "https://www.pinterest.com/utsavvy_fixture";
const BOARDS: Board[] = [
  {
    key: "wedding-stages",
    label: "Wedding stages",
    url: `${ACCOUNT}/wedding-stages/`,
    eventTypes: ["wedding"],
    functionKeys: ["wedding", "reception"],
  },
  {
    key: "sangeet-nights",
    label: "Sangeet nights",
    url: `${ACCOUNT}/sangeet-nights/`,
    eventTypes: ["wedding"],
    functionKeys: ["sangeet"],
  },
  {
    key: "haldi-decor",
    label: "Haldi decor",
    url: `${ACCOUNT}/haldi-decor/`,
    eventTypes: ["wedding"],
    functionKeys: ["haldi"],
  },
  {
    key: "mehendi",
    label: "Mehendi",
    url: `${ACCOUNT}/mehendi/`,
    eventTypes: ["wedding"],
    functionKeys: ["mehendi"],
  },
  {
    key: "nikah-walima",
    label: "Nikah and walima",
    url: `${ACCOUNT}/nikah-walima/`,
    eventTypes: ["wedding"],
    functionKeys: ["nikah", "walima"],
  },
  {
    key: "kids-party-themes",
    label: "Kids' party themes",
    url: `${ACCOUNT}/kids-party-themes/`,
    eventTypes: ["birthday"],
    functionKeys: ["party"],
  },
  {
    key: "birthday-cakes",
    label: "Birthday cakes",
    url: `${ACCOUNT}/birthday-cakes/`,
    eventTypes: ["birthday"],
    functionKeys: [],
  },
];

const keys = (boards: Board[]) => boards.map((board) => board.key);

// The North Indian Hindu Functions, in the Brief's order (first-brief.md).
const NORTH_INDIAN_HINDU_WEDDING = {
  eventType: "wedding" as const,
  functions: [
    { key: "haldi" },
    { key: "mehendi" },
    { key: "sangeet" },
    { key: "wedding" },
    { key: "reception" },
  ],
};

describe("boardsForEvent", () => {
  it("lists the haldi board first for a North Indian Hindu wedding opened on its haldi", () => {
    const boards = boardsForEvent(NORTH_INDIAN_HINDU_WEDDING, "haldi", BOARDS);
    expect(boards[0]?.key).toBe("haldi-decor");
  });

  it("puts the chosen Function's board first even when it isn't the Event's first Function", () => {
    const boards = boardsForEvent(
      NORTH_INDIAN_HINDU_WEDDING,
      "sangeet",
      BOARDS,
    );
    expect(keys(boards)).toEqual([
      "sangeet-nights",
      "haldi-decor",
      "mehendi",
      "wedding-stages",
      "nikah-walima",
    ]);
  });

  it("follows the Event's Function order when no Function is chosen, with other boards last", () => {
    const boards = boardsForEvent(
      NORTH_INDIAN_HINDU_WEDDING,
      undefined,
      BOARDS,
    );
    expect(keys(boards)).toEqual([
      "haldi-decor",
      "mehendi",
      "sangeet-nights",
      "wedding-stages",
      "nikah-walima",
    ]);
  });

  it("lists party-theme boards and no wedding board for a child birthday", () => {
    const childBirthday = {
      eventType: "birthday" as const,
      functions: [{ key: "party" }],
    };
    expect(keys(boardsForEvent(childBirthday, null, BOARDS))).toEqual([
      "kids-party-themes",
      "birthday-cakes",
    ]);
  });

  it("returns no boards for an Event type with none", () => {
    const ganeshUtsav = {
      eventType: "community" as const,
      functions: [{ key: "sthapana" }, { key: "visarjan" }],
    };
    expect(boardsForEvent(ganeshUtsav, "sthapana", BOARDS)).toEqual([]);
  });
});
