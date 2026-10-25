"use client";

import usePresence from "@convex-dev/presence/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import type { CanvasViewer } from "@/components/canvas/CanvasItemContext";
import { useSelection } from "@/components/shell/selection";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { SelectionTarget } from "@/lib/types/canvas";

/*
 * The live parts of the shared Canvas that Compact mode shows too: who else is
 * here and what each has selected, and what the Assistant is pointing at. The
 * same presence room and highlights as the freeform Canvas (S2), so switching
 * views changes nothing anyone else sees.
 */

export type CanvasData = NonNullable<
  ReturnType<typeof useQuery<typeof api.canvas.get>>
>;
type Highlight = CanvasData["highlights"][number];

type PresenceState = { userId: string; online: boolean; data?: unknown };
type PresenceTarget = { itemId: Id<"items">; entryId: Id<"entries"> | null };

function presenceTargetOf(
  selection: SelectionTarget | null,
): PresenceTarget | null {
  if (selection === null) return null;
  return {
    itemId: selection.itemId,
    entryId: selection.kind === "item" ? null : selection.entryId,
  };
}

function selectionOf(state: PresenceState): PresenceTarget | null {
  const data = state.data as { selection?: PresenceTarget | null } | undefined;
  return data?.selection ?? null;
}

export type CanvasLive = {
  /** People here now (me included), for the header's presence dots. */
  online: CanvasViewer[];
  viewersByItem: ReadonlyMap<string, readonly CanvasViewer[]>;
  viewersByEntry: ReadonlyMap<string, ReadonlyMap<string, CanvasViewer[]>>;
  /** Highlights not yet expired. */
  activeHighlights: Highlight[];
  pointedItems: ReadonlySet<string>;
  pointedEntries: ReadonlyMap<string, ReadonlySet<string>>;
};

export function useCanvasLive(
  eventId: Id<"events">,
  data: CanvasData,
): CanvasLive {
  const selection = useSelection();
  const presenceRaw = usePresence(api.canvas, eventId, data.me.membershipId);
  const presence = useMemo(
    () => (presenceRaw ?? []) as PresenceState[],
    [presenceRaw],
  );
  const setPresenceSelection = useMutation(api.canvas.setPresenceSelection);
  const presenceKey = JSON.stringify(presenceTargetOf(selection));
  useEffect(() => {
    const target = JSON.parse(presenceKey) as PresenceTarget | null;
    setPresenceSelection({ eventId, target }).catch(() => {});
  }, [eventId, presenceKey, setPresenceSelection]);

  const people = useMemo(
    () => new Map(data.people.map((p) => [p.membershipId as string, p])),
    [data.people],
  );
  const { online, viewersByItem, viewersByEntry } = useMemo(() => {
    const online: CanvasViewer[] = [];
    const seen = new Set<string>();
    const byItem = new Map<string, CanvasViewer[]>();
    const byEntry = new Map<string, Map<string, CanvasViewer[]>>();
    for (const state of presence) {
      const person = people.get(state.userId);
      if (!state.online || !person) continue;
      const viewer = {
        membershipId: person.membershipId,
        name: person.name,
        imageUrl: person.imageUrl,
      };
      if (!seen.has(state.userId)) {
        seen.add(state.userId);
        online.push(viewer);
      }
      if (state.userId === data.me.membershipId) continue;
      const target = selectionOf(state);
      if (!target) continue;
      if (target.entryId === null) {
        byItem.set(target.itemId, [
          ...(byItem.get(target.itemId) ?? []),
          viewer,
        ]);
      } else {
        const entries = byEntry.get(target.itemId) ?? new Map();
        entries.set(target.entryId, [
          ...(entries.get(target.entryId) ?? []),
          viewer,
        ]);
        byEntry.set(target.itemId, entries);
      }
    }
    return { online, viewersByItem: byItem, viewersByEntry: byEntry };
  }, [presence, people, data.me.membershipId]);

  // Highlights until they expire: one timer runs to the next expiry.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const now = Date.now();
    const upcoming = data.highlights
      .map((h) => h.expiresAt)
      .filter((at) => at > now);
    if (upcoming.length === 0) {
      if (data.highlights.some((h) => h.expiresAt > clock)) {
        const timer = window.setTimeout(() => setClock(Date.now()), 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(...upcoming) - now + 20,
    );
    return () => window.clearTimeout(timer);
  }, [data.highlights, clock]);
  const activeHighlights = useMemo(
    () => data.highlights.filter((h) => h.expiresAt > clock),
    [data.highlights, clock],
  );
  const { pointedItems, pointedEntries } = useMemo(() => {
    const items = new Set<string>();
    const entries = new Map<string, Set<string>>();
    for (const highlight of activeHighlights) {
      for (const target of highlight.targets) {
        items.add(target.itemId);
        if (target.kind !== "item" && target.entryId) {
          const set = entries.get(target.itemId) ?? new Set<string>();
          set.add(target.entryId);
          entries.set(target.itemId, set);
        }
      }
    }
    return { pointedItems: items, pointedEntries: entries };
  }, [activeHighlights]);

  return {
    online,
    viewersByItem,
    viewersByEntry,
    activeHighlights,
    pointedItems,
    pointedEntries,
  };
}
