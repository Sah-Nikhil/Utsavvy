import { describe, expect, it } from "vitest";
import { isFunctionKey } from "../lib/types/functions";
import boards from "./pinterest-boards.json";

// S21: the boards on Utsavvy's own Pinterest account (ADR 0014).

const EVENT_TYPES = new Set(["wedding", "birthday", "community"]);
const BOARD_URL =
  /^https:\/\/www\.pinterest\.com\/([A-Za-z0-9_]+)\/([A-Za-z0-9_-]+)\/$/;

/** Every way a list of boards breaks the seed's rules, one line each. */
function seedProblems(list: unknown[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const accounts = new Set<string>();
  list.forEach((entry, index) => {
    const board = entry as Record<string, unknown>;
    const name = typeof board.key === "string" ? board.key : `#${index}`;
    if (typeof board.key !== "string" || board.key === "")
      problems.push(`${name}: no key`);
    else if (seen.has(board.key)) problems.push(`${name}: duplicate key`);
    else seen.add(board.key);
    if (typeof board.label !== "string" || board.label.trim() === "")
      problems.push(`${name}: no label`);
    const match =
      typeof board.url === "string" ? BOARD_URL.exec(board.url) : null;
    if (match === null) problems.push(`${name}: url is not a board link`);
    // `/pin/<id>/` is a Pin, not a board, though it has the same shape.
    else if (match[1] === "pin")
      problems.push(`${name}: url is not a board link`);
    else accounts.add(match[1]!);
    const types = Array.isArray(board.eventTypes) ? board.eventTypes : [];
    if (types.length === 0) problems.push(`${name}: no event type`);
    for (const type of types)
      if (!EVENT_TYPES.has(type as string))
        problems.push(`${name}: unknown event type ${String(type)}`);
    if (!Array.isArray(board.functionKeys))
      problems.push(`${name}: no functionKeys list`);
    else
      for (const key of board.functionKeys)
        if (!isFunctionKey(key as string))
          problems.push(`${name}: unknown Function key ${String(key)}`);
  });
  if (accounts.size > 1)
    problems.push(`boards from ${accounts.size} accounts, not one`);
  return problems;
}

const GOOD = {
  key: "haldi-decor",
  label: "Haldi decor",
  url: "https://www.pinterest.com/utsavvy_fixture/haldi-decor/",
  eventTypes: ["wedding"],
  functionKeys: ["haldi"],
};

describe("the seed rules", () => {
  it("accept a well-formed board, theme boards included", () => {
    const theme = {
      ...GOOD,
      key: "kids-party-themes",
      url: "https://www.pinterest.com/utsavvy_fixture/kids-party-themes/",
      eventTypes: ["birthday"],
      functionKeys: [],
    };
    expect(seedProblems([GOOD, theme])).toEqual([]);
  });

  it("refuse links that aren't a board on www.pinterest.com", () => {
    const links = [
      "https://in.pinterest.com/utsavvy_fixture/haldi-decor/",
      "https://www.pinterest.com/utsavvy_fixture/haldi-decor",
      "https://www.pinterest.com/pin/123456789/",
      "https://www.pinterest.com/utsavvy_fixture/",
      "http://www.pinterest.com/utsavvy_fixture/haldi-decor/",
      "https://pin.it/AbC123",
    ];
    for (const url of links)
      expect(seedProblems([{ ...GOOD, url }]), url).toEqual([
        "haldi-decor: url is not a board link",
      ]);
  });

  it("refuse duplicate keys, missing labels and boards with no event type", () => {
    expect(
      seedProblems([
        GOOD,
        { ...GOOD, label: " " },
        { ...GOOD, key: "mehendi", eventTypes: [] },
      ]),
    ).toEqual([
      "haldi-decor: duplicate key",
      "haldi-decor: no label",
      "mehendi: no event type",
    ]);
  });

  it("refuse Function keys and event types the Brief doesn't use", () => {
    expect(
      seedProblems([
        { ...GOOD, functionKeys: ["Haldi"], eventTypes: ["wedding", "party"] },
      ]),
    ).toEqual([
      "haldi-decor: unknown event type party",
      "haldi-decor: unknown Function key Haldi",
    ]);
  });

  it("refuse boards from more than one account", () => {
    expect(
      seedProblems([
        GOOD,
        {
          ...GOOD,
          key: "mehendi",
          url: "https://www.pinterest.com/someone_else/mehendi/",
        },
      ]),
    ).toEqual(["boards from 2 accounts, not one"]);
  });
});

describe("seed/pinterest-boards.json", () => {
  it("follows the seed rules", () => {
    expect(seedProblems(boards)).toEqual([]);
  });

  // Becomes a real check when Sah-Nikhil's boards arrive (about 12 to 18).
  it.todo("holds Utsavvy's 12 to 18 boards");
});
