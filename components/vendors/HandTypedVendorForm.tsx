"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/*
 * The fields of a hand-typed Vendor (X7, vendors.md "Adding a Vendor by
 * hand"): name, phone and area, for a Vendor with no website. Its category
 * is the checklist Entry's and is shown, not typed. Used to add one from
 * Find Vendors and to edit one on its card.
 */

export type HandTypedValues = {
  name: string;
  phone: string | null;
  area: string | null;
};

const TEXT_MAX = 80;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{4,19}$/;

/** Empty fields become null; the server trims and checks again. */
function cleaned(name: string, phone: string, area: string): HandTypedValues {
  return {
    name: name.trim(),
    phone: phone.trim() === "" ? null : phone.trim(),
    area: area.trim() === "" ? null : area.trim(),
  };
}

export function HandTypedVendorForm({
  categoryLabel,
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  secondary,
  idPrefix,
}: {
  /** "Caterer", or the Entry's free label. */
  categoryLabel: string;
  initial?: HandTypedValues;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (values: HandTypedValues) => Promise<unknown>;
  /** A Cancel button beside Save, when the form sits in a dialog. */
  secondary?: ReactNode;
  /** Keeps field names unique when two forms are on one page. */
  idPrefix: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = cleaned(name, phone, area);
    const badName = values.name === "" ? "Type the Vendor's name." : null;
    const badPhone =
      values.phone !== null && !PHONE_PATTERN.test(values.phone)
        ? "Use digits only, with spaces or dashes if you like."
        : null;
    setNameError(badName);
    setPhoneError(badPhone);
    if (badName || badPhone) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      if (initial === undefined) {
        setName("");
        setPhone("");
        setArea("");
      }
    } catch (e) {
      setError(errorMessage(e, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      className="grid gap-3"
      aria-label={`${submitLabel}: hand-typed Vendor`}
    >
      <p className="text-label text-ink-2">
        Category: <span className="font-medium text-ink">{categoryLabel}</span>
      </p>
      <Field label="Name" name={`${idPrefix}-name`} error={nameError}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TEXT_MAX}
          autoComplete="off"
          required
        />
      </Field>
      <Field
        label="Phone (optional)"
        name={`${idPrefix}-phone`}
        error={phoneError}
      >
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={24}
          className="num"
        />
      </Field>
      <Field
        label="Area (optional)"
        name={`${idPrefix}-area`}
        description="The locality they work from, such as Malviya Nagar."
      >
        <Input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          maxLength={TEXT_MAX}
          autoComplete="off"
        />
      </Field>
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondary}
        <Button type="submit" variant="tonal" size="md" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
