"use client";

import "@xyflow/react/dist/base.css";
import usePresence from "@convex-dev/presence/react";
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { FolderPlus, Maximize, Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  useRevealRequest,
  useSelection,
  useSetSelection,
} from "@/components/shell/selection";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { can } from "@/lib/access/permissions";
import {
  SECTION_HEADER,
  SECTION_PAD_X,
  itemOffsetInBox,
  itemPositionFromBox,
  layoutSections,
  sectionUnder,
} from "@/lib/canvas/layout";
import { FALLBACK_ITEM_SIZE, type Frame } from "@/lib/canvas/placement";
import { isStartingSection } from "@/lib/canvas/starting";
import type { SelectionTarget } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";
import {
  FunctionFilterChips,
  FunctionFilterProvider,
  useFunctionFilter,
} from "./FunctionFilter";
import type { CanvasItemState, CanvasViewer } from "./CanvasItemContext";
import {
  ITEM_DRAG_HANDLE,
  ItemNode,
  itemAriaLabel,
  type ItemNodeType,
} from "./ItemNode";
import { AddNoteButton } from "./AddNoteButton";
import { readableViewport } from "./initialViewport";
import { isOffScreen } from "./reveal";
import { SectionDialogsProvider, useSectionDialogs } from "./SectionDialogs";
import {
  SECTION_DRAG_HANDLE,
  SectionNode,
  type SectionNodeType,
} from "./SectionNode";

/*
 * The shared freeform Canvas (ADR 0007), on React Flow (ADR 0010). Sections
 * are group nodes and Items their child nodes. Positions come from Convex and
 * are saved when a drag ends, so everyone sees a move within about a second;
 * zoom and pan are this person's own and stay in this browser.
 */

type CanvasData = NonNullable<
  ReturnType<typeof useQuery<typeof api.canvas.get>>
>;
type CanvasNode = SectionNodeType | ItemNodeType;

const nodeTypes: NodeTypes = { section: SectionNode, item: ItemNode };

/** How long an Item arriving from someone else stays marked as new. */
const ARRIVAL_MS = 4000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Canvas({ eventId }: { eventId: string }) {
  // Wait for Clerk's token to reach Convex, or the query is refused as signed out.
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(
    api.canvas.get,
    isAuthenticated ? { eventId: eventId as Id<"events"> } : "skip",
  );
  if (data === undefined) {
    return (
      <div
        role="status"
        className="flex size-full items-center justify-center text-label text-ink-3"
      >
        Opening the Canvas…
      </div>
    );
  }
  return (
    <FunctionFilterProvider functions={data.functions}>
      <SectionDialogsProvider eventId={eventId as Id<"events">}>
        <ReactFlowProvider>
          <CanvasFlow eventId={eventId as Id<"events">} data={data} />
        </ReactFlowProvider>
      </SectionDialogsProvider>
    </FunctionFilterProvider>
  );
}

// ---------------------------------------------------------------------------

type PresenceState = { userId: string; online: boolean; data?: unknown };

/** What others learn of a selection: the Item, and the Entry when it is on one. */
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

/** Words for a refused move, for the notice. */
function moveProblem(error: unknown): string {
  const data =
    error instanceof ConvexError
      ? (error.data as { kind?: string; problem?: string })
      : null;
  if (data?.kind === "AccessDenied")
    return "That move wasn't saved: your role in this Event can't move things.";
  if (data?.problem === "deleted")
    return "That move wasn't saved: the Section or Item was just deleted.";
  return "That move wasn't saved. Try again.";
}

/** How long a notice about a refused move stays up. */
const NOTICE_MS = 5000;

function viewportKey(eventId: string) {
  return `utsavvy.canvas.viewport.${eventId}`;
}

function CanvasFlow({
  eventId,
  data,
}: {
  eventId: Id<"events">;
  data: CanvasData;
}) {
  const flow = useReactFlow<CanvasNode>();
  const selection = useSelection();
  const setSelection = useSetSelection();
  const filter = useFunctionFilter();
  const dialogs = useSectionDialogs();
  const role = data.me.role;
  const canEdit = can(role, "canvas.edit");

  // Presence: everyone on this Canvas, and what each has selected.
  const presenceRaw = usePresence(api.canvas, eventId, data.me.membershipId);
  const presence = useMemo(
    () => (presenceRaw ?? []) as PresenceState[],
    [presenceRaw],
  );
  const setPresenceSelection = useMutation(api.canvas.setPresenceSelection);
  // Only the Item and Entry are shared, so a new passage on the same Entry sends nothing.
  const presenceKey = JSON.stringify(presenceTargetOf(selection));
  useEffect(() => {
    const target = JSON.parse(presenceKey) as PresenceTarget | null;
    setPresenceSelection({ eventId, target }).catch(() => {});
  }, [eventId, presenceKey, setPresenceSelection]);

  const peopleById = useMemo(
    () => new Map(data.people.map((p) => [p.membershipId as string, p])),
    [data.people],
  );
  const viewers = useMemo(() => {
    const byItem = new Map<string, CanvasViewer[]>();
    const byEntry = new Map<string, Map<string, CanvasViewer[]>>();
    for (const state of presence) {
      if (!state.online || state.userId === data.me.membershipId) continue;
      const target = selectionOf(state);
      const person = peopleById.get(state.userId);
      if (!target || !person) continue;
      const viewer = {
        membershipId: person.membershipId,
        name: person.name,
        imageUrl: person.imageUrl,
      };
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
    return { byItem, byEntry };
  }, [presence, peopleById, data.me.membershipId]);

  // The Assistant's pointing: highlights until they expire. One timer runs
  // to the next expiry, and none once every highlight has expired.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const now = Date.now();
    const upcoming = data.highlights
      .map((h) => h.expiresAt)
      .filter((at) => at > now);
    if (upcoming.length === 0) {
      // Catch up once if the clock still counts an expired highlight as live.
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
  // Rebuilt only when the set of targets changes, so Items don't re-render on every tick.
  const pointedKey = JSON.stringify(
    activeHighlights
      .flatMap((h) =>
        h.targets.map((t) =>
          t.kind === "item" ? [t.itemId, null] : [t.itemId, t.entryId],
        ),
      )
      .sort(),
  );
  const pointed = useMemo(() => {
    const items = new Set<string>();
    const entries = new Map<string, Set<string>>();
    for (const [itemId, entryId] of JSON.parse(pointedKey) as [
      string,
      string | null,
    ][]) {
      items.add(itemId);
      if (entryId) {
        const set = entries.get(itemId) ?? new Set<string>();
        set.add(entryId);
        entries.set(itemId, set);
      }
    }
    return { items, entries };
  }, [pointedKey]);

  // Items that arrive while this Canvas is open land marked as new for a few
  // seconds. Each has its own timer, kept across later updates and cleared
  // only when the Canvas closes.
  const knownIds = useRef<Set<string> | null>(null);
  const arrivalTimers = useRef(new Map<string, number>());
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = data.items.map((item) => item._id as string);
    if (knownIds.current === null) {
      knownIds.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !knownIds.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) {
      knownIds.current.add(id);
      const timer = window.setTimeout(() => {
        arrivalTimers.current.delete(id);
        setArrived((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ARRIVAL_MS);
      arrivalTimers.current.set(id, timer);
    }
    setArrived((prev) => new Set([...prev, ...fresh]));
  }, [data.items]);
  useEffect(() => {
    const timers = arrivalTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  // A short notice when a move is refused.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Sections with their drawn boxes, grown to hold their Items and laid out
  // so no two Sections overlap (layoutSections).
  const sections = useMemo(() => {
    const itemsOf = (sectionId: string) =>
      data.items.filter((i) => i.sectionId === sectionId);
    const boxes = layoutSections(data.sections, (s) => itemsOf(s._id));
    return data.sections.map((section) => ({
      section,
      items: itemsOf(section._id),
      box: boxes.get(section._id)!,
    }));
  }, [data.sections, data.items]);

  const functionNames = useMemo(
    () => new Map(data.functions.map((fn) => [fn.key, fn.name])),
    [data.functions],
  );
  const selectedItemId = selection?.itemId ?? null;
  const noViewers: CanvasViewer[] = useMemo(() => [], []);
  const noEntries = useMemo(() => new Map<string, CanvasViewer[]>(), []);
  const noPointedEntries = useMemo(() => new Set<string>(), []);

  const built = useMemo<CanvasNode[]>(() => {
    const nodes: CanvasNode[] = [];
    for (const { section, items, box } of sections) {
      const starting = isStartingSection(section.kind);
      nodes.push({
        id: section._id,
        type: "section",
        position: { x: box.x, y: box.y },
        width: box.w,
        height: box.h,
        draggable: canEdit,
        selectable: false,
        focusable: false,
        dragHandle: `.${SECTION_DRAG_HANDLE}`,
        zIndex: 0,
        data: {
          section,
          eventId,
          itemCount: items.length,
          canMove: canEdit,
          canRename: starting
            ? can(
                role,
                data.event.startingSectionRenameBlocked
                  ? "section.starting"
                  : "section.renameStarting",
              )
            : can(role, "section.custom"),
          canDelete: can(
            role,
            starting ? "section.starting" : "section.custom",
          ),
        },
      });
      for (const item of items) {
        const size = item.size ?? FALLBACK_ITEM_SIZE;
        const functionName = item.functionKey
          ? functionNames.get(item.functionKey)
          : undefined;
        nodes.push({
          id: item._id,
          type: "item",
          parentId: section._id,
          position: itemOffsetInBox(item.position),
          width: size.w,
          height: size.h,
          draggable: canEdit,
          selectable: false,
          dragHandle: `.${ITEM_DRAG_HANDLE}`,
          ariaLabel: itemAriaLabel(item, functionName),
          zIndex: 1,
          data: {
            item,
            state: {
              itemId: item._id,
              selection: selectedItemId === item._id ? selection : null,
              selected: selectedItemId === item._id,
              pointed: pointed.items.has(item._id),
              pointedEntryIds:
                pointed.entries.get(item._id) ?? noPointedEntries,
              viewers: viewers.byItem.get(item._id) ?? noViewers,
              viewersByEntry: viewers.byEntry.get(item._id) ?? noEntries,
              functionIndex: item.functionKey
                ? filter.indexOf(item.functionKey)
                : undefined,
              functionName,
              dimmed: filter.dims(item.functionKey),
            } satisfies CanvasItemState,
            arrived: arrived.has(item._id),
            canMove: canEdit,
          },
        });
      }
    }
    return nodes;
  }, [
    sections,
    canEdit,
    role,
    data.event.startingSectionRenameBlocked,
    functionNames,
    selectedItemId,
    selection,
    pointed,
    filter,
    arrived,
    viewers,
    eventId,
    noViewers,
    noEntries,
    noPointedEntries,
  ]);

  // React Flow's own copy of the nodes: the server's, except while dragging.
  const [nodes, setNodes] = useState<CanvasNode[]>(built);
  const [shownBuilt, setShownBuilt] = useState(built);
  if (built !== shownBuilt) {
    setShownBuilt(built);
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return built.map((node) => {
        const old = byId.get(node.id);
        if (!old) return node;
        return {
          ...node,
          measured: old.measured,
          ...(old.dragging
            ? { position: old.position, dragging: true, parentId: old.parentId }
            : {}),
        } as CanvasNode;
      });
    });
  }
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  // Saving moves, with the new position shown at once.
  const moveItem = useMutation(api.canvas.moveItem).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.canvas.get, { eventId });
      if (!current) return;
      store.setQuery(
        api.canvas.get,
        { eventId },
        {
          ...current,
          items: current.items.map((item) =>
            item._id === args.itemId
              ? {
                  ...item,
                  sectionId: args.sectionId,
                  position: {
                    x: Math.max(0, Math.round(args.position.x)),
                    y: Math.max(0, Math.round(args.position.y)),
                  },
                }
              : item,
          ),
        },
      );
    },
  );
  const moveSection = useMutation(api.canvas.moveSection).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.canvas.get, { eventId });
      if (!current) return;
      store.setQuery(
        api.canvas.get,
        { eventId },
        {
          ...current,
          sections: current.sections.map((section) =>
            section._id === args.sectionId
              ? {
                  ...section,
                  frame: {
                    ...section.frame,
                    x: Math.round(args.position.x),
                    y: Math.round(args.position.y),
                  },
                }
              : section,
          ),
        },
      );
    },
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: CanvasNode, dragged: CanvasNode[]) => {
      for (const node of dragged) {
        const internal = flow.getInternalNode(node.id);
        if (!internal) continue;
        const absolute = internal.internals.positionAbsolute;
        if (node.type === "section") {
          moveSection({
            sectionId: node.id as Id<"sections">,
            position: {
              x: absolute.x + SECTION_PAD_X,
              y: absolute.y + SECTION_HEADER,
            },
          }).catch((error: unknown) => showNotice(moveProblem(error)));
          continue;
        }
        const item = node.data.item as Doc<"items">;
        const target = sectionUnder(
          sections.filter((s) => s.section._id !== node.id),
          absolute,
          item.size,
        );
        if (target === null) {
          // Dropped outside every Section: it goes back where it was.
          setNodes(built);
          continue;
        }
        moveItem({
          itemId: item._id,
          sectionId: target.section._id,
          position: itemPositionFromBox({
            x: absolute.x - target.box.x,
            y: absolute.y - target.box.y,
          }),
        }).catch((error: unknown) => showNotice(moveProblem(error)));
      }
    },
    [flow, sections, moveItem, moveSection, built, showNotice],
  );

  // Pan only the asker's view to what the Assistant points at.
  const panned = useRef(new Set<string>());
  useEffect(() => {
    for (const highlight of activeHighlights) {
      if (panned.current.has(highlight._id)) continue;
      panned.current.add(highlight._id);
      if (highlight.forMembershipId !== data.me.membershipId) continue;
      const ids = highlight.targets.map((t) => ({ id: t.itemId as string }));
      window.requestAnimationFrame(() => {
        void flow.fitView({
          nodes: ids,
          padding: 0.4,
          maxZoom: 1,
          duration: prefersReducedMotion() ? 0 : 450,
        });
      });
    }
  }, [activeHighlights, data.me.membershipId, flow]);

  // Keyboard: Tab moves between Items, Enter selects one and goes into it.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__node-item")) return;
      const itemId = target.dataset.id as Id<"items"> | undefined;
      if (!itemId) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelection({ kind: "item", itemId });
        target
          .querySelector<HTMLElement>(
            "[data-item-id] :is(a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1']))",
          )
          ?.focus();
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    },
    [setSelection],
  );

  // This person's zoom and pan, kept in this browser.
  const savedViewport = useMemo<Viewport | null>(() => {
    try {
      const raw = window.localStorage.getItem(viewportKey(eventId));
      return raw ? (JSON.parse(raw) as Viewport) : null;
    } catch {
      return null;
    }
  }, [eventId]);
  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      try {
        window.localStorage.setItem(
          viewportKey(eventId),
          JSON.stringify(viewport),
        );
      } catch {
        // Storage can be blocked; the view just isn't remembered.
      }
    },
    [eventId],
  );

  // With no saved view, open readable on the first Section (Money and dates)
  // rather than fitting every Section at a zoom too small to read. React Flow
  // calls onInit once, so later changes to the Sections never move the view.
  const canvasRef = useRef<HTMLDivElement>(null);
  const firstBox = useMemo<Frame | null>(
    () =>
      (
        sections.find((s) => s.section.kind === "money") ??
        [...sections].sort((a, b) => a.section.order - b.section.order)[0]
      )?.box ?? null,
    [sections],
  );
  // Showing an Item from elsewhere (a history row, a new Note) pans to it when
  // it is out of sight or shows only a sliver, each time it is asked for. An
  // Item someone clicks on the Canvas asks for nothing, so it stays put.
  const reveal = useRevealRequest();
  // A request made before this Canvas mounted (in the list view) is old news.
  const revealed = useRef(reveal?.seq ?? 0);
  useEffect(() => {
    if (reveal === null || revealed.current === reveal.seq) return;
    const node = flow.getInternalNode(reveal.itemId);
    const element = canvasRef.current;
    // A Note just added may not be a node yet; try again when it is.
    if (!node || !element) return;
    revealed.current = reveal.seq;
    const { width, height } = element.getBoundingClientRect();
    const box = {
      ...node.internals.positionAbsolute,
      w: node.width ?? FALLBACK_ITEM_SIZE.w,
      h: node.height ?? FALLBACK_ITEM_SIZE.h,
    };
    if (!isOffScreen(box, flow.getViewport(), { width, height })) return;
    void flow.fitView({
      nodes: [{ id: reveal.itemId }],
      padding: 0.4,
      maxZoom: 1,
      duration: prefersReducedMotion() ? 0 : 450,
    });
  }, [reveal, nodes, flow]);

  const onInit = useCallback(() => {
    if (savedViewport !== null) return;
    const box = firstBox;
    const element = canvasRef.current;
    if (!box || !element) {
      void flow.fitView({ padding: 0.08, maxZoom: 1 });
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    void flow.setViewport(readableViewport(box, { width, height }));
  }, [savedViewport, flow, firstBox]);

  const onlinePeople = useMemo(() => {
    const seen = new Set<string>();
    const list: CanvasViewer[] = [];
    for (const state of presence) {
      if (!state.online || seen.has(state.userId)) continue;
      const person = peopleById.get(state.userId);
      if (!person) continue;
      seen.add(state.userId);
      list.push({
        membershipId: person.membershipId,
        name: person.name,
        imageUrl: person.imageUrl,
      });
    }
    return list;
  }, [presence, peopleById]);

  return (
    <div
      ref={canvasRef}
      className="relative size-full min-h-[480px]"
      data-canvas
    >
      <HeaderPresence people={onlinePeople} me={data.me.membershipId} />
      <ReactFlow<CanvasNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => setSelection(null)}
        onMoveEnd={onMoveEnd}
        onKeyDown={onKeyDown}
        defaultViewport={savedViewport ?? undefined}
        onInit={onInit}
        minZoom={0.15}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        aria-label="Canvas"
        className={cn(
          "bg-canvas",
          "[&_.react-flow__node-item:focus-visible]:rounded-md [&_.react-flow__node-item:focus-visible]:outline-2 [&_.react-flow__node-item:focus-visible]:outline-offset-4 [&_.react-flow__node-item:focus-visible]:outline-focus",
        )}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="var(--rule-strong)"
        />
        <Panel position="top-left" className="m-3! max-w-[calc(100%-1.5rem)]">
          <FunctionFilterChips />
        </Panel>
        <Panel position="bottom-right" className="m-3! flex items-center gap-2">
          {canEdit ? <AddNoteButton eventId={eventId} /> : null}
          {can(role, "section.custom") ? (
            <Button
              variant="tonal"
              size="sm"
              onClick={dialogs.create}
              className="shadow-item"
            >
              <FolderPlus aria-hidden />
              New Section
            </Button>
          ) : null}
          <ZoomControls />
        </Panel>
        {notice ? (
          <Panel position="top-center" className="mt-16!">
            <p
              role="status"
              className="rounded-md border border-item-line bg-surface-raised px-4 py-2.5 text-label text-ink shadow-item"
            >
              {notice}
            </p>
          </Panel>
        ) : null}
        {sections.length === 0 ? (
          <Panel position="top-center" className="mt-20!">
            <p className="rounded-md bg-surface px-4 py-3 text-label text-ink-2 shadow-item">
              This Event has no Sections yet.
            </p>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}

function ZoomControls() {
  const flow = useReactFlow();
  const duration = () => (prefersReducedMotion() ? 0 : 200);
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="flex items-center gap-0.5 rounded-md border border-item-line bg-surface p-0.5 shadow-item"
    >
      <Tooltip content="Zoom out">
        <Button
          variant="text"
          size="sm"
          icon
          aria-label="Zoom out"
          onClick={() => void flow.zoomOut({ duration: duration() })}
        >
          <Minus />
        </Button>
      </Tooltip>
      <Tooltip content="Zoom in">
        <Button
          variant="text"
          size="sm"
          icon
          aria-label="Zoom in"
          onClick={() => void flow.zoomIn({ duration: duration() })}
        >
          <Plus />
        </Button>
      </Tooltip>
      <Tooltip content="Show the whole Canvas">
        <Button
          variant="text"
          size="sm"
          icon
          aria-label="Show the whole Canvas"
          onClick={() =>
            void flow.fitView({
              padding: 0.08,
              maxZoom: 1,
              duration: duration(),
            })
          }
        >
          <Maximize />
        </Button>
      </Tooltip>
    </div>
  );
}

const noSubscription = () => () => {};

/** The presence dots in the workspace header's presence mount point. */
function HeaderPresence({
  people,
  me,
}: {
  people: CanvasViewer[];
  me: string;
}) {
  const mount = useSyncExternalStore(
    noSubscription,
    () => document.querySelector('[data-mount="presence"]'),
    () => null,
  );
  if (!mount || people.length === 0) return null;
  const others = people.filter((p) => p.membershipId !== me);
  return createPortal(
    <div
      className="flex items-center gap-2 pr-1"
      aria-label={`On the Canvas now: ${people.map((p) => p.name).join(", ")}`}
      role="group"
    >
      <AvatarStack>
        {people.slice(0, 5).map((person) => (
          <Avatar
            key={person.membershipId}
            name={
              person.membershipId === me ? `${person.name} (you)` : person.name
            }
            src={person.imageUrl ?? undefined}
            size="sm"
            presence="online"
          />
        ))}
      </AvatarStack>
      {others.length > 0 ? (
        <span className="text-caption text-ink-3 num">
          {others.length === 1
            ? "1 other here"
            : `${others.length} others here`}
        </span>
      ) : null}
    </div>,
    mount,
  );
}
