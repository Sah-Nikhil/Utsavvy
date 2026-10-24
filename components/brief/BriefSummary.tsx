"use client";

import { Check, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { SectionOrnament } from "@/components/shell/SectionOrnament";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  FunctionMarker,
  type FunctionIndex,
} from "@/components/ui/function-marker";
import { Money } from "@/components/ui/money";
import type { Id } from "@/convex/_generated/dataModel";
import { communityKindLabel } from "@/lib/brief/festivalDates";
import { parseAmount, parseCount } from "@/lib/brief/parse";
import { cn } from "@/lib/utils";
import { MakePlanButton } from "./MakePlanButton";
import { BriefError, useEditField, type BriefSummaryData } from "./shared";
import { VibePickSlot } from "./VibePickSlot";

type Edit = ReturnType<typeof useEditField>;
type Change = Parameters<Edit["run"]>[0];

const TIER_WORDS: Record<string, string> = {
  X: "X tier, a large city",
  Y: "Y tier",
  Z: "Z tier, a smaller city",
};

const WHO: Record<string, string> = {
  child: "Child",
  adult: "Adult",
  elder: "Parent or grandparent",
};

/**
 * The Brief summary (first-brief.md "Brief summary"): every field, the
 * Functions, the Assumptions and the Budget check, all editable in place
 * before the plan, ending in "Make my plan". Any edit re-runs the Budget
 * check, mostly from the cache.
 */
export function BriefSummary({
  eventId,
  brief,
}: {
  eventId: Id<"events">;
  brief: BriefSummaryData;
}) {
  const edit = useEditField(eventId);
  const [open, setOpen] = useState<string | null>(null);
  const before =
    brief.briefState === "summary" || brief.briefState === "intake";
  const editable = brief.canEdit && before;
  const rowProps = { open, setOpen, edit, editable };

  return (
    <article
      aria-labelledby={`brief-${eventId}`}
      className="relative flex flex-col gap-4 rounded-lg bg-surface-raised px-4 pt-4 pb-6 shadow-item"
      data-brief-summary
    >
      <SectionOrnament />
      <header className="flex items-baseline justify-between gap-3 pl-5 ornaments-off:pl-0">
        <h3
          id={`brief-${eventId}`}
          className="font-display text-title font-semibold tracking-[-0.01em] text-ink"
        >
          Your Brief
        </h3>
        {editable ? (
          <p className="text-caption text-ink-3">Tap a value to change it</p>
        ) : null}
      </header>

      <dl className="flex flex-col divide-y divide-rule">
        {brief.city ? (
          <Row
            {...rowProps}
            id="city"
            label="City"
            value={
              <>
                {brief.city.name}
                <span className="text-ink-3">
                  {" "}
                  · {TIER_WORDS[brief.city.tier] ?? brief.city.tier}
                </span>
              </>
            }
            editor={(close) => (
              <TextEditor
                label="City"
                initial={brief.city!.name}
                read={(text) => (text.trim() ? text.trim() : null)}
                change={(city) => ({ field: "city", city })}
                {...{ edit, close }}
              />
            )}
          />
        ) : null}
        <Row
          {...rowProps}
          id="date"
          label="Date"
          value={brief.dateText ?? "Not decided yet"}
          assumed={brief.assumptions.some((a) => a.field === "date")}
          editor={(close) => (
            <DateEditor {...{ edit, close }} initial={brief.date} />
          )}
        />
        <Row
          {...rowProps}
          id="guests"
          label={
            brief.eventType === "community" ? "Guests at the busiest" : "Guests"
          }
          value={
            brief.guests !== null ? brief.guests.toLocaleString("en-IN") : "—"
          }
          assumed={brief.assumptions.some((a) => a.field === "guests")}
          editor={(close) => (
            <TextEditor
              label="Guests"
              inputMode="numeric"
              initial={brief.guests ? String(brief.guests) : ""}
              read={parseCount}
              error="Type a whole number of Guests."
              change={(guests) => ({
                field: "guests",
                functionKey: null,
                guests,
              })}
              {...{ edit, close }}
            />
          )}
        />
        <Row
          {...rowProps}
          id="budget"
          label="Budget"
          value={brief.budget !== null ? <Money amount={brief.budget} /> : "—"}
          assumed={brief.budgetAssumed}
          editor={(close) => (
            <TextEditor
              label="Budget"
              initial={brief.budget ? String(brief.budget) : ""}
              placeholder="e.g. 25 lakh"
              read={parseAmount}
              error="Type an amount, such as 25 lakh or ₹2,40,000."
              change={(budget) => ({ field: "budget", budget })}
              {...{ edit, close }}
            />
          )}
        />
        {brief.eventType === "wedding" ? (
          <Row
            {...rowProps}
            id="tradition"
            label="Tradition"
            value={brief.tradition ?? "—"}
            editor={(close) => (
              <TextEditor
                label="Tradition"
                initial={brief.tradition ?? ""}
                read={(text) => (text.trim() ? text.trim() : null)}
                change={(tradition) => ({ field: "tradition", tradition })}
                {...{ edit, close }}
              />
            )}
          />
        ) : null}
        {brief.eventType === "birthday" && brief.honoree ? (
          <Row
            {...rowProps}
            id="honoree"
            label="Whose birthday"
            value={[
              brief.honoree.name,
              WHO[brief.honoree.who],
              brief.honoree.age !== null
                ? `turning ${brief.honoree.age}`
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
            editor={(close) => (
              <TextEditor
                label="Age"
                inputMode="numeric"
                initial={brief.honoree?.age ? String(brief.honoree.age) : ""}
                read={parseCount}
                error="Type the age as a number."
                change={(age) => ({
                  field: "honoree",
                  honoree: { ...brief.honoree!, age },
                })}
                {...{ edit, close }}
              />
            )}
          />
        ) : null}
        {brief.eventType === "community" ? (
          <>
            <Row
              {...rowProps}
              id="kind"
              label="Kind"
              value={
                brief.communityKind
                  ? communityKindLabel(brief.communityKind)
                  : "—"
              }
              editor={(close) => (
                <TextEditor
                  label="Kind of event"
                  initial={brief.communityKind ?? ""}
                  read={(text) => (text.trim() ? text.trim() : null)}
                  change={(communityKind) => ({
                    field: "communityKind",
                    communityKind,
                  })}
                  {...{ edit, close }}
                />
              )}
            />
            <Row
              {...rowProps}
              id="households"
              label="Households"
              value={brief.households?.toLocaleString("en-IN") ?? "Not counted"}
              editor={(close) => (
                <TextEditor
                  label="Households"
                  inputMode="numeric"
                  initial={brief.households ? String(brief.households) : ""}
                  read={parseCount}
                  error="Type a whole number of households."
                  change={(households) => ({ field: "households", households })}
                  {...{ edit, close }}
                />
              )}
            />
          </>
        ) : null}
        <Row
          {...rowProps}
          id="theme"
          label="Theme"
          value={
            brief.styleWords.length > 0 ? (
              brief.styleWords.join(", ")
            ) : (
              <span className="text-ink-3">Not picked yet</span>
            )
          }
          editor={(close) => (
            <TextEditor
              label="Style words, separated by commas"
              initial={brief.styleWords.join(", ")}
              placeholder="royal Rajputana, marigold, pastel pink"
              read={(text) =>
                text
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean)
              }
              change={(styleWords) => ({ field: "styleWords", styleWords })}
              {...{ edit, close }}
            />
          )}
        >
          <VibePickSlot eventId={eventId} />
        </Row>
      </dl>

      <FunctionsList brief={brief} {...rowProps} />
      <AssumptionsList brief={brief} edit={edit} editable={editable} />
      <BudgetCheckPanel
        brief={brief}
        edit={edit}
        editable={editable}
        eventId={eventId}
      />
      <BriefError>{edit.error}</BriefError>
    </article>
  );
}

type RowProps = {
  id: string;
  label: string;
  value: ReactNode;
  assumed?: boolean;
  editor: (close: () => void) => ReactNode;
  open: string | null;
  setOpen: (id: string | null) => void;
  editable: boolean;
  children?: ReactNode;
};

function Row({
  id,
  label,
  value,
  assumed,
  editor,
  open,
  setOpen,
  editable,
  children,
}: RowProps) {
  const isOpen = open === id;
  return (
    <div
      className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 py-2 first:pt-0"
      data-brief-field={id}
    >
      <dt className="pt-0.5 text-caption font-medium text-ink-3">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1.5 text-body text-ink">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          {editable && !isOpen ? (
            <button
              type="button"
              onClick={() => setOpen(id)}
              className={cn(
                "group -mx-1 inline-flex min-w-0 items-baseline gap-1.5 rounded-xs px-1 text-left",
                "hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                assumed &&
                  "underline decoration-rule-strong decoration-dashed underline-offset-4",
              )}
            >
              <span className="sr-only">Change {label.toLowerCase()}: </span>
              <span className="min-w-0 break-words">{value}</span>
              <Pencil
                aria-hidden
                className="size-3 shrink-0 self-center text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          ) : (
            <span
              className={cn(
                "min-w-0 break-words",
                assumed &&
                  "underline decoration-rule-strong decoration-dashed underline-offset-4",
              )}
            >
              {value}
            </span>
          )}
          {assumed ? <Badge tone="outline">assumed</Badge> : null}
        </div>
        {isOpen ? editor(() => setOpen(null)) : null}
        {children}
      </dd>
    </div>
  );
}

function TextEditor<V>({
  label,
  initial,
  placeholder,
  inputMode,
  read,
  error = "That doesn't look right.",
  change,
  edit,
  close,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  read: (text: string) => V | null;
  error?: string;
  change: (value: V) => Change;
  edit: Edit;
  close: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = read(text);
    if (value === null) return setInvalid(error);
    if (await edit.run(change(value))) close();
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5"
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          autoFocus
          value={text}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setInvalid(null);
          }}
          className="h-9"
          maxLength={120}
        />
        <Button type="submit" size="sm" disabled={edit.busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="text" onClick={close}>
          Cancel
        </Button>
      </div>
      <BriefError>{invalid}</BriefError>
    </form>
  );
}

function DateEditor({
  initial,
  edit,
  close,
  functionKey,
}: {
  initial: BriefSummaryData["date"];
  edit: Edit;
  close: () => void;
  functionKey?: string;
}) {
  const id = useId();
  const [month, setMonth] = useState(initial?.kind === "month" && !functionKey);
  const [value, setValue] = useState(initial?.value ?? "");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value) return;
    const date = month
      ? ({ kind: "month", value } as const)
      : ({ kind: "day", value } as const);
    const change: Change = functionKey
      ? { field: "functionDate", functionKey, date: { kind: "day", value } }
      : { field: "date", date };
    if (await edit.run(change)) close();
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5"
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <label htmlFor={id} className="sr-only">
        {month ? "Month" : "Date"}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          id={id}
          autoFocus
          type={month ? "month" : "date"}
          value={
            month
              ? value.slice(0, 7)
              : value.length === 7
                ? `${value}-15`
                : value
          }
          onChange={(e) => setValue(e.currentTarget.value)}
          className="h-9 w-auto"
        />
        <Button type="submit" size="sm" disabled={edit.busy || !value}>
          Save
        </Button>
        <Button type="button" size="sm" variant="text" onClick={close}>
          Cancel
        </Button>
      </div>
      {functionKey ? null : (
        <Button
          type="button"
          size="sm"
          variant="text"
          className="self-start"
          onClick={() => {
            setMonth((m) => !m);
            setValue((v) =>
              month ? (v.length === 7 ? `${v}-15` : v) : v.slice(0, 7),
            );
          }}
        >
          {month ? "Pick an exact day" : "Just the month"}
        </Button>
      )}
    </form>
  );
}

function FunctionsList({
  brief,
  open,
  setOpen,
  edit,
  editable,
}: {
  brief: BriefSummaryData;
  open: string | null;
  setOpen: (id: string | null) => void;
  edit: Edit;
  editable: boolean;
}) {
  if (brief.functions.length === 0) return null;
  return (
    <section aria-labelledby="brief-functions" className="flex flex-col gap-2">
      <h4 id="brief-functions" className="text-label font-semibold text-ink">
        {brief.functions.length === 1
          ? "The Function"
          : `${brief.functions.length} Functions`}
      </h4>
      <ul className="flex flex-col gap-1">
        {brief.functions.map((fn, index) => {
          const dateAssumed = fn.assumed.includes("date");
          const guestsAssumed = fn.assumed.includes("guests");
          const isOpen = open === `fn:${fn.key}`;
          return (
            <li
              key={fn.key}
              className="flex flex-col gap-1.5 rounded-sm px-1 py-1 hover:bg-surface-sunk/60"
              data-brief-function={fn.key}
            >
              <div className="flex items-center gap-2.5">
                <FunctionMarker index={((index % 8) + 1) as FunctionIndex} />
                <span className="min-w-0 flex-1 text-body font-medium break-words text-ink">
                  {fn.name}
                </span>
                <span
                  className={cn(
                    "text-label text-ink-2",
                    dateAssumed &&
                      "underline decoration-rule-strong decoration-dashed underline-offset-4",
                  )}
                >
                  {fn.dateText ?? "—"}
                </span>
                <span
                  className={cn(
                    "num w-14 text-right text-label text-ink-2",
                    guestsAssumed &&
                      "underline decoration-rule-strong decoration-dashed underline-offset-4",
                  )}
                >
                  {fn.guests !== null ? fn.guests.toLocaleString("en-IN") : "—"}
                </span>
                {editable && fn.date?.kind === "day" ? (
                  <Button
                    variant="text"
                    size="sm"
                    icon
                    aria-label={`Change the ${fn.name}`}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : `fn:${fn.key}`)}
                  >
                    <Pencil />
                  </Button>
                ) : editable ? (
                  <span aria-hidden className="size-8 shrink-0" />
                ) : null}
              </div>
              {isOpen ? (
                <div className="flex flex-col gap-2 pl-4">
                  <DateEditor
                    initial={
                      fn.date?.kind === "day"
                        ? { kind: "day", value: fn.date.value }
                        : null
                    }
                    functionKey={fn.key}
                    edit={edit}
                    close={() => setOpen(null)}
                  />
                  <TextEditor
                    label={`${fn.name} Guests`}
                    inputMode="numeric"
                    initial={fn.guests ? String(fn.guests) : ""}
                    read={parseCount}
                    error="Type a whole number of Guests."
                    change={(guests) => ({
                      field: "guests",
                      functionKey: fn.key,
                      guests,
                    })}
                    edit={edit}
                    close={() => setOpen(null)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-3">
        Dashed values are assumed. Guests per Function on the right.
      </p>
    </section>
  );
}

/** Assumptions a Member can keep from here; the rest are settled by the plan or by changing a field. */
function keepable(field: string): boolean {
  return field === "guests" || /^function\.[^.]+\.(date|guests)$/.test(field);
}

function AssumptionsList({
  brief,
  edit,
  editable,
}: {
  brief: BriefSummaryData;
  edit: Edit;
  editable: boolean;
}) {
  if (brief.assumptions.length === 0) return null;
  return (
    <section
      aria-labelledby="brief-assumptions"
      className="flex flex-col gap-2"
    >
      <h4 id="brief-assumptions" className="text-label font-semibold text-ink">
        Assumptions
      </h4>
      <ul className="flex flex-col gap-1.5">
        {brief.assumptions.map((a) => (
          <li
            key={a.field}
            className="flex items-start gap-2 text-label"
            data-assumption={a.field}
          >
            <div className="min-w-0 flex-1">
              <p className="text-ink">
                <span className="text-ink-3">{a.label}: </span>
                {a.value}
              </p>
              <p className="text-caption text-ink-3">{a.reason}</p>
            </div>
            {editable && keepable(a.field) ? (
              <Button
                variant="text"
                size="sm"
                disabled={edit.busy}
                onClick={() =>
                  void edit.run({
                    field: "assumptionConfirmed",
                    assumption: a.field,
                  })
                }
                aria-label={`Keep ${a.label.toLowerCase()}: ${a.value}`}
              >
                <Check />
                Keep
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BudgetCheckPanel({
  brief,
  edit,
  editable,
  eventId,
}: {
  brief: BriefSummaryData;
  edit: Edit;
  editable: boolean;
  eventId: Id<"events">;
}) {
  const check = brief.budgetCheck;
  const city = brief.city?.name ?? "your city";
  if (brief.checking || check === null) {
    return (
      <section
        aria-live="polite"
        className="flex items-center gap-2 rounded-md bg-surface-sunk px-3 py-3 text-label text-ink-2"
        data-budget-check="checking"
      >
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin text-action motion-reduce:animate-none"
        />
        Checking current prices in {city}…
      </section>
    );
  }
  const below = check.band === "belowMinimum";
  return (
    <section
      aria-labelledby="brief-budget-check"
      aria-live="polite"
      className="flex flex-col gap-3"
      data-budget-check={check.band}
    >
      <h4 id="brief-budget-check" className="text-label font-semibold text-ink">
        Budget check
      </h4>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rule bg-rule">
        {[
          ["Usually from", check.minimum],
          ["Typical", check.typical],
          ["High end", check.high],
        ].map(([label, amount]) => (
          <div
            key={label as string}
            className="flex flex-col gap-0.5 bg-surface px-2.5 py-2"
          >
            <span className="text-caption text-ink-3">{label}</span>
            <Money
              amount={amount as number}
              short
              className="text-label font-semibold text-ink"
            />
          </div>
        ))}
      </div>
      {below ? (
        <div
          role="note"
          className="flex gap-2 rounded-md bg-warn-soft px-3 py-2.5 text-label text-ink"
          data-budget-flag
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warn"
          />
          <p>{check.flag}</p>
        </div>
      ) : (
        <p className="text-label text-ink-2">{bandSentence(brief)}</p>
      )}
      {check.perHousehold !== null ? (
        <p className="text-label text-ink-2">
          <Money amount={check.perHousehold} /> per household
          {below && check.raiseTo && brief.households ? (
            <>
              ; raising the budget makes it about{" "}
              <Money amount={Math.round(check.raiseTo / brief.households)} />
            </>
          ) : null}
          .
        </p>
      ) : null}
      {check.basis ? (
        <p className="text-caption text-ink-3" data-budget-basis>
          {check.basis} Estimates, never Quotes.
        </p>
      ) : null}

      {below && editable ? (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={edit.busy}
            onClick={() =>
              void edit.run({ field: "budget", budget: check.raiseTo! })
            }
          >
            Raise the budget to {check.raiseLabel}
          </Button>
          <MakePlanButton eventId={eventId} variant="outline" belowMinimum>
            Plan at my budget anyway
          </MakePlanButton>
        </div>
      ) : editable ? (
        <MakePlanButton eventId={eventId}>Make my plan</MakePlanButton>
      ) : !brief.canEdit ? (
        <p className="text-caption text-ink-3">
          A Member makes the plan from here.
        </p>
      ) : null}
    </section>
  );
}

function bandSentence(brief: BriefSummaryData): string {
  const check = brief.budgetCheck!;
  switch (check.band) {
    case "tight":
      return "Your budget is below the typical figure, so Estimates will sit near the low end.";
    case "comfortable":
      return "Your budget sits within the usual range for a plan like this.";
    case "aboveHigh":
      return "Your budget is above the usual high end: every Estimate can sit at its high end, and the rest shows as Unallocated.";
    default:
      return "";
  }
}
