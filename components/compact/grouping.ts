/*
 * How Compact mode groups the Canvas's Items (S16, ADR 0007): by kind, which
 * means one group per Canvas Section, or by Function, with Event-wide Items
 * (no Function) in their own group. Each person's order and collapse state is
 * their own (`viewPrefs`), so the groups are built here from the shared Canvas
 * and the person's order, never stored.
 */

export type Grouping = "kind" | "function";

/** The group key for Items with no Function. */
export const EVENT_WIDE_GROUP = "eventWide";

export type CompactSection = { _id: string; name: string; order: number };
export type CompactItem = {
  _id: string;
  sectionId: string;
  functionKey: string | null;
  position: { x: number; y: number };
};
export type CompactFunction = { key: string; name: string };
export type GroupOrder = { group: string; itemIds: readonly string[] };

export type CompactGroup<I extends CompactItem = CompactItem> = {
  key: string;
  label: string;
  /** The Function's key, for a Function group. */
  functionKey?: string;
  /** The Section's ID, for a Section group. */
  sectionId?: string;
  items: I[];
};

export function sectionGroupKey(sectionId: string): string {
  return `section:${sectionId}`;
}

export function functionGroupKey(functionKey: string): string {
  return `function:${functionKey}`;
}

/** Reading order on the Canvas: top to bottom, then left to right. */
function byPosition(a: CompactItem, b: CompactItem): number {
  return a.position.y - b.position.y || a.position.x - b.position.x;
}

/** The person's ordered Items first, in their order; Items they never placed follow in the default order. */
function applyOrder<I extends CompactItem>(
  items: I[],
  itemIds: readonly string[] | undefined,
): I[] {
  if (!itemIds || itemIds.length === 0) return items;
  const byId = new Map(items.map((i) => [i._id, i]));
  const placed: I[] = [];
  for (const id of itemIds) {
    const found = byId.get(id);
    if (found) {
      placed.push(found);
      byId.delete(id);
    }
  }
  return [...placed, ...items.filter((i) => byId.has(i._id))];
}

export function groupItems<I extends CompactItem>({
  grouping,
  sections,
  functions,
  items,
  order,
  functionKey = null,
}: {
  grouping: Grouping;
  sections: readonly CompactSection[];
  functions: readonly CompactFunction[];
  items: readonly I[];
  order: readonly GroupOrder[];
  /** The Function filter's pick: Items for other Functions are hidden; Event-wide Items stay. */
  functionKey?: string | null;
}): CompactGroup<I>[] {
  const orderOf = new Map(order.map((o) => [o.group, o.itemIds]));
  const sectionOrder = new Map(sections.map((s) => [s._id, s.order]));
  const shown = items.filter(
    (i) =>
      functionKey === null ||
      i.functionKey === null ||
      i.functionKey === functionKey,
  );

  if (grouping === "kind") {
    return [...sections]
      .sort((a, b) => a.order - b.order)
      .map((section) => {
        const key = sectionGroupKey(section._id);
        const inSection = shown
          .filter((i) => i.sectionId === section._id)
          .sort(byPosition);
        return {
          key,
          label: section.name,
          sectionId: section._id,
          items: applyOrder(inSection, orderOf.get(key)),
        };
      });
  }

  // By Function: Section order first, then reading order, so the default
  // matches what the person sees going down the Canvas.
  const defaultOrder = [...shown].sort(
    (a, b) =>
      (sectionOrder.get(a.sectionId) ?? Infinity) -
        (sectionOrder.get(b.sectionId) ?? Infinity) || byPosition(a, b),
  );
  const known = new Set(functions.map((fn) => fn.key));
  const groups: CompactGroup<I>[] = [];
  for (const fn of functions) {
    const key = functionGroupKey(fn.key);
    const forFunction = defaultOrder.filter((i) => i.functionKey === fn.key);
    if (forFunction.length === 0) continue;
    groups.push({
      key,
      label: fn.name,
      functionKey: fn.key,
      items: applyOrder(forFunction, orderOf.get(key)),
    });
  }
  const eventWide = defaultOrder.filter(
    (i) => i.functionKey === null || !known.has(i.functionKey),
  );
  if (eventWide.length > 0) {
    groups.push({
      key: EVENT_WIDE_GROUP,
      label: "Event-wide",
      items: applyOrder(eventWide, orderOf.get(EVENT_WIDE_GROUP)),
    });
  }
  return groups;
}

/** The list with one ID moved one place up (-1) or down (1); unchanged past either end. */
export function moveWithin(
  list: readonly string[],
  id: string,
  delta: -1 | 1,
): string[] {
  const next = [...list];
  const from = next.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= next.length) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
