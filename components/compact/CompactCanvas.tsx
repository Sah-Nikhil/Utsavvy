"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ChevronDown, Layers, Rows3, StickyNote } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  CanvasItemState,
  CanvasViewer,
} from "@/components/canvas/CanvasItemContext";
import {
  FunctionFilterChips,
  FunctionFilterProvider,
  useFunctionFilter,
} from "@/components/canvas/FunctionFilter";
import { errorMessage } from "@/components/people/errors";
import { SectionOrnament } from "@/components/shell/SectionOrnament";
import { useSelection, useSetSelection } from "@/components/shell/selection";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FunctionMarker } from "@/components/ui/function-marker";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { can } from "@/lib/access/permissions";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { CompactItem, type CompactItemProps } from "./CompactItem";
import {
  groupItems,
  moveWithin,
  type CompactGroup,
  type Grouping,
} from "./grouping";
import { useCanvasLive, type CanvasData } from "./useCanvasLive";

/*
 * Compact mode (S16, ADR 0007): the same Items as the freeform Canvas, in
 * collapsible groups, by kind (the Canvas's Sections) or by Function. It is the
 * keyboard and screen-reader route to everything on the Canvas (section 8), so
 * it is a plain document: a heading per group, a list of Items, real buttons.
 * Each person's grouping, order and collapse state is their own (`viewPrefs`).
 * On a phone it is the Canvas tab.
 */

export type CompactCanvasProps = {
  eventId: string;
  /** Overrides the person's grouping; left out, their `viewPrefs` decide. */
  grouping?: Grouping;
  /** An Item to scroll to and select, e.g. from a reference tapped in the Chat. */
  focusItemId?: string | null;
  /** Shown above the list, e.g. "Back to Chat" or the switch to the freeform Canvas. */
  toolbarStart?: ReactNode;
  /** Phone width: no drag handles; moving Items between Sections stays on desktop. */
  phone?: boolean;
};

export function CompactCanvas(props: CompactCanvasProps) {
  const { isAuthenticated } = useConvexAuth();
  const eventId = props.eventId as Id<"events">;
  const data = useQuery(api.canvas.get, isAuthenticated ? { eventId } : "skip");
  const prefs = useQuery(
    api.viewPrefs.get,
    isAuthenticated ? { eventId } : "skip",
  );
  if (data === undefined || prefs === undefined) {
    return (
      <div
        role="status"
        className="flex min-h-[240px] items-center justify-center text-label text-ink-3"
      >
        Opening the Canvas…
      </div>
    );
  }
  return (
    <FunctionFilterProvider functions={data.functions}>
      <CompactList {...props} eventId={eventId} data={data} prefs={prefs} />
    </FunctionFilterProvider>
  );
}

type Prefs = NonNullable<ReturnType<typeof useQuery<typeof api.viewPrefs.get>>>;

function CompactList({
  eventId,
  data,
  prefs,
  grouping: groupingProp,
  focusItemId = null,
  toolbarStart,
  phone = false,
}: Omit<CompactCanvasProps, "eventId"> & {
  eventId: Id<"events">;
  data: CanvasData;
  prefs: Prefs;
}) {
  const filter = useFunctionFilter();
  const selection = useSelection();
  const setSelection = useSetSelection();
  const live = useCanvasLive(eventId, data);
  const canEdit = can(data.me.role, "canvas.edit");

  // Personal preferences, saved at once and shown before the round trip.
  const setPrefs = useMutation(api.viewPrefs.set).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.viewPrefs.get, { eventId });
      if (!current) return;
      store.setQuery(
        api.viewPrefs.get,
        { eventId },
        {
          ...current,
          ...(args.grouping !== undefined
            ? {
                ownGrouping: args.grouping,
                grouping: args.grouping ?? current.grouping,
              }
            : {}),
          ...(args.order !== undefined ? { order: args.order } : {}),
          ...(args.collapsed !== undefined
            ? { collapsed: args.collapsed }
            : {}),
        },
      );
    },
  );
  const grouping = groupingProp ?? prefs.grouping;

  const functionNames = useMemo(
    () => new Map(data.functions.map((fn) => [fn.key, fn.name])),
    [data.functions],
  );
  const groups = useMemo(
    () =>
      groupItems({
        grouping,
        sections: data.sections,
        functions: data.functions,
        items: data.items,
        order: prefs.order,
        functionKey: filter.functionKey,
      }),
    [
      grouping,
      data.sections,
      data.functions,
      data.items,
      prefs.order,
      filter.functionKey,
    ],
  );
  const collapsed = useMemo(() => new Set(prefs.collapsed), [prefs.collapsed]);

  const toggleGroup = useCallback(
    (key: string) => {
      const next = collapsed.has(key)
        ? prefs.collapsed.filter((k) => k !== key)
        : [...prefs.collapsed, key];
      setPrefs({ eventId, collapsed: next }).catch(() => {});
    },
    [collapsed, prefs.collapsed, setPrefs, eventId],
  );

  const reorder = useCallback(
    (group: CompactGroup<Doc<"items">>, itemIds: string[]) => {
      const order = [
        ...prefs.order.filter((o) => o.group !== group.key),
        { group: group.key, itemIds: itemIds as Id<"items">[] },
      ];
      setPrefs({ eventId, order }).catch(() => {});
    },
    [prefs.order, setPrefs, eventId],
  );

  // Jumping to an Item: open its group, select it and bring it into view.
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const reveal = useCallback(
    (itemId: string) => {
      const group = groups.find((g) => g.items.some((i) => i._id === itemId));
      // After this render: open the group, mark the Item, then scroll to it.
      window.requestAnimationFrame(() => {
        if (group && collapsed.has(group.key)) toggleGroup(group.key);
        setFocused(itemId);
      });
      window.setTimeout(() => {
        const row = listRef.current?.querySelector<HTMLElement>(
          `[data-item-row="${itemId}"]`,
        );
        row?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      }, 60);
    },
    [groups, collapsed, toggleGroup],
  );
  const shownFocus = useRef<string | null>(null);
  useEffect(() => {
    if (focusItemId === null) {
      shownFocus.current = null;
      return;
    }
    if (shownFocus.current === focusItemId) return;
    shownFocus.current = focusItemId;
    setSelection({ kind: "item", itemId: focusItemId as Id<"items"> });
    reveal(focusItemId);
  }, [focusItemId, reveal, setSelection]);
  useEffect(() => {
    if (focused === null) return;
    const timer = window.setTimeout(() => setFocused(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focused]);

  // Bring the asker's own new highlights into view, as the Canvas pans to them.
  const revealed = useRef(new Set<string>());
  useEffect(() => {
    for (const highlight of live.activeHighlights) {
      if (revealed.current.has(highlight._id)) continue;
      revealed.current.add(highlight._id);
      if (highlight.forMembershipId !== data.me.membershipId) continue;
      const first = highlight.targets[0];
      if (first) reveal(first.itemId);
    }
  }, [live.activeHighlights, data.me.membershipId, reveal]);

  // A passage picked by touch: phones don't send mouseup after a long press.
  useEffect(() => {
    if (!phone) return;
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const range = window.getSelection();
        if (!range || range.isCollapsed || range.rangeCount === 0) return;
        const node = range.getRangeAt(0).startContainer;
        const element = node instanceof Element ? node : node.parentElement;
        element
          ?.closest<HTMLElement>("[data-item-id]")
          ?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }, 350);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [phone]);

  const stateFor = useCallback(
    (item: Doc<"items">): CanvasItemState => ({
      itemId: item._id,
      selection: selection?.itemId === item._id ? selection : null,
      selected: selection?.itemId === item._id,
      pointed: live.pointedItems.has(item._id),
      pointedEntryIds: live.pointedEntries.get(item._id) ?? noEntryIds,
      viewers: live.viewersByItem.get(item._id) ?? noViewers,
      viewersByEntry: live.viewersByEntry.get(item._id) ?? noEntryViewers,
      functionIndex: item.functionKey
        ? filter.indexOf(item.functionKey)
        : undefined,
      functionName: item.functionKey
        ? functionNames.get(item.functionKey)
        : undefined,
      dimmed: false,
    }),
    [selection, live, filter, functionNames],
  );

  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div
      ref={listRef}
      data-compact
      data-grouping={grouping}
      className="mx-auto grid w-full max-w-3xl gap-5 px-3 pt-3 pb-24 sm:px-5 sm:pt-4"
    >
      <HeaderPresence people={live.online} me={data.me.membershipId} />
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {toolbarStart}
          <div className="flex-1" />
          <GroupingSwitch
            value={grouping}
            onChange={(next) =>
              setPrefs({ eventId, grouping: next }).catch(() => {})
            }
          />
        </div>
        {data.functions.length > 0 ? (
          <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            <FunctionFilterChips />
          </div>
        ) : null}
      </div>

      <h2 className="sr-only">
        {grouping === "kind" ? "Items by Section" : "Items by Function"}
      </h2>
      <p className="sr-only" aria-live="polite">
        {filter.functionKey
          ? `Showing ${itemCount} Items for ${functionNames.get(filter.functionKey) ?? "one Function"} and the whole Event.`
          : ""}
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-label text-ink-2">
          {grouping === "function"
            ? "Nothing on the Canvas yet."
            : "This Event has no Sections yet."}
        </p>
      ) : null}

      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          open={!collapsed.has(group.key)}
          onToggle={() => toggleGroup(group.key)}
          functionIndex={
            group.functionKey ? filter.indexOf(group.functionKey) : undefined
          }
          footer={
            canEdit &&
            group.sectionId !== undefined &&
            data.sections.find((s) => s._id === group.sectionId)?.kind ===
              "notes" ? (
              <AddNote eventId={eventId} functionKey={filter.functionKey} />
            ) : null
          }
        >
          <SortableItems
            group={group}
            draggable={!phone}
            focused={focused}
            stateFor={stateFor}
            onReorder={(ids) => reorder(group, ids)}
          />
        </GroupSection>
      ))}
    </div>
  );
}

const noViewers: CanvasViewer[] = [];
const noEntryViewers = new Map<string, CanvasViewer[]>();
const noEntryIds = new Set<string>();

// ---------------------------------------------------------------------------

function GroupingSwitch({
  value,
  onChange,
}: {
  value: Grouping;
  onChange: (value: Grouping) => void;
}) {
  const options: { value: Grouping; label: string; icon: ReactNode }[] = [
    { value: "kind", label: "By Section", icon: <Rows3 aria-hidden /> },
    { value: "function", label: "By Function", icon: <Layers aria-hidden /> },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Group Items"
      className="flex items-center rounded-full bg-surface-sunk p-0.5"
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (
                event.key === "ArrowRight" ||
                event.key === "ArrowLeft" ||
                event.key === "ArrowDown" ||
                event.key === "ArrowUp"
              ) {
                event.preventDefault();
                const other = options.find((o) => o.value !== option.value)!;
                onChange(other.value);
                (
                  event.currentTarget.parentElement?.querySelector(
                    `[data-grouping-option="${other.value}"]`,
                  ) as HTMLElement | null
                )?.focus();
              }
            }}
            tabIndex={checked ? 0 : -1}
            data-grouping-option={option.value}
            className={cn(
              "state-layer inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-label font-semibold text-ink-2",
              "transition-[background-color,color,box-shadow] duration-(--dur-feedback) ease-standard",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "[&_svg]:size-3.5",
              checked && "bg-surface text-action shadow-item",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function GroupSection({
  group,
  open,
  onToggle,
  functionIndex,
  footer,
  children,
}: {
  group: CompactGroup<Doc<"items">>;
  open: boolean;
  onToggle: () => void;
  functionIndex?: ReturnType<ReturnType<typeof useFunctionFilter>["indexOf"]>;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const panelId = useId();
  const count = `${group.items.length} ${group.items.length === 1 ? "Item" : "Items"}`;
  return (
    <section
      aria-labelledby={headingId}
      data-group={group.key}
      className="relative rounded-xl bg-surface/40 px-2 pt-1 pb-2 sm:px-3"
    >
      <SectionOrnament />
      <h3 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            "state-layer group/toggle flex min-h-12 w-full items-center gap-2.5 rounded-lg pr-2 pl-10 text-left ornaments-off:pl-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          {functionIndex ? <FunctionMarker index={functionIndex} /> : null}
          <span
            className={cn(
              "min-w-0 truncate text-[15px] leading-[1.45] text-ink",
              scriptClass(group.label)
                ? ["font-text font-medium", scriptClass(group.label)]
                : "font-display font-medium",
            )}
          >
            {group.label}
          </span>
          <span className="shrink-0 font-display text-label text-ink-3">
            {count}
          </span>
          <span className="flex-1" />
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-ink-3 transition-transform duration-(--dur-feedback) ease-standard",
              !open && "-rotate-90",
            )}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="pt-3">
        {group.items.length === 0 ? (
          <p className="px-2 pb-2 text-label text-ink-3">
            Nothing in this Section yet.
          </p>
        ) : (
          children
        )}
        {footer}
      </div>
    </section>
  );
}

function SortableItems({
  group,
  draggable,
  focused,
  stateFor,
  onReorder,
}: {
  group: CompactGroup<Doc<"items">>;
  draggable: boolean;
  focused: string | null;
  stateFor: (item: Doc<"items">) => CanvasItemState;
  onReorder: (itemIds: string[]) => void;
}) {
  const ids = group.items.map((i) => i._id as string);
  const list = (
    <ul className="grid gap-6 pt-1">
      {group.items.map((item, index) => {
        const props = {
          item,
          state: stateFor(item),
          position: { index, count: group.items.length },
          focused: focused === item._id,
          onMove: (delta: -1 | 1) =>
            onReorder(moveWithin(ids, item._id, delta)),
        };
        // dnd kit only where dragging is on: it marks a sortable without a
        // handle as a button, which would wrap the Item's own controls.
        return draggable ? (
          <SortableRow key={item._id} group={group.key} {...props} />
        ) : (
          <CompactItem key={item._id} {...props} />
        );
      })}
    </ul>
  );
  if (!draggable) return list;
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        const source = event.operation.source;
        if (!isSortable(source)) return;
        const from = source.initialIndex;
        const to = source.index;
        if (from === to) return;
        const next = [...ids];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        onReorder(next);
      }}
    >
      {list}
    </DragDropProvider>
  );
}

function SortableRow({
  group,
  ...props
}: Omit<CompactItemProps, "rowRef" | "handleRef" | "dragging"> & {
  group: string;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: props.item._id,
    index: props.position.index,
    group,
  });
  return (
    <CompactItem
      {...props}
      rowRef={ref}
      handleRef={handleRef}
      dragging={isDragging}
    />
  );
}

/** "Add a Note": the Notes Section's own way to add an Item, on a phone too. */
function AddNote({
  eventId,
  functionKey,
}: {
  eventId: Id<"events">;
  functionKey: string | null;
}) {
  const add = useMutation(api.notes.add);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  if (!open) {
    return (
      <Button
        variant="text"
        size="sm"
        className="mt-3"
        onClick={() => setOpen(true)}
      >
        <StickyNote aria-hidden />
        Add a Note
      </Button>
    );
  }
  return (
    <form
      className="mt-3 grid gap-1.5 rounded-md border border-item-line bg-surface p-3 shadow-item"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        add({ eventId, text, functionKey })
          .then(() => {
            setText("");
            setOpen(false);
          })
          .catch((err: unknown) =>
            setError(errorMessage(err, "The Note didn't save. Try again.")),
          )
          .finally(() => setBusy(false));
      }}
    >
      <textarea
        // The person asked to write a Note just now.
        autoFocus
        aria-label="New Note"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "w-full min-w-0 resize-y rounded-xs border border-rule-strong bg-surface px-2 py-1.5 text-body text-ink",
          "focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
          scriptClass(text),
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" variant="tonal" size="sm" disabled={busy}>
          Add Note
        </Button>
      </div>
    </form>
  );
}

const noSubscription = () => () => {};

/** The presence dots in the workspace header, as the freeform Canvas shows them. */
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
