"use client";

import { Check, ExternalLink, Maximize2, Pencil } from "lucide-react";
import {
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import type { FunctionIndex } from "@/components/ui/function-marker";
import { Money } from "@/components/ui/money";
import { PriceBadge } from "@/components/ui/price-badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { formatINR } from "@/lib/format";
import { basisText } from "@/lib/pricing/basis";
import { scriptClass } from "@/lib/script";
import type { SelectionTarget } from "@/lib/types/canvas";
import type { PricedEstimate } from "@/lib/types/estimates";
import { cn } from "@/lib/utils";

/*
 * Pieces the Budget, Timeline, Vendor checklist and Suggestion Items share:
 * the Estimate with its basis, the "assumed" tag with one-tap confirm or
 * change, and the small inline editors. Every amount goes through <Money>.
 */

/** A Function's colour index, as the Canvas's Function filter numbers them. */
export function functionIndexer(
  functions: readonly { key: string }[],
): (key: string | null) => FunctionIndex | undefined {
  const order = new Map(functions.map((fn, i) => [fn.key, i]));
  return (key) => {
    if (key === null) return undefined;
    const i = order.get(key);
    return i === undefined ? undefined : (((i % 8) + 1) as FunctionIndex);
  };
}

/** The host name of a source URL, for a short link label. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * An Estimate: the dashed "Estimate" badge, its basis line ("Researched 22 Oct
 * 2026 · 3 sources", "Utsavvy reference table, Y tier, Oct 2026" or
 * "Assistant's own estimate, no sources") and, on tap, its range with the
 * source links or the reasoning. With `amount`, the Estimate's own amount
 * shows beside the badge; never added to any other kind of price.
 */
export function EstimateLine({
  estimate,
  amount = false,
  className,
}: {
  estimate: PricedEstimate;
  amount?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { basis } = estimate;
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <PriceBadge kind="estimate" detail="none" />
        {amount ? (
          <Money
            amount={estimate.amount}
            className="text-label text-price-estimate"
          />
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "min-w-0 truncate rounded-xs text-left text-caption text-ink-3 underline decoration-rule-strong/60 decoration-dotted underline-offset-[3px]",
            "transition-colors duration-(--dur-feedback) ease-standard hover:text-ink-2 hover:decoration-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          )}
        >
          {basisText(basis)}
        </button>
      </div>
      {open ? (
        <div
          id={panelId}
          className="grid gap-1 rounded-xs bg-surface-sunk px-2.5 py-2 text-caption text-ink-2"
        >
          <p className="num">
            Usual range <Money amount={estimate.low} /> to{" "}
            <Money amount={estimate.high} />
            {basis.unit === "per_plate" ? (
              <>
                {" "}
                · {formatINR(basis.unitLow)} to {formatINR(basis.unitHigh)} a
                plate
              </>
            ) : null}
          </p>
          {basis.reasoning ? (
            <p className={scriptClass(basis.reasoning)}>{basis.reasoning}</p>
          ) : null}
          {basis.sourceUrls.length > 0 ? (
            <ul className="grid gap-0.5">
              {basis.sourceUrls.map((url) => (
                <li key={url} className="min-w-0">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-action underline underline-offset-2 hover:text-action-strong"
                  >
                    <span className="truncate">{hostOf(url)}</span>
                    <ExternalLink aria-hidden className="size-3 shrink-0" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {basis.kind === "referenceTable" ? (
            <p>
              From Utsavvy&apos;s own price table for this city size; no web
              search was used.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A line with no Estimate: the plain words, never a made-up price. */
export function NoEstimate() {
  return <span className="text-caption text-ink-3">No Estimate yet</span>;
}

/**
 * The "assumed" tag on a value the Assistant filled in, with one tap to
 * confirm it and one to change it. `what` names the value for screen readers,
 * e.g. "225 plates".
 */
export function AssumedTag({
  what,
  canEdit,
  onConfirm,
  onChange,
}: {
  what: string;
  canEdit: boolean;
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 align-middle">
      <span
        data-slot="assumed"
        className="inline-flex h-5 items-center rounded-full border border-rule bg-surface-sunk px-1.5 text-caption leading-none font-semibold text-ink-2"
      >
        assumed
      </span>
      {canEdit ? (
        <>
          <TinyIconButton label={`Confirm ${what}`} onClick={onConfirm}>
            <Check strokeWidth={2.5} />
          </TinyIconButton>
          <TinyIconButton label={`Change ${what}`} onClick={onChange}>
            <Pencil />
          </TinyIconButton>
        </>
      ) : null}
    </span>
  );
}

/** A 24 px icon button for row-level actions; the label is its accessible name. */
export function TinyIconButton({
  label,
  onClick,
  children,
  className,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "state-layer inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-ink-3 [&_svg]:size-3.5",
        "transition-[color,border-radius] duration-(--dur-feedback) ease-standard active:rounded-[3px]",
        tone === "warn" ? "hover:text-warn" : "hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const inlineControl = cn(
  "h-8 w-full min-w-0 rounded-xs border border-rule-strong bg-surface px-2 text-label text-ink",
  "placeholder:text-ink-3",
  "focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
  "aria-invalid:border-warn",
);

/** A compact control for the inline editors and add forms. */
export function inlineControlClass(className?: string): string {
  return cn(inlineControl, className);
}

/**
 * A value that turns into an input when edited: Enter or leaving the field
 * saves, Escape cancels. Saving shows the server's refusal under the field.
 */
export function InlineEdit({
  label,
  initial,
  type = "text",
  inputMode,
  onSave,
  onDone,
  className,
}: {
  /** The accessible name, e.g. "Amount for Catering". */
  label: string;
  initial: string;
  type?: "text" | "date" | "time";
  inputMode?: "numeric" | "text";
  onSave: (value: string) => Promise<unknown>;
  onDone: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  async function save() {
    if (saving) return;
    if (value === initial) return onDone();
    setSaving(true);
    try {
      await onSave(value);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "That didn't save. Try again."));
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDone();
    }
  }

  return (
    <span className={cn("grid min-w-0 gap-0.5", className)}>
      <input
        // The person asked to edit this value just now.
        autoFocus
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={saving}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
        className={cn(inlineControl, scriptClass(value))}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-caption text-warn">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** "2,85,000" or "₹285000" → 285000; "" → null. Throws on anything else. */
export function parseRupees(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) throw new Error("notAnAmount");
  return Math.round(n);
}

/** A small add form: fields, then an Add button; shows the server's refusal. */
export function AddForm({
  label,
  onSubmit,
  children,
  submitLabel = "Add",
}: {
  /** The form's accessible name, e.g. "Add a budget line". */
  label: string;
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "notAnAmount"
          ? "Type the amount in rupees, such as 25000."
          : errorMessage(e, "That didn't save. Try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      aria-label={label}
      onSubmit={submit}
      className="grid gap-1.5 border-t border-rule pt-2.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {children}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "state-layer inline-flex h-8 shrink-0 items-center rounded-xs bg-action-tonal px-3 text-label font-semibold text-on-action-tonal",
            "transition-[border-radius] duration-(--dur-feedback) ease-standard active:rounded-[3px] disabled:opacity-40",
          )}
        >
          {submitLabel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** A native select for a Function, with "Event-wide" (or "No Function") first. */
export function FunctionSelect({
  functions,
  value,
  onChange,
  label,
  noneLabel = "Event-wide",
  className,
}: {
  functions: readonly { key: string; name: string }[];
  value: string | null;
  onChange: (key: string | null) => void;
  label: string;
  noneLabel?: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className={inlineControlClass(cn("w-auto pr-6", className))}
    >
      <option value="">{noneLabel}</option>
      {functions.map((fn) => (
        <option key={fn.key} value={fn.key}>
          {fn.name}
        </option>
      ))}
    </select>
  );
}

/** A group heading inside an Item: the Function's diamond, its name and, optionally, a total. */
export function GroupHeading({
  marker,
  name,
  aside,
}: {
  marker?: ReactNode;
  name: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-1 text-caption font-semibold tracking-[0.02em] text-ink-2">
      {marker}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {aside}
    </div>
  );
}

/**
 * The header action that opens an Item's body in a side sheet, so a long
 * Budget or Timeline can be read and edited at full width.
 */
export function ExpandButton({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="text"
            size="sm"
            icon
            aria-label={`Open the ${title} in a panel`}
          />
        }
      >
        <Maximize2 aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="right"
        title={title}
        description={description}
        className="sm:w-[min(36rem,100vw)]"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Runs a row action and keeps the server's refusal for the Item to show. */
export function useRowAction(): {
  error: string | null;
  run: (action: () => Promise<unknown>) => void;
} {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    run: (action) => {
      setError(null);
      action().catch((e: unknown) =>
        setError(errorMessage(e, "That didn't save. Try again.")),
      );
    },
  };
}

/** The Item-level error line under a row action that was refused. */
export function RowError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-caption text-warn">
      {error}
    </p>
  );
}

/** While the Item's rows load. */
export function Loading() {
  return (
    <p className="py-2 text-label text-ink-3" aria-busy="true">
      Loading…
    </p>
  );
}

/** Whether this person's selection is on the Entry (the Entry or a passage in it). */
export function entrySelected(
  selection: SelectionTarget | null,
  entryId: string,
): boolean {
  return selection !== null && selection.kind !== "item"
    ? selection.entryId === entryId
    : false;
}

/** Text that a Member taps to edit, or plain text for a Viewer. */
export function EditableText({
  text,
  canEdit,
  onEdit,
  editLabel,
  className,
}: {
  text: ReactNode;
  canEdit: boolean;
  onEdit: () => void;
  editLabel: string;
  className?: string;
}) {
  const script = typeof text === "string" ? scriptClass(text) : undefined;
  if (!canEdit)
    return <span className={cn("min-w-0", script, className)}>{text}</span>;
  return (
    <button
      type="button"
      onClick={onEdit}
      title={editLabel}
      className={cn(
        "min-w-0 rounded-[3px] text-left",
        "decoration-rule-strong underline-offset-[3px] hover:underline hover:decoration-dotted",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        script,
        className,
      )}
    >
      {text}
    </button>
  );
}
