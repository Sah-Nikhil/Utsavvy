import type { ItemKind, SectionKind } from "../types/canvas";
import { SECTION_HEADER, SECTION_PAD_X, SECTION_SPACING } from "./layout";
import type { Frame } from "./placement";

/*
 * The four starting Sections every Event begins with (CONTEXT.md, Section),
 * and which starting Section each Item kind belongs to. New Items land in
 * free space in their kind's starting Section (ADR 0007). S1's
 * `api.events.create` makes the real ones; this layout matches it and is used
 * for local seeds and tests. Whatever the stored frames, the Canvas draws
 * Sections apart with `layoutSections` (lib/canvas/layout.ts).
 */

export type StartingSectionKind = Exclude<SectionKind, "custom">;

export type StartingSection = {
  kind: StartingSectionKind;
  name: string;
  frame: Frame;
  order: number;
};

/** S1's starting layout (convex/events.ts): 720 x 560 frames, 40 px apart. */
export const STARTING_SECTIONS: readonly StartingSection[] = [
  {
    kind: "money",
    name: "Money and dates",
    frame: { x: 0, y: 0, w: 720, h: 560 },
    order: 0,
  },
  {
    kind: "vendors",
    name: "Vendors",
    frame: { x: 760, y: 0, w: 720, h: 560 },
    order: 1,
  },
  {
    kind: "inspirations",
    name: "Inspirations",
    frame: { x: 0, y: 600, w: 720, h: 560 },
    order: 2,
  },
  {
    kind: "notes",
    name: "Notes",
    frame: { x: 760, y: 600, w: 720, h: 560 },
    order: 3,
  },
];

/**
 * The starting Section an Item kind lands in. Suggestions sit with the plan in
 * Money and dates, because adding one turns it into a budget Entry and a
 * Timeline Entry. The Vendor checklist sits in Vendors, where S1 creates it.
 */
export const STARTING_SECTION_FOR_KIND: Readonly<
  Record<ItemKind, StartingSectionKind>
> = {
  budget: "money",
  timeline: "money",
  checklist: "vendors",
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
 * Where a new custom Section's frame goes: below every Section as the Canvas
 * draws them (`boxes` from `layoutSections`), lined up with the left edge.
 */
export function frameForNewSection(
  boxes: readonly Frame[],
  size: { w: number; h: number } = { w: 720, h: 560 },
): Frame {
  if (boxes.length === 0) return { x: 0, y: 0, ...size };
  const left = Math.min(...boxes.map((b) => b.x));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return {
    x: left + SECTION_PAD_X,
    y: bottom + SECTION_SPACING + SECTION_HEADER,
    ...size,
  };
}
