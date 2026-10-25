"use client";

import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  useCanvasItem,
  ViewerAvatars,
} from "@/components/canvas/CanvasItemContext";
import {
  AddForm,
  AssumedTag,
  EditableText,
  ExpandButton,
  FunctionSelect,
  GroupHeading,
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
import { Badge } from "@/components/ui/badge";
import { FunctionMarker } from "@/components/ui/function-marker";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { formatDay, formatTime, splitTimeline } from "./format";

/*
 * The Timeline (S4): deadlines worked back from the Event's dates, late ones
 * marked "late" with their note, and each Function's run sheet with its times.
 */

type TimelineEntry = Extract<Doc<"entries">, { kind: "timeline" }>;
type View = NonNullable<
  ReturnType<typeof useQuery<typeof api.entries.forItem>>
>;

export function TimelineItem({ item }: ItemComponentProps<"timeline">) {
  const canvas = useCanvasItem();
  const view = useQuery(api.entries.forItem, { itemId: item._id });
  const open =
    view?.entries.filter(
      (e) => e.kind === "timeline" && e.fields.time === null && !e.fields.done,
    ).length ?? null;
  return (
    <ItemFrame
      kind="Timeline"
      icon={<CalendarClock />}
      title="Timeline"
      meta={open === null ? undefined : `${open} to do`}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      actions={
        <ExpandButton
          title="Timeline"
          description="Deadlines and each Function's run sheet"
        >
          <TimelineBody itemId={item._id} view={view} />
        </ExpandButton>
      }
    >
      <TimelineBody itemId={item._id} view={view} />
    </ItemFrame>
  );
}

function TimelineBody({
  itemId,
  view,
}: {
  itemId: Id<"items">;
  view: View | undefined;
}) {
  const add = useMutation(api.entries.add);
  const action = useRowAction();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [functionKey, setFunctionKey] = useState<string | null>(null);

  if (view === undefined) return <Loading />;
  const entries = view.entries.filter(
    (e): e is TimelineEntry => e.kind === "timeline",
  );
  const { functions, canEdit } = view;
  const indexOf = functionIndexer(functions);
  const names = new Map(functions.map((fn) => [fn.key, fn]));
  const { deadlines, runSheets } = splitTimeline(
    entries,
    functions.map((fn) => fn.key),
  );

  return (
    <div className="grid gap-2.5">
      {entries.length === 0 ? (
        <p className="text-label text-ink-3">
          No deadlines yet. Add one below, or ask the Assistant to plan the
          Timeline.
        </p>
      ) : null}

      {deadlines.length > 0 ? (
        <section aria-label="Deadlines" className="grid gap-1">
          <GroupHeading name="Deadlines" />
          <ul className="grid gap-px">
            {deadlines.map((entry) => (
              <DeadlineRow
                key={entry._id}
                entry={entry}
                functionName={
                  entry.functionKey
                    ? names.get(entry.functionKey)?.name
                    : undefined
                }
                canEdit={canEdit}
                run={action.run}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {runSheets.map((sheet) => {
        const fn = names.get(sheet.functionKey);
        const index = indexOf(sheet.functionKey);
        const day =
          fn?.date?.kind === "day"
            ? formatDay(fn.date.value, { year: false })
            : null;
        return (
          <section
            key={sheet.functionKey}
            aria-label={`Run sheet, ${fn?.name ?? sheet.functionKey}`}
            className="grid gap-1"
          >
            <GroupHeading
              marker={index ? <FunctionMarker index={index} /> : null}
              name={`${fn?.name ?? sheet.functionKey} run sheet`}
              aside={
                day ? <span className="num font-normal">{day}</span> : null
              }
            />
            <ol className="grid gap-px">
              {sheet.entries.map((entry) => (
                <RunSheetRow
                  key={entry._id}
                  entry={entry}
                  canEdit={canEdit}
                  run={action.run}
                />
              ))}
            </ol>
          </section>
        );
      })}

      <RowError error={action.error} />

      {canEdit ? (
        <AddForm
          label="Add to the Timeline"
          onSubmit={async () => {
            await add({
              itemId,
              functionKey,
              input: {
                kind: "timeline",
                title,
                date: date === "" ? null : date,
                time: time === "" ? null : time,
                note: null,
              },
            });
            setTitle("");
            setDate("");
            setTime("");
          }}
        >
          <input
            aria-label="New Timeline Entry"
            placeholder="e.g. Book the DJ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inlineControlClass(
              cn("min-w-28 flex-[2_1_9rem]", scriptClass(title)),
            )}
          />
          <input
            aria-label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inlineControlClass("num w-auto")}
          />
          {functions.length > 0 ? (
            <>
              <FunctionSelect
                label="Function"
                noneLabel="No Function"
                functions={functions}
                value={functionKey}
                onChange={setFunctionKey}
              />
              <input
                aria-label="Run sheet time (with a Function)"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inlineControlClass("num w-auto")}
              />
            </>
          ) : null}
        </AddForm>
      ) : null}
    </div>
  );
}

type RowProps = {
  entry: TimelineEntry;
  canEdit: boolean;
  run: (action: () => Promise<unknown>) => void;
};

function useRow(entry: TimelineEntry) {
  const canvas = useCanvasItem();
  return {
    pointed: canvas?.pointedEntryIds.has(entry._id) ?? false,
    selected: entrySelected(canvas?.selection ?? null, entry._id),
    viewers: canvas?.viewersByEntry.get(entry._id) ?? [],
    update: useMutation(api.entries.update),
    confirm: useMutation(api.entries.confirmAssumption),
    remove: useMutation(api.entries.remove),
  };
}

const rowClass = (selected: boolean, pointed: boolean) =>
  cn(
    "group/row relative flex min-w-0 items-start gap-2 rounded-xs px-1.5 py-1.5",
    "transition-colors duration-(--dur-feedback) ease-standard",
    selected && "bg-selected",
    pointed && "bg-point-field",
  );

const hoverReveal =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100";

function DeadlineRow({
  entry,
  functionName,
  canEdit,
  run,
}: RowProps & { functionName: string | undefined }) {
  const row = useRow(entry);
  const tick = useMutation(api.entries.tick);
  const [editing, setEditing] = useState<"title" | "date" | null>(null);
  const { fields, assumed } = entry;
  // Shows the tick at once; the saved value takes over when the write lands.
  const [ticking, setTicking] = useState<boolean | null>(null);
  const done = ticking ?? fields.done;
  const tag = (field: string, what: string, edit: "title" | "date") =>
    assumed.includes(field) ? (
      <AssumedTag
        what={what}
        canEdit={canEdit}
        onConfirm={() => run(() => row.confirm({ entryId: entry._id, field }))}
        onChange={() => setEditing(edit)}
      />
    ) : null;
  const checkboxId = `done-${entry._id}`;

  return (
    <li
      data-entry-id={entry._id}
      data-pointed={row.pointed || undefined}
      className={rowClass(row.selected, row.pointed)}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={(e) => {
          const next = e.target.checked;
          setTicking(next);
          run(() =>
            tick({ entryId: entry._id, done: next }).finally(() =>
              setTicking(null),
            ),
          );
        }}
        aria-label={`Done: ${fields.title}`}
        className="mt-1 size-4 shrink-0 accent-action"
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {editing === "title" ? (
            <InlineEdit
              label={`Title of ${fields.title}`}
              initial={fields.title}
              onSave={(value) =>
                row.update({
                  entryId: entry._id,
                  patch: { kind: "timeline", title: value },
                })
              }
              onDone={() => setEditing(null)}
              className="flex-1"
            />
          ) : (
            <EditableText
              text={fields.title}
              canEdit={canEdit}
              onEdit={() => setEditing("title")}
              editLabel={`Rename ${fields.title}`}
              className={cn(
                "text-label font-medium",
                done && "text-ink-3 line-through",
              )}
            />
          )}
          {tag("title", fields.title, "title")}
          {fields.late && !done ? <Badge tone="warn">late</Badge> : null}
          {fields.priority && !done ? (
            <Badge tone="outline">{fields.priority}</Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-caption text-ink-3">
          {editing === "date" ? (
            <InlineEdit
              label={`Date for ${fields.title}`}
              type="date"
              initial={fields.date ?? ""}
              onSave={(value) =>
                row.update({
                  entryId: entry._id,
                  patch: {
                    kind: "timeline",
                    date: value === "" ? null : value,
                  },
                })
              }
              onDone={() => setEditing(null)}
              className="w-40"
            />
          ) : (
            <EditableText
              text={
                fields.date ? `By ${formatDay(fields.date)}` : "No date yet"
              }
              canEdit={canEdit}
              onEdit={() => setEditing("date")}
              editLabel={`Change the date for ${fields.title}`}
              className="num text-caption text-ink-3"
            />
          )}
          {tag("date", `the date for ${fields.title}`, "date")}
          {functionName ? <span>· {functionName}</span> : null}
        </div>
        {fields.note ? (
          <p
            className={cn(
              "text-caption",
              fields.late && !done ? "text-ink-2" : "text-ink-3",
              scriptClass(fields.note),
            )}
          >
            {fields.note}
          </p>
        ) : null}
      </div>
      <EntryCommentCount
        entryId={entry._id}
        entryLabel={fields.title}
        className="shrink-0"
      />
      <ViewerAvatars viewers={row.viewers} className="shrink-0" />
      {canEdit ? (
        <TinyIconButton
          label={`Delete ${fields.title}`}
          tone="warn"
          onClick={() => run(() => row.remove({ entryId: entry._id }))}
          className={hoverReveal}
        >
          <Trash2 />
        </TinyIconButton>
      ) : null}
    </li>
  );
}

function RunSheetRow({ entry, canEdit, run }: RowProps) {
  const row = useRow(entry);
  const [editing, setEditing] = useState<"title" | "time" | null>(null);
  const { fields, assumed } = entry;
  const time = fields.time ?? "00:00";
  const tag = (field: string, what: string, edit: "title" | "time") =>
    assumed.includes(field) ? (
      <AssumedTag
        what={what}
        canEdit={canEdit}
        onConfirm={() => run(() => row.confirm({ entryId: entry._id, field }))}
        onChange={() => setEditing(edit)}
      />
    ) : null;

  return (
    <li
      data-entry-id={entry._id}
      data-pointed={row.pointed || undefined}
      className={rowClass(row.selected, row.pointed)}
    >
      <div className="w-16 shrink-0 pt-px">
        {editing === "time" ? (
          <InlineEdit
            label={`Time for ${fields.title}`}
            type="time"
            initial={time}
            onSave={(value) =>
              row.update({
                entryId: entry._id,
                patch: { kind: "timeline", time: value === "" ? null : value },
              })
            }
            onDone={() => setEditing(null)}
          />
        ) : (
          <EditableText
            text={formatTime(time)}
            canEdit={canEdit}
            onEdit={() => setEditing("time")}
            editLabel={`Change the time for ${fields.title}`}
            className="num text-label font-semibold text-ink-2"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {editing === "title" ? (
          <InlineEdit
            label={`Title of ${fields.title}`}
            initial={fields.title}
            onSave={(value) =>
              row.update({
                entryId: entry._id,
                patch: { kind: "timeline", title: value },
              })
            }
            onDone={() => setEditing(null)}
            className="flex-1"
          />
        ) : (
          <EditableText
            text={fields.title}
            canEdit={canEdit}
            onEdit={() => setEditing("title")}
            editLabel={`Rename ${fields.title}`}
            className="text-label"
          />
        )}
        {tag("time", `${formatTime(time)} for ${fields.title}`, "time")}
        {tag("title", fields.title, "title")}
        {fields.note ? (
          <p
            className={cn(
              "basis-full text-caption text-ink-3",
              scriptClass(fields.note),
            )}
          >
            {fields.note}
          </p>
        ) : null}
      </div>
      <EntryCommentCount
        entryId={entry._id}
        entryLabel={fields.title}
        className="shrink-0"
      />
      <ViewerAvatars viewers={row.viewers} className="shrink-0" />
      {canEdit ? (
        <TinyIconButton
          label={`Delete ${fields.title}`}
          tone="warn"
          onClick={() => run(() => row.remove({ entryId: entry._id }))}
          className={hoverReveal}
        >
          <Trash2 />
        </TinyIconButton>
      ) : null}
    </li>
  );
}
