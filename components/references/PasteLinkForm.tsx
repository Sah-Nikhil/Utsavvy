"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  REFERENCE_NOTE_MAX,
  composeNote,
  noteChips,
  noteTooLong,
} from "@/lib/references/note";
import {
  parseReferenceUrl,
  platformName,
  type ReferenceUrlError,
} from "@/lib/references/parse";
import { ReferenceEmbed } from "./ReferenceEmbed";

// X2 owns this file: "Paste a link" in the Add Inspiration panel
// (inspirations.md rules 6 and 7, ADR 0014). Utsavvy keeps only the link and
// the Member's note; the preview comes from the platform's own embed.

export type PasteLinkFormProps = {
  eventId: string;
  /** Called after a Reference is saved, with its new Item. */
  onSaved?: (saved: { itemId: Id<"items"> }) => void;
};

export const PREVIEW_NOTICE =
  "Previews load from Pinterest or Instagram, which receive the usual browser data.";

const URL_ERRORS: Record<ReferenceUrlError, string> = {
  invalid: "That doesn't look like a link. Copy it from the Share button.",
  notHttps: "Paste the full link, starting with https://.",
  notSupported:
    "Paste a Pinterest Pin or board, or an Instagram post or Reel. Profiles, searches and stories can't be saved.",
};

function saveError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string; reason?: string } | undefined;
    if (data?.kind === "AccessDenied")
      return data.reason === "notAllowed"
        ? "You can view this Event but not add to it."
        : "You're no longer part of this Event.";
    if (data?.kind === "ReferenceUrlRefused") return URL_ERRORS.notSupported;
    if (data?.kind === "ReferenceNoteTooLong")
      return `A note can be up to ${REFERENCE_NOTE_MAX} characters.`;
  }
  return "Couldn't save this link. Check your connection and try again.";
}

export function PasteLinkForm({ eventId, onSaved }: PasteLinkFormProps) {
  const headingId = useId();
  const chipsId = useId();
  const [link, setLink] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const themeWords = useQuery(api.references.themeWords, { eventId });
  const add = useMutation(api.references.add);

  const parsed = link.trim() === "" ? null : parseReferenceUrl(link);
  const reference = parsed !== null && !("error" in parsed) ? parsed : null;
  const linkError =
    parsed !== null && "error" in parsed ? URL_ERRORS[parsed.error] : null;
  const chips =
    reference === null ? [] : noteChips(reference.urlKind, themeWords ?? []);
  const note = composeNote(picked, text);
  const tooLong = noteTooLong(note);

  function toggle(chip: string, on: boolean) {
    setPicked((current) =>
      on ? [...current, chip] : current.filter((c) => c !== chip),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reference === null || saving || tooLong) return;
    setSaving(true);
    setError(null);
    try {
      const result = await add({
        eventId: eventId as Id<"events">,
        url: reference.url,
        note,
      });
      setSaved(`Saved to Inspirations. Find it on the Canvas.`);
      setLink("");
      setPicked([]);
      setText("");
      onSaved?.(result);
    } catch (caught) {
      setError(saveError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      data-paste-link
      className="grid gap-4 rounded-md border border-rule bg-surface p-4"
    >
      <header className="grid gap-1">
        <h3 id={headingId} className="text-title font-semibold text-ink">
          Paste a link
        </h3>
        <p className="text-caption text-ink-2">{PREVIEW_NOTICE}</p>
      </header>

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field
          label="Pinterest or Instagram link"
          description={
            linkError === null ? "A Pin, a board, a post or a Reel." : undefined
          }
          error={linkError ?? undefined}
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.pinterest.com/pin/…"
            value={link}
            onChange={(event) => {
              const next = event.currentTarget.value;
              const nextParsed =
                next.trim() === "" ? null : parseReferenceUrl(next);
              const nextUrl =
                nextParsed !== null && !("error" in nextParsed)
                  ? nextParsed.url
                  : null;
              // Chips belong to one link: a new link starts with none tapped.
              if (nextUrl !== (reference?.url ?? null)) setPicked([]);
              setLink(next);
              setSaved(null);
              setError(null);
            }}
          />
        </Field>

        {reference !== null ? (
          <>
            <ReferenceEmbed
              key={reference.url}
              platform={reference.platform}
              url={reference.url}
            />

            <fieldset className="grid gap-2" aria-describedby={chipsId}>
              <legend className="text-label font-semibold text-ink">
                What do you like in this?
              </legend>
              <p id={chipsId} className="text-caption text-ink-2">
                Your words are all the Assistant learns about this{" "}
                {platformName(reference.platform)} link.
              </p>
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <Chip
                    key={chip}
                    selected={picked.includes(chip)}
                    onSelectedChange={(on) => toggle(chip, on)}
                  >
                    {chip}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <Field
              label="Anything else?"
              error={
                tooLong
                  ? `A note can be up to ${REFERENCE_NOTE_MAX} characters.`
                  : undefined
              }
            >
              <Textarea
                rows={2}
                placeholder="The teal drapes and the brass lanterns"
                value={text}
                onChange={(event) => setText(event.currentTarget.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving || tooLong}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {error !== null ? (
                <p role="alert" className="text-label font-medium text-warn">
                  {error}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <p role="status" className="text-label text-ink-2 empty:hidden">
          {saved}
        </p>
      </form>
    </section>
  );
}
