/**
 * Where a new Reference lands in its Section. S2 provides the shared rule as
 * `placeInFreeSpace(section, items, size) => position` in
 * `lib/canvas/placement.ts`; until S2 merges, this adapter applies the same
 * documented rule itself (docs/plans/build-slices.md, S2): never overlap an
 * existing Item, fill left to right then down, with a 20 px gap. Once S2 is on
 * `main`, `placeReference` delegates to `placeInFreeSpace` and the local rule
 * goes away.
 */

export type Position = { x: number; y: number };
export type Size = { w: number; h: number };
export type PlacedItem = { position: Position; size: Size | null };
export type SectionFrame = { frame: { w: number } };

/** A Reference card's size on the Canvas: room for a Pin or post embed. */
export const REFERENCE_CARD_SIZE: Size = { w: 300, h: 420 };

const GAP = 20;

function overlaps(a: Position, aSize: Size, b: Position, bSize: Size): boolean {
  return (
    a.x < b.x + bSize.w + GAP &&
    b.x < a.x + aSize.w + GAP &&
    a.y < b.y + bSize.h + GAP &&
    b.y < a.y + aSize.h + GAP
  );
}

export function placeReference(
  section: SectionFrame,
  items: readonly PlacedItem[],
  size: Size,
): Position {
  const boxes = items.map((item) => ({
    position: item.position,
    size: item.size ?? size,
  }));
  const xs = [0, ...boxes.map((b) => b.position.x + b.size.w + GAP)].sort(
    (p, q) => p - q,
  );
  const ys = [0, ...boxes.map((b) => b.position.y + b.size.h + GAP)].sort(
    (p, q) => p - q,
  );
  for (const y of ys) {
    for (const x of xs) {
      if (x > 0 && x + size.w > section.frame.w) continue;
      const candidate = { x, y };
      if (!boxes.some((b) => overlaps(candidate, size, b.position, b.size)))
        return candidate;
    }
  }
  // Unreachable: the last row below every Item is always free.
  return { x: 0, y: Math.max(0, ...ys) };
}
