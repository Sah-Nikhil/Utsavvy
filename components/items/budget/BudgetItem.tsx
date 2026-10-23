"use client";

import { useMutation, useQuery } from "convex/react";
import { Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import {
  useCanvasItem,
  ViewerAvatars,
} from "@/components/canvas/CanvasItemContext";
import type { ItemComponentProps } from "@/components/items/registry";
import { ItemFrame } from "@/components/items/ItemFrame";
import { Badge } from "@/components/ui/badge";
import { FunctionMarker } from "@/components/ui/function-marker";
import { Money } from "@/components/ui/money";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatLakh } from "@/lib/format";
import { perHousehold } from "@/lib/pricing/pricePlan";
import { scriptClass } from "@/lib/script";
import type { BudgetCheck } from "@/lib/types/estimates";
import { cn } from "@/lib/utils";
import {
  AddForm,
  AssumedTag,
  EditableText,
  EstimateLine,
  ExpandButton,
  FunctionSelect,
  GroupHeading,
  InlineEdit,
  Loading,
  NoEstimate,
  RowError,
  TinyIconButton,
  entrySelected,
  functionIndexer,
  inlineControlClass,
  parseRupees,
  useRowAction,
} from "./parts";
import { budgetRollup, entryAmount } from "./rollup";

/*
 * The Budget (S4): Function totals, Event-wide, Contingency and Unallocated,
 * adding up to the Event total, with the Budget check's note. Every amount
 * uses lakh grouping; every Estimate wears its labelled badge and basis.
 */

type BudgetEntry = Extract<Doc<"entries">, { kind: "budget" }>;
type View = NonNullable<
  ReturnType<typeof useQuery<typeof api.entries.forItem>>
>;

/** "300 plates", "4 days", "150 cards"; nothing for a single Function or Event. */
const UNIT_WORDS: Record<string, [string, string]> = {
  per_plate: ["plate", "plates"],
  per_day: ["day", "days"],
  per_card: ["card", "cards"],
  per_guest: ["Guest", "Guests"],
  per_guest_day: ["Guest-day", "Guest-days"],
  per_kg: ["kg", "kg"],
  per_child: ["child", "children"],
  per_function: ["Function", "Functions"],
};

export function quantityText(quantity: number, unit: string): string | null {
  const words = UNIT_WORDS[unit];
  if (!words) return null;
  if (quantity === 1 && unit === "per_function") return null;
  return `${quantity.toLocaleString("en-IN")} ${quantity === 1 ? words[0] : words[1]}`;
}

export function BudgetItem({ item }: ItemComponentProps<"budget">) {
  const canvas = useCanvasItem();
  const view = useQuery(api.entries.forItem, { itemId: item._id });
  const total =
    view === undefined
      ? null
      : budgetRollup(
          view.entries.filter((e): e is BudgetEntry => e.kind === "budget"),
          view.event.budgetTotal,
        ).total;
  const body = (
    <BudgetBody itemId={item._id} note={item.data.note} view={view} />
  );
  return (
    <ItemFrame
      kind="Budget"
      icon={<Wallet />}
      title="Budget"
      meta={total === null ? undefined : <Money amount={total} />}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      actions={
        <ExpandButton title="Budget" description="Every line of the plan">
          <BudgetBody itemId={item._id} note={item.data.note} view={view} />
        </ExpandButton>
      }
    >
      {body}
    </ItemFrame>
  );
}

/** The Budget check's note when the Item doesn't carry one of its own. */
function checkNote(check: BudgetCheck, budget: number | null): string | null {
  if (check.band === "tight" && budget !== null)
    return `${formatLakh(budget)} is below the typical ${formatLakh(check.typical)} for this plan, so Estimates sit near the low end.`;
  if (check.band === "belowMinimum" && budget !== null)
    return `A plan like this usually starts at about ${formatLakh(check.minimum)}. You're about ${formatLakh(Math.max(0, check.minimum - budget))} short.`;
  return null;
}

const BAND_LABELS: Partial<
  Record<BudgetCheck["band"], { label: string; tone: "neutral" | "warn" }>
> = {
  tight: { label: "Tight", tone: "neutral" },
  belowMinimum: { label: "Below the usual minimum", tone: "warn" },
};

function BudgetBody({
  itemId,
  note,
  view,
}: {
  itemId: Id<"items">;
  note: string | null;
  view: View | undefined;
}) {
  const add = useMutation(api.entries.add);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [functionKey, setFunctionKey] = useState<string | null>(null);
  const action = useRowAction();

  if (view === undefined) return <Loading />;
  const entries = view.entries.filter(
    (e): e is BudgetEntry => e.kind === "budget",
  );
  const { event, functions, canEdit } = view;
  const rollup = budgetRollup(entries, event.budgetTotal);
  const indexOf = functionIndexer(functions);
  const lines = entries.filter((e) => e.fields.role === "line");
  const held = entries.filter((e) => e.fields.role !== "line");
  const noEstimate = lines.filter(
    (e) => e.fields.estimate === null && e.fields.plannedAmount === null,
  ).length;
  const band = event.budgetCheck ? BAND_LABELS[event.budgetCheck.band] : null;
  const shownNote =
    note ??
    (event.budgetCheck
      ? checkNote(event.budgetCheck, event.budgetTotal)
      : null);
  const share =
    event.eventType === "community"
      ? perHousehold(event.budgetTotal ?? rollup.total, event.households)
      : null;

  // One group per Function with lines, in the Event's order, then Event-wide
  // (which also takes a line whose Function no longer exists).
  const known = new Set(functions.map((fn) => fn.key));
  const sum = (rows: BudgetEntry[]) =>
    rows.reduce((total, e) => total + entryAmount(e.fields), 0);
  const eventWide = lines.filter(
    (e) => e.functionKey === null || !known.has(e.functionKey),
  );
  const groups = [
    ...functions.map((fn) => {
      const rows = lines.filter((e) => e.functionKey === fn.key);
      return {
        key: fn.key,
        name: fn.name,
        index: indexOf(fn.key),
        total: sum(rows),
        rows,
      };
    }),
    {
      key: "",
      name: "Event-wide",
      index: undefined,
      total: sum(eventWide),
      rows: eventWide,
    },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="grid gap-2.5">
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 text-label">
        <dt className="text-ink-2">Event total</dt>
        <dd className="text-right font-semibold text-ink">
          <Money amount={rollup.total} />
        </dd>
        {event.budgetTotal !== null ? (
          <>
            <dt className="text-ink-2">Budget</dt>
            <dd className="text-right text-ink-2">
              <Money amount={event.budgetTotal} />
            </dd>
          </>
        ) : null}
        {rollup.overBy > 0 ? (
          <>
            <dt className="font-semibold text-warn">Over budget by</dt>
            <dd className="text-right font-semibold text-warn">
              <Money amount={rollup.overBy} />
            </dd>
          </>
        ) : null}
        {share !== null ? (
          <>
            <dt className="text-ink-2">Per household</dt>
            <dd className="text-right text-ink-2">
              <Money amount={share} />
            </dd>
          </>
        ) : null}
      </dl>

      {band || shownNote || noEstimate > 0 ? (
        <div className="grid gap-1 rounded-xs bg-surface-sunk px-2.5 py-2 text-caption text-ink-2">
          {band ? (
            <span className="flex items-center gap-1.5">
              <span className="text-ink-3">Budget check</span>
              <Badge tone={band.tone}>{band.label}</Badge>
            </span>
          ) : null}
          {shownNote ? (
            <p className={scriptClass(shownNote)}>{shownNote}</p>
          ) : null}
          {noEstimate > 0 ? (
            <p>
              {noEstimate === 1
                ? "1 line has no Estimate yet and counts as zero."
                : `${noEstimate} lines have no Estimate yet and count as zero.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-label text-ink-3">
          No lines yet. Add one below, or ask the Assistant to plan the Budget.
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-label={group.name} className="grid gap-1">
          <GroupHeading
            marker={group.index ? <FunctionMarker index={group.index} /> : null}
            name={group.name}
            aside={<Money amount={group.total} className="text-ink-2" />}
          />
          <ul className="grid gap-px">
            {group.rows.map((entry) => (
              <BudgetRow
                key={entry._id}
                entry={entry}
                canEdit={canEdit}
                run={action.run}
              />
            ))}
          </ul>
        </section>
      ))}

      {held.length > 0 ? (
        <ul className="grid gap-px border-t border-rule pt-1.5">
          {held.map((entry) => (
            <BudgetRow
              key={entry._id}
              entry={entry}
              canEdit={canEdit}
              run={action.run}
            />
          ))}
        </ul>
      ) : null}

      <RowError error={action.error} />

      {canEdit ? (
        <AddForm
          label="Add a budget line"
          submitLabel="Add line"
          onSubmit={async () => {
            await add({
              itemId,
              functionKey,
              input: { kind: "budget", label, amount: parseRupees(amount) },
            });
            setLabel("");
            setAmount("");
          }}
        >
          <input
            aria-label="New line"
            placeholder="New line, e.g. Favours"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inlineControlClass(
              cn("min-w-28 flex-[2_1_8rem]", scriptClass(label)),
            )}
          />
          <input
            aria-label="Amount in rupees"
            placeholder="₹ amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inlineControlClass("num w-24 flex-[1_1_5rem]")}
          />
          {functions.length > 0 ? (
            <FunctionSelect
              label="Function for the new line"
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

type Editing = "label" | "amount" | "quantity" | null;

function BudgetRow({
  entry,
  canEdit,
  run,
}: {
  entry: BudgetEntry;
  canEdit: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const canvas = useCanvasItem();
  const update = useMutation(api.entries.update);
  const confirm = useMutation(api.entries.confirmAssumption);
  const remove = useMutation(api.entries.remove);
  const [editing, setEditing] = useState<Editing>(null);
  const { fields, assumed } = entry;
  const amount = entryAmount(fields);
  const quantity = quantityText(fields.quantity, fields.unit);
  const pointed = canvas?.pointedEntryIds.has(entry._id) ?? false;
  const selected = entrySelected(canvas?.selection ?? null, entry._id);
  const viewers = canvas?.viewersByEntry.get(entry._id) ?? [];
  const held = fields.role !== "line";
  const label =
    fields.role === "contingency"
      ? fields.label || "Contingency"
      : fields.role === "unallocated"
        ? fields.label || "Unallocated"
        : fields.label;

  const tag = (field: string, what: string, edit: Editing) =>
    assumed.includes(field) ? (
      <AssumedTag
        what={what}
        canEdit={canEdit}
        onConfirm={() => run(() => confirm({ entryId: entry._id, field }))}
        onChange={() => setEditing(edit)}
      />
    ) : null;

  return (
    <li
      data-entry-id={entry._id}
      data-pointed={pointed || undefined}
      className={cn(
        "group/row relative grid gap-1 rounded-xs px-1.5 py-1.5",
        "transition-colors duration-(--dur-feedback) ease-standard",
        selected && "bg-selected",
        pointed && "bg-point-field",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {editing === "label" ? (
            <InlineEdit
              label={`Name of ${label}`}
              initial={fields.label}
              onSave={(value) =>
                update({
                  entryId: entry._id,
                  patch: { kind: "budget", label: value },
                })
              }
              onDone={() => setEditing(null)}
              className="flex-1"
            />
          ) : (
            <EditableText
              text={label}
              canEdit={canEdit && !held}
              onEdit={() => setEditing("label")}
              className={cn("text-label font-medium", held && "text-ink-2")}
              editLabel={`Rename ${label}`}
            />
          )}
          {tag("label", label, "label")}
        </div>
        <ViewerAvatars viewers={viewers} className="shrink-0" />
        {editing === "amount" ? (
          <InlineEdit
            label={`Amount for ${label}`}
            initial={
              fields.plannedAmount === null ? "" : String(fields.plannedAmount)
            }
            inputMode="numeric"
            onSave={async (value) =>
              update({
                entryId: entry._id,
                patch: { kind: "budget", plannedAmount: parseRupees(value) },
              })
            }
            onDone={() => setEditing(null)}
            className="w-28"
          />
        ) : (
          <span className="grid shrink-0 justify-items-end">
            {fields.estimate === null && fields.plannedAmount === null ? (
              canEdit ? (
                <EditableText
                  text="Add amount"
                  canEdit
                  onEdit={() => setEditing("amount")}
                  editLabel={`Add an amount for ${label}`}
                  className="text-label font-medium text-action"
                />
              ) : null
            ) : (
              <EditableText
                text={<Money amount={amount} />}
                canEdit={canEdit}
                onEdit={() => setEditing("amount")}
                editLabel={`Change the amount for ${label}`}
                className="text-label font-semibold text-ink"
              />
            )}
            {fields.role === "line" &&
            fields.plannedAmount !== null &&
            fields.estimate !== null ? (
              <span className="text-caption text-ink-3">Your amount</span>
            ) : null}
          </span>
        )}
        {canEdit ? (
          <TinyIconButton
            label={`Delete ${label}`}
            tone="warn"
            onClick={() => run(() => remove({ entryId: entry._id }))}
            className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100"
          >
            <Trash2 />
          </TinyIconButton>
        ) : null}
      </div>
      {tag("plannedAmount", `the amount for ${label}`, "amount")}

      {quantity !== null || fields.belowUsualRange ? (
        <div className="flex flex-wrap items-center gap-1 text-caption text-ink-3">
          {quantity !== null && editing === "quantity" ? (
            <InlineEdit
              label={`Quantity for ${label}`}
              initial={String(fields.quantity)}
              inputMode="numeric"
              onSave={(value) =>
                update({
                  entryId: entry._id,
                  patch: { kind: "budget", quantity: Number(value) },
                })
              }
              onDone={() => setEditing(null)}
              className="w-20"
            />
          ) : quantity !== null ? (
            <EditableText
              text={quantity}
              canEdit={canEdit}
              onEdit={() => setEditing("quantity")}
              editLabel={`Change the quantity for ${label}`}
              className="num text-caption text-ink-3"
            />
          ) : null}
          {quantity !== null ? tag("quantity", quantity, "quantity") : null}
          {fields.belowUsualRange ? (
            <Badge tone="warn">Below the usual range</Badge>
          ) : null}
        </div>
      ) : null}

      {fields.role === "line" ? (
        fields.estimate ? (
          <EstimateLine
            estimate={fields.estimate}
            amount={fields.plannedAmount !== null}
          />
        ) : (
          <NoEstimate />
        )
      ) : (
        <p className="text-caption text-ink-3">
          {fields.role === "contingency"
            ? "Held back for surprises"
            : "Left over; move it into any line"}
        </p>
      )}
    </li>
  );
}
