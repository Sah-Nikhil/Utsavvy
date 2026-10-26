"use client";

import { useMutation, useQuery } from "convex/react";
import { ListChecks, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  useCanvasItem,
  ViewerAvatars,
} from "@/components/canvas/CanvasItemContext";
import {
  AddForm,
  EditableText,
  ExpandButton,
  FunctionSelect,
  InlineEdit,
  Loading,
  RowError,
  TinyIconButton,
  entrySelected,
  functionIndexer,
  inlineControlClass,
  useRowAction,
} from "@/components/items/budget/parts";
import { EntryCommentCount } from "@/components/comments/ItemComments";
import { ItemFrame } from "@/components/items/ItemFrame";
import type { ItemComponentProps } from "@/components/items/registry";
import { formatDay } from "@/components/items/timeline/format";
import { Badge } from "@/components/ui/badge";
import { FunctionMarker } from "@/components/ui/function-marker";
import { FindVendors } from "@/components/vendors/FindVendors";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { CHECKLIST_STATUS_LABELS, type ChecklistStatus } from "./status";
import { categoryName } from "@/lib/canvas/entryLabel";

/*
 * The Vendor checklist (S4): one row per Vendor the plan needs, with the
 * Functions it serves, its book-by day from the Timeline, and a status worked
 * out from its Vendor links (to find, shortlisted, booked), never typed in.
 */

type ChecklistEntry = Extract<Doc<"entries">, { kind: "checklist" }>;
type View = NonNullable<
  ReturnType<typeof useQuery<typeof api.entries.forItem>>
>;

export { categoryName };

const STATUS_TONE: Record<ChecklistStatus, "neutral" | "action" | "booked"> = {
  toFind: "neutral",
  shortlisted: "action",
  booked: "booked",
};

export function ChecklistItem({ item }: ItemComponentProps<"checklist">) {
  const canvas = useCanvasItem();
  const view = useQuery(api.entries.forItem, { itemId: item._id });
  const toFind =
    view === undefined
      ? null
      : Object.values(view.checklistStatus).filter((s) => s === "toFind")
          .length;
  return (
    <ItemFrame
      kind="Vendor checklist"
      icon={<ListChecks />}
      title="Vendor checklist"
      meta={toFind === null ? undefined : `${toFind} to find`}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      actions={
        <ExpandButton
          title="Vendor checklist"
          description="Every Vendor the plan needs"
        >
          <ChecklistBody itemId={item._id} view={view} />
        </ExpandButton>
      }
    >
      <ChecklistBody itemId={item._id} view={view} />
    </ItemFrame>
  );
}

function ChecklistBody({
  itemId,
  view,
}: {
  itemId: Id<"items">;
  view: View | undefined;
}) {
  const add = useMutation(api.entries.add);
  const action = useRowAction();
  const [label, setLabel] = useState("");
  const [functionKey, setFunctionKey] = useState<string | null>(null);

  if (view === undefined) return <Loading />;
  const entries = view.entries.filter(
    (e): e is ChecklistEntry => e.kind === "checklist",
  );
  const { functions, canEdit } = view;

  return (
    <div className="grid gap-2.5">
      {entries.length === 0 ? (
        <p className="text-label text-ink-3">
          No Vendors on the checklist yet. Add one below, or ask the Assistant
          to plan it.
        </p>
      ) : (
        <ul className="grid gap-px">
          {entries.map((entry) => (
            <ChecklistRow
              key={entry._id}
              entry={entry}
              status={view.checklistStatus[entry._id] ?? "toFind"}
              bookBy={view.bookBy[entry._id] ?? null}
              functions={functions}
              canEdit={canEdit}
              run={action.run}
            />
          ))}
        </ul>
      )}

      <RowError error={action.error} />

      {canEdit ? (
        <AddForm
          label="Add a Vendor to the checklist"
          onSubmit={async () => {
            await add({
              itemId,
              functionKey: null,
              input: {
                kind: "checklist",
                label,
                functionKeys: functionKey === null ? [] : [functionKey],
              },
            });
            setLabel("");
          }}
        >
          <input
            aria-label="New Vendor to find"
            placeholder="e.g. Safa tying"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inlineControlClass(
              cn("min-w-28 flex-[2_1_9rem]", scriptClass(label)),
            )}
          />
          {functions.length > 0 ? (
            <FunctionSelect
              label="Function it serves"
              functions={functions}
              value={functionKey}
              onChange={setFunctionKey}
            />
          ) : null}
        </AddForm>
      ) : null}
    </div>
  );
}

function ChecklistRow({
  entry,
  status,
  bookBy,
  functions,
  canEdit,
  run,
}: {
  entry: ChecklistEntry;
  status: ChecklistStatus;
  bookBy: string | null;
  functions: View["functions"];
  canEdit: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const canvas = useCanvasItem();
  const update = useMutation(api.entries.update);
  const remove = useMutation(api.entries.remove);
  const [editing, setEditing] = useState(false);
  const { fields } = entry;
  const name =
    fields.freeLabel ??
    (fields.vendorCategory ? categoryName(fields.vendorCategory) : "Vendor");
  const indexOf = functionIndexer(functions);
  const served = fields.functionKeys
    .map((key) => functions.find((fn) => fn.key === key))
    .filter((fn) => fn !== undefined);
  const pointed = canvas?.pointedEntryIds.has(entry._id) ?? false;
  const selected = entrySelected(canvas?.selection ?? null, entry._id);

  return (
    <li
      data-entry-id={entry._id}
      data-pointed={pointed || undefined}
      className={cn(
        "group/row relative flex min-w-0 items-start gap-2 rounded-xs px-1.5 py-1.5",
        "transition-colors duration-(--dur-feedback) ease-standard",
        selected && "bg-selected",
        pointed && "bg-point-field",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">
        {editing ? (
          <InlineEdit
            label={`Name of ${name}`}
            initial={name}
            onSave={(value) =>
              update({
                entryId: entry._id,
                patch: { kind: "checklist", label: value },
              })
            }
            onDone={() => setEditing(false)}
          />
        ) : (
          <EditableText
            text={name}
            canEdit={canEdit}
            onEdit={() => setEditing(true)}
            editLabel={`Rename ${name}`}
            className="text-label font-medium"
          />
        )}
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-ink-3">
          {served.length === 0 ? (
            <span>Event-wide</span>
          ) : (
            served.map((fn) => {
              const index = indexOf(fn.key);
              return (
                <span key={fn.key} className="inline-flex items-center gap-1">
                  {index ? <FunctionMarker index={index} /> : null}
                  {fn.name}
                </span>
              );
            })
          )}
          {bookBy ? (
            <>
              <span aria-hidden>·</span>
              <span className="num">book by {formatDay(bookBy)}</span>
            </>
          ) : null}
        </p>
      </div>
      <EntryCommentCount
        entryId={entry._id}
        entryLabel={name}
        className="shrink-0"
      />
      <ViewerAvatars
        viewers={canvas?.viewersByEntry.get(entry._id) ?? []}
        className="shrink-0"
      />
      <Badge tone={STATUS_TONE[status]} className="mt-px">
        {CHECKLIST_STATUS_LABELS[status]}
      </Badge>
      {canEdit && fields.vendorCategory ? (
        <FindVendors
          eventId={entry.eventId}
          entryId={entry._id}
          entryName={name}
          category={fields.vendorCategory}
          functionKeys={fields.functionKeys}
          functions={functions}
        />
      ) : null}
      {canEdit ? (
        <TinyIconButton
          label={`Delete ${name}`}
          tone="warn"
          onClick={() => run(() => remove({ entryId: entry._id }))}
          className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100"
        >
          <Trash2 />
        </TinyIconButton>
      ) : null}
    </li>
  );
}
