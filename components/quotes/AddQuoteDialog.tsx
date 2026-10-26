"use client";

import { useAction } from "convex/react";
import { Paperclip } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PriceBadge } from "@/components/ui/price-badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES } from "./attachments";
import {
  QUOTE_UNIT_LABELS,
  QUOTE_UNITS,
  quoteLine,
  standaloneTotal,
  type QuoteUnit,
} from "./quotes";

/*
 * "Add Quote" on a Shortlisted Vendor's link (docs/design/vendors.md,
 * "Quotes"): amount, unit, the Functions it covers (none means the whole
 * Entry), the Guests it assumes, the day it was received, a note and an
 * optional photo or PDF. The form shows what the Quote comes to as it is
 * typed, worked out by the same code the Budget uses.
 */

export type FunctionOption = {
  key: string;
  name: string;
  guests: number | null;
};

const selectClass = cn(
  "h-11 w-full min-w-0 rounded-md border border-rule-strong bg-surface px-3 text-body text-ink",
  "transition-[border-color,box-shadow,border-radius] duration-(--dur-shape) ease-standard hover:border-ink-2",
  "focus-visible:rounded-sm focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
);

/** Today in India, as the date input wants it. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

/** Noon in India on an ISO day, so the day shows the same everywhere. */
function dayToTimestamp(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = Date.parse(`${day}T12:00:00+05:30`);
  return Number.isFinite(at) ? at : null;
}

function wholeNumber(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function AddQuoteDialog({
  linkId,
  vendorName,
  entryLabel,
  functions,
  served,
  close,
}: {
  linkId: Id<"vendorLinks">;
  vendorName: string;
  entryLabel: string;
  functions: readonly FunctionOption[];
  /** The Functions the link's checklist Entry serves. */
  served: readonly string[];
  close: () => void;
}) {
  const add = useAction(api.quotes.add);
  const ids = useId();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<QuoteUnit>("per_plate");
  const [keys, setKeys] = useState<string[]>(
    served.length === 1 ? [...served] : [],
  );
  const [guests, setGuests] = useState("");
  const [received, setReceived] = useState(todayInIndia);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<{
    field: "amount" | "guests" | "file" | "form";
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const amountValue = wholeNumber(amount);
  const guestsValue = wholeNumber(guests);
  const preview =
    amountValue !== null && amountValue > 0 && !Number.isNaN(guestsValue)
      ? quoteLine({
          amount: Math.round(amountValue),
          unit,
          functionKeys: keys,
          guests: guestsValue,
          total: standaloneTotal({
            amount: Math.round(amountValue),
            unit,
            functionKeys: keys,
            guests: guestsValue,
          }),
        })
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amountValue === null || Number.isNaN(amountValue) || amountValue < 1) {
      setError({
        field: "amount",
        message: "Type the amount in rupees, such as 950.",
      });
      return;
    }
    if (
      Number.isNaN(guestsValue) ||
      (guestsValue !== null && !Number.isInteger(guestsValue))
    ) {
      setError({
        field: "guests",
        message: "Type the Guests as a whole number, such as 300.",
      });
      return;
    }
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      setError({ field: "file", message: `${file.name} is over 10 MB.` });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await add({
        linkId,
        amount: Math.round(amountValue),
        unit,
        functionKeys: keys,
        guests: guestsValue,
        receivedAt: dayToTimestamp(received),
        note: note.trim() === "" ? null : note,
        file: file ? await file.arrayBuffer() : null,
      });
      close();
    } catch (caught) {
      setError({
        field: "form",
        message: errorMessage(caught, "The Quote didn't save. Try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={`Add a Quote from ${vendorName}`}
      description={`For ${entryLabel}. Only this Event's people see it, and it never changes a budget line's amount by itself.`}
    >
      <form onSubmit={submit} className="mt-5 grid gap-4" noValidate>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Field
            label="Amount (₹)"
            error={error?.field === "amount" ? error.message : undefined}
          >
            <Input
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="950"
              className="num"
            />
          </Field>
          <div className="grid gap-1.5">
            <label
              htmlFor={`${ids}-unit`}
              className="text-label font-semibold text-ink"
            >
              Per
            </label>
            <select
              id={`${ids}-unit`}
              value={unit}
              onChange={(e) => setUnit(e.target.value as QuoteUnit)}
              className={selectClass}
            >
              {QUOTE_UNITS.map((option) => (
                <option key={option} value={option}>
                  {QUOTE_UNIT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {functions.length > 0 ? (
          <fieldset className="grid gap-1.5">
            <legend className="text-label font-semibold text-ink">
              Functions it covers
            </legend>
            <p className="text-caption text-ink-2">
              None ticked means the whole Entry.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
              {functions.map((fn) => (
                <label
                  key={fn.key}
                  className="inline-flex min-h-8 items-center gap-2 text-label text-ink"
                >
                  <input
                    type="checkbox"
                    checked={keys.includes(fn.key)}
                    onChange={(e) =>
                      setKeys((current) =>
                        e.target.checked
                          ? [...current, fn.key]
                          : current.filter((k) => k !== fn.key),
                      )
                    }
                    className="size-4 accent-(--action)"
                  />
                  {fn.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Field
            label="Guests it assumes"
            error={error?.field === "guests" ? error.message : undefined}
          >
            <Input
              inputMode="numeric"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="300"
              className="num"
            />
          </Field>
          <Field label="Received on">
            <Input
              type="date"
              value={received}
              max={todayInIndia()}
              onChange={(e) => setReceived(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Note">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Live counters extra"
            className={scriptClass(note)}
          />
        </Field>

        <div className="grid gap-1.5">
          <label
            htmlFor={`${ids}-file`}
            className="inline-flex items-center gap-1.5 text-label font-semibold text-ink"
          >
            <Paperclip aria-hidden className="size-4 text-ink-2" />
            Photo or PDF of the quote (optional)
          </label>
          <input
            id={`${ids}-file`}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-describedby={`${ids}-file-help`}
            className="text-label text-ink-2 file:mr-3 file:h-9 file:rounded-[18px] file:border-0 file:bg-action-tonal file:px-4 file:text-label file:font-semibold file:text-on-action-tonal"
          />
          <p id={`${ids}-file-help`} className="text-caption text-ink-2">
            JPEG, PNG, WebP or PDF, up to 10 MB. Only this Event&apos;s people
            can open it.
          </p>
          {error?.field === "file" ? (
            <p role="alert" className="text-caption font-medium text-warn">
              {error.message}
            </p>
          ) : null}
        </div>

        <p
          aria-live="polite"
          className="flex min-h-6 flex-wrap items-center gap-1.5 text-label text-ink-2"
        >
          {preview ? (
            <>
              <PriceBadge kind="quote" detail="none" />
              <span className="num">{preview}</span>
            </>
          ) : null}
        </p>

        {error?.field === "form" ? (
          <p role="alert" className="text-caption font-medium text-warn">
            {error.message}
          </p>
        ) : null}

        <DialogFooter className="mt-0">
          <DialogClose render={<Button type="button" variant="text" />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save Quote"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
