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
import { useSelection, useSetSelection } from "@/components/shell/selection";
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
  sectionBox,
  sectionUnder,
} from "@/lib/canvas/layout";
import { FALLBACK_ITEM_SIZE } from "@/lib/canvas/placement";
import { isStartingSection } from "@/lib/canvas/starting";
import type { SelectionTarget } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";
import {
  FunctionFilterChips,
  FunctionFilterProvider,
  useFunctionFilter,
} from "./FunctionFilter";
import {
  ITEM_DRAG_HANDLE,
  ItemNode,
  itemAriaLabel,
  type CanvasViewer,
  type ItemNodeType,
} from "./ItemNode";
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

function selectionOf(state: PresenceState): SelectionTarget | null {
  const data = state.data as { selection?: SelectionTarget | null } | undefined;
  return data?.selection ?? null;
}

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
  useEffect(() => {
    setPresenceSelection({ eventId, target: selection }).catch(() => {});
  }, [eventId, selection, setPresenceSelection]);

  const peopleById = useMemo(
    () => new Map(data.people.map((p) => [p.membershipId as string, p])),
    [data.people],
  );
  const viewersByItem = useMemo(() => {
    const map = new Map<string, CanvasViewer[]>();
    for (const state of presence) {
      if (!state.online || state.userId === data.me.membershipId) continue;
      const target = selectionOf(state);
      const person = peopleById.get(state.userId);
      if (!target || !person) continue;
      const list = map.get(target.itemId) ?? [];
      list.push({
        membershipId: person.membershipId,
        name: person.name,
        imageUrl: person.imageUrl,
      });
      map.set(target.itemId, list);
    }
    return map;
  }, [presence, peopleById, data.me.membershipId]);

  // The Assistant's pointing: highlights until they expire.
  const [now, setNow] = useState<number | null>(null);
  const latestExpiry = Math.max(0, ...data.highlights.map((h) => h.expiresAt));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (latestExpiry === 0) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [latestExpiry]);
  const activeHighlights = useMemo(
    () =>
      now === null ? [] : data.highlights.filter((h) => h.expiresAt > now),
    [data.highlights, now],
  );
  const pointedIds = useMemo(
    () =>
      new Set(activeHighlights.flatMap((h) => h.targets.map((t) => t.itemId))),
    [activeHighlights],
  );

  // Items that arrive while this Canvas is open land marked as new.
  const knownIds = useRef<Set<string> | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = data.items.map((item) => item._id as string);
    if (knownIds.current === null) {
      knownIds.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !knownIds.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) knownIds.current.add(id);
    setArrived((prev) => new Set([...prev, ...fresh]));
    const timer = window.setTimeout(() => {
      setArrived((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, [data.items]);

  // Sections with their drawn boxes, grown to hold their Items.
  const sections = useMemo(() => {
    return data.sections.map((section) => {
      const items = data.items.filter((i) => i.sectionId === section._id);
      return { section, items, box: sectionBox(section.frame, items) };
    });
  }, [data.sections, data.items]);

  const functionNames = useMemo(
    () => new Map(data.functions.map((fn) => [fn.key, fn.name])),
    [data.functions],
  );
  const selectedItemId = selection?.itemId ?? null;

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
            isSelected: selectedItemId === item._id,
            pointed: pointedIds.has(item._id),
            dimmed: filter.dims(item.functionKey),
            arrived: arrived.has(item._id),
            viewers: viewersByItem.get(item._id) ?? [],
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
    pointedIds,
    filter,
    arrived,
    viewersByItem,
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
                    x: Math.round(args.position.x),
                    y: Math.round(args.position.y),
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
          void moveSection({
            sectionId: node.id as Id<"sections">,
            position: {
              x: absolute.x + SECTION_PAD_X,
              y: absolute.y + SECTION_HEADER,
            },
          });
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
        void moveItem({
          itemId: item._id,
          sectionId: target.section._id,
          position: itemPositionFromBox({
            x: absolute.x - target.box.x,
            y: absolute.y - target.box.y,
          }),
        });
      }
    },
    [flow, sections, moveItem, moveSection, built],
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
    <div className="relative size-full min-h-[480px]" data-canvas>
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
        fitView={savedViewport === null}
        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
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
