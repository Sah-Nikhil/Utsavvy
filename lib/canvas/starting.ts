import type { ItemKind, SectionKind } from "../types/canvas";
import type { Frame } from "./placement";

/*
 * The four starting Sections every Event begins with (CONTEXT.md, Section),
 * laid out two by two on the Canvas, and which starting Section each Item kind
 * belongs to. S1 creates the Sections with these frames when an Event is made;
 * new Items land in free space in their kind's starting Section (ADR 0007).
 */

export type StartingSectionKind = Exclude<SectionKind, "custom">;

export type StartingSection = {
  kind: StartingSectionKind;
  name: string;
  frame: Frame;
  order: number;
};

/** The space between two Sections' frames, wide enough for a Section's label. */
export const SECTION_GAP = 120;

export const STARTING_SECTIONS: readonly StartingSection[] = [
  {
    kind: "money",
    name: "Money and dates",
    frame: { x: 0, y: 0, w: 960, h: 680 },
    order: 0,
  },
  {
    kind: "vendors",
    name: "Vendors",
    frame: { x: 960 + SECTION_GAP, y: 0, w: 960, h: 680 },
    order: 1,
  },
  {
    kind: "inspirations",
    name: "Inspirations",
    frame: { x: 0, y: 680 + SECTION_GAP, w: 960, h: 520 },
    order: 2,
  },
  {
    kind: "notes",
    name: "Notes",
    frame: { x: 960 + SECTION_GAP, y: 680 + SECTION_GAP, w: 960, h: 520 },
    order: 3,
  },
];

/**
 * The starting Section an Item kind lands in. Suggestions sit with the plan in
 * Money and dates, because adding one turns it into a budget Entry and a
 * Timeline Entry.
 */
export const STARTING_SECTION_FOR_KIND: Readonly<
  Record<ItemKind, StartingSectionKind>
> = {
  budget: "money",
  timeline: "money",
  checklist: "money",
  suggestion: "money",
  shortlistedVendor: "vendors",
  googlePlace: "vendors",
  inspiration: "inspirations",
  note: "notes",
};

export function isStartingSection(kind: SectionKind): boolean {
  return kind !== "custom";
}

/** The longest Section name, in characters. */
export const SECTION_NAME_MAX = 60;

/** A Section name trimmed, or why it is refused. */
export function cleanSectionName(
  name: string,
): { ok: true; name: string } | { ok: false; problem: "empty" | "tooLong" } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") return { ok: false, problem: "empty" };
  if (Array.from(trimmed).length > SECTION_NAME_MAX)
    return { ok: false, problem: "tooLong" };
  return { ok: true, name: trimmed };
}

/**
 * Where a new custom Section goes: below every Section on the Canvas, at the
 * left edge, so it never covers one.
 */
export function frameForNewSection(
  sections: readonly { frame: Frame }[],
  size: { w: number; h: number } = { w: 960, h: 520 },
): Frame {
  if (sections.length === 0) return { x: 0, y: 0, ...size };
  const left = Math.min(...sections.map((s) => s.frame.x));
  const bottom = Math.max(...sections.map((s) => s.frame.y + s.frame.h));
  return { x: left, y: bottom + SECTION_GAP, ...size };
}
