"use client";

import { useMutation, useQueries } from "convex/react";
import { MessageSquare } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import {
  isOn,
  openCount,
  threadsOf,
  type CommentView,
  type CommentViewTarget,
} from "./threads";

/*
 * Comments on one Item and its Entries (S8). `<ItemComments>` wraps an Item
 * (the Canvas's Item node does it) and gives everything inside the Comment
 * counts and a way to open the thread sheet beside the Item:
 *
 *   - `<ItemFrame>` shows the Item's count in its footer on its own.
 *   - An Entry row adds `<EntryCommentCount entryId={entry._id} />`.
 *   - Anything else can call `useItemComments()?.open(target)`.
 */

export type ItemCommentsState = {
  itemId: Id<"items">;
  /** Comments in open threads on the Item and its Entries; undefined while loading. */
  itemCount: number | undefined;
  /** Comments in open threads on one Entry. */
  entryCount: (entryId: Id<"entries">) => number;
  /** Opens the thread sheet on the Item, or on one of its Entries. */
  open: (target?: CommentViewTarget) => void;
};

/** An Item's Comments: undefined while loading; `failed` when the query threw. */
export type CommentList = {
  comments: CommentView[] | undefined;
  failed: boolean;
};

/** Reads a `useQueries` result, where a failed query is an `Error`, not a throw. */
export function readCommentList(result: unknown): CommentList {
  if (result instanceof Error) return { comments: undefined, failed: true };
  return { comments: result as CommentView[] | undefined, failed: false };
}

/**
 * `api.comments.listForItem` without throwing: a Comments failure hides the
 * counts and shows a notice in the sheet, but never takes the Item down with
 * it (the Item node's error boundary would otherwise blank the whole Item).
 * Every caller on one Item shares one subscription.
 */
export function useCommentList(itemId: Id<"items">): CommentList {
  // useQueries resubscribes whenever this object changes, so keep it stable.
  const queries = useMemo(
    () => ({ list: { query: api.comments.listForItem, args: { itemId } } }),
    [itemId],
  );
  const results = useQueries(queries);
  return readCommentList(results.list);
}

const ItemCommentsContext = createContext<ItemCommentsState | null>(null);

/** The Comments of the Item this component sits in, or null outside `<ItemComments>`. */
export function useItemComments(): ItemCommentsState | null {
  return useContext(ItemCommentsContext);
}

/**
 * Events from the sheet travel up the React tree through the portal into the
 * Item node, where a click would change the Canvas selection. Stop them at
 * the sheet.
 */
const stop = (event: SyntheticEvent) => event.stopPropagation();

export function ItemComments({
  itemId,
  itemLabel,
  children,
}: {
  itemId: Id<"items">;
  /** What the Item is, as the sheet names it: "Budget", "Note". */
  itemLabel: string;
  children: ReactNode;
}) {
  const { comments } = useCommentList(itemId);
  const [openOn, setOpenOn] = useState<CommentViewTarget | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(
    (target?: CommentViewTarget) => {
      setOpenOn(target ?? { kind: "item", itemId });
      setIsOpen(true);
    },
    [itemId],
  );

  const state = useMemo<ItemCommentsState>(
    () => ({
      itemId,
      itemCount: comments === undefined ? undefined : openCount(comments),
      entryCount: (entryId) =>
        comments === undefined
          ? 0
          : openCount(comments, { kind: "entry", itemId, entryId }),
      open,
    }),
    [comments, itemId, open],
  );

  return (
    <ItemCommentsContext.Provider value={state}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        {openOn ? (
          <SheetContent
            side="right"
            title="Comments"
            description={
              openOn.kind === "entry"
                ? `On an Entry in the ${itemLabel}`
                : `On the ${itemLabel}`
            }
            bodyClassName="flex flex-col p-0"
            data-comments-sheet=""
            onClick={stop}
            onMouseUp={stop}
            onPointerDown={stop}
            onKeyUp={stop}
            onDoubleClick={stop}
          >
            <CommentsSheetBody itemId={itemId} on={openOn} />
          </SheetContent>
        ) : null}
      </Sheet>
    </ItemCommentsContext.Provider>
  );
}

function CommentsSheetBody({
  itemId,
  on,
}: {
  itemId: Id<"items">;
  on: CommentViewTarget;
}) {
  const { comments, failed } = useCommentList(itemId);
  const add = useMutation(api.comments.add);

  // Opened on an Entry: that Entry's threads. On the Item: every thread on
  // the Item and its Entries, each labelled with what it is on.
  const threads = comments
    ? threadsOf(comments).filter((t) => on.kind === "item" || isOn(t.root, on))
    : undefined;
  const open = threads?.filter((t) => !t.root.resolved) ?? [];
  const resolved = threads?.filter((t) => t.root.resolved) ?? [];
  const mixed =
    on.kind === "item" &&
    (threads ?? []).some((t) => t.root.target.kind === "entry");
  const labelOf = (target: CommentViewTarget) =>
    mixed
      ? target.kind === "entry"
        ? "On an Entry"
        : "On this Item"
      : undefined;

  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        data-comments-list=""
      >
        {failed ? (
          <p role="alert" className="text-label text-warn">
            Comments couldn&apos;t load. Close this and try again in a moment.
          </p>
        ) : threads === undefined ? (
          <p className="text-label text-ink-3" aria-live="polite">
            Loading Comments…
          </p>
        ) : threads.length === 0 ? (
          <EmptyComments />
        ) : (
          <div className="grid gap-3">
            {open.length === 0 ? (
              <p className="text-label text-ink-2">
                Every thread here is resolved.
              </p>
            ) : (
              <ol className="grid gap-3" aria-label="Open threads">
                {open.map((t) => (
                  <li key={t.root._id}>
                    <CommentThread
                      itemId={itemId}
                      rootId={t.root._id}
                      label={labelOf(t.root.target)}
                    />
                  </li>
                ))}
              </ol>
            )}
            {resolved.length > 0 ? (
              <Accordion>
                <AccordionItem value="resolved">
                  <AccordionTrigger>
                    Resolved ({resolved.length})
                  </AccordionTrigger>
                  <AccordionPanel>
                    <ol className="grid gap-3 pt-1">
                      {resolved.map((t) => (
                        <li key={t.root._id}>
                          <CommentThread
                            itemId={itemId}
                            rootId={t.root._id}
                            label={labelOf(t.root.target)}
                          />
                        </li>
                      ))}
                    </ol>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            ) : null}
          </div>
        )}
      </div>
      <div className="border-t border-rule bg-surface-raised px-5 pt-3 pb-4">
        <CommentComposer
          label={
            on.kind === "entry" ? "Comment on this Entry" : "Add a Comment"
          }
          placeholder="Everyone in the Event sees it"
          submitLabel="Comment"
          onSubmit={async (body) => {
            await add({ target: on, body, rootId: null });
          }}
        />
      </div>
    </>
  );
}

function EmptyComments() {
  return (
    <div className="grid justify-items-start gap-1.5 py-2">
      <span
        aria-hidden
        className="mb-1 flex size-9 items-center justify-center rounded-full bg-action-tonal text-on-action-tonal [&_svg]:size-4"
      >
        <MessageSquare />
      </span>
      <p className="text-body font-semibold text-ink">No Comments yet</p>
      <p className="max-w-[34ch] text-label text-ink-2">
        Ask a question or leave a thought. Members and Viewers see it as soon as
        you send it.
      </p>
    </div>
  );
}

/**
 * An Entry row's Comment count. A quiet icon when there are none, so the row
 * stays calm; the count once someone has commented. Opens the Entry's threads.
 */
export function EntryCommentCount({
  entryId,
  className,
}: {
  entryId: Id<"entries">;
  className?: string;
}) {
  const comments = useItemComments();
  if (!comments) return null;
  const count = comments.entryCount(entryId);
  const label =
    count === 0
      ? "Comment on this Entry"
      : `${count} ${count === 1 ? "Comment" : "Comments"} on this Entry`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-entry-comments={count}
      onClick={(event) => {
        event.stopPropagation();
        comments.open({ kind: "entry", itemId: comments.itemId, entryId });
      }}
      className={cn(
        "state-layer inline-flex h-7 shrink-0 items-center gap-1 rounded-xs px-1.5 text-caption font-medium",
        count === 0 ? "text-ink-3" : "text-ink-2",
        className,
      )}
    >
      <MessageSquare aria-hidden className="size-3.5" />
      {count > 0 ? <span className="num">{count}</span> : null}
    </button>
  );
}
