"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { PexelsCredit, Swatches } from "@/components/inspirations/parts";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/*
 * S18: the vibe pick on the Brief summary (first-brief.md "Vibe pick",
 * inspirations.md rules 21 to 23). The Event's 12 curated photos show at once
 * from our own origin; the Member taps 3 to 5, or skips. "Show me more" adds
 * the set's other photos, 12 at a time. There is no live search (ADR 0012).
 */

type PickView = Extract<
  NonNullable<ReturnType<typeof useVibePickView>>,
  { kind: "pick" }
>;

function useVibePickView(eventId: Id<"events">, more: number) {
  return useQuery(api.vibePick.view, { eventId, more });
}

const skipKey = (eventId: string) => `utsavvy:vibe-pick-skipped:${eventId}`;

/** Skipping is a choice on this device only: the Theme stays empty either way. */
function useSkipped(eventId: Id<"events">) {
  const [skipped, setSkippedState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(skipKey(eventId)) === "1";
    } catch {
      return false;
    }
  });
  const setSkipped = (value: boolean) => {
    setSkippedState(value);
    try {
      if (value) window.localStorage.setItem(skipKey(eventId), "1");
      else window.localStorage.removeItem(skipKey(eventId));
    } catch {
      // Private mode: the skip lasts for this visit.
    }
  };
  return [skipped, setSkipped] as const;
}

export function VibePick({ eventId }: { eventId: Id<"events"> }) {
  const [more, setMore] = useState(0);
  const view = useVibePickView(eventId, more);
  const [skipped, setSkipped] = useSkipped(eventId);
  const [reopened, setReopened] = useState(false);

  if (view === undefined || view.kind === "hidden") return null;
  if (view.kind === "noSet") {
    return (
      <p className="text-caption text-ink-3" data-vibe-pick="skipped">
        There are no look photos for this kind of Event yet, so we&apos;ll skip
        picking a look.
      </p>
    );
  }
  if (skipped) {
    return (
      <Line data="skipped">
        You skipped picking a look.{" "}
        <InlineAction onClick={() => setSkipped(false)}>
          Pick a look
        </InlineAction>
      </Line>
    );
  }
  if (view.picked.length > 0 && !reopened) {
    return <Picked view={view} onMore={() => setReopened(true)} />;
  }
  return (
    <PickGrid
      eventId={eventId}
      view={view}
      onShowMore={() => setMore((n) => n + 1)}
      onSkip={() => setSkipped(true)}
      onDone={() => setReopened(false)}
    />
  );
}

function Line({ children, data }: { children: ReactNode; data: string }) {
  return (
    <p className="text-caption text-ink-3" data-vibe-pick={data}>
      {children}
    </p>
  );
}

function InlineAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xs font-medium text-action underline decoration-action/40 underline-offset-2 hover:decoration-action focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}

/** After a pick: the Theme's colours, and where the photos went. */
function Picked({ view, onMore }: { view: PickView; onMore: () => void }) {
  const n = view.picked.length;
  return (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-ink-3"
      data-vibe-pick="picked"
    >
      <Swatches palette={view.palette} size="md" />
      <span>
        {n} {n === 1 ? "photo" : "photos"} picked for the look, now in
        Inspirations.
      </span>
      <InlineAction onClick={onMore}>Pick more</InlineAction>
    </div>
  );
}

function PickGrid({
  eventId,
  view,
  onShowMore,
  onSkip,
  onDone,
}: {
  eventId: Id<"events">;
  view: PickView;
  onShowMore: () => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const pick = useMutation(api.vibePick.pick);
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const { min, max, page } = view.limits;
  // Photos already in the Event, from an earlier pick or from Search.
  const already = new Set(view.added);
  const picks = view.picked.length;
  // A first pick needs 3; adding to an earlier pick needs only 1.
  const needed = Math.max(1, min - picks);
  const ready = chosen.length >= needed && chosen.length <= max;

  function toggle(pexelsId: number) {
    setError(null);
    if (chosen.includes(pexelsId)) {
      setFull(false);
      setChosen(chosen.filter((id) => id !== pexelsId));
    } else if (chosen.length >= max) {
      setFull(true);
    } else {
      setChosen([...chosen, pexelsId]);
    }
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pick({ eventId, pexelsIds: chosen });
      setChosen([]);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save your pick. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const status = full
    ? `You've picked ${max}. Tap one to swap it out.`
    : chosen.length === 0
      ? picks > 0
        ? "Tap more photos to add them."
        : `Tap ${min} to ${max} photos you like.`
      : chosen.length < needed
        ? `${chosen.length} picked · ${needed - chosen.length} more to go`
        : `${chosen.length} of ${max} picked`;

  // The Theme row's value column is narrow, so the grid takes the card's whole
  // width by reaching back over the row's 6rem label column and its gap.
  return (
    <section
      aria-label="Pick a look"
      className="@container mt-1 -ml-[6.75rem] flex flex-col gap-3"
      data-vibe-pick="grid"
    >
      <p className="text-body text-ink-2">
        Want to pick a look? Tap {min} to {max} photos you like, or skip.
      </p>

      <ul className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 @md:grid-cols-3">
        {view.photos.map((photo, i) => {
          const order = chosen.indexOf(photo.pexelsId);
          return (
            <li key={photo.pexelsId}>
              <PhotoTile
                photo={photo}
                order={order === -1 ? null : order + 1}
                added={already.has(photo.pexelsId)}
                disabled={busy}
                onToggle={() => toggle(photo.pexelsId)}
                eager={i < page}
              />
            </li>
          );
        })}
      </ul>

      {view.hasMore ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          onClick={onShowMore}
        >
          Show me more
        </Button>
      ) : null}

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-surface-high py-2 pr-2 pl-3.5 shadow-lift">
        <p
          aria-live="polite"
          className="num min-w-0 text-caption text-ink-3"
          data-vibe-pick-status
        >
          {status}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {picks === 0 ? (
            <Button variant="text" size="sm" onClick={onSkip} disabled={busy}>
              Skip
            </Button>
          ) : (
            <Button variant="text" size="sm" onClick={onDone} disabled={busy}>
              Done
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={!ready || busy}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : null}
            {chosen.length > 0
              ? `Use ${chosen.length === 1 ? "this" : `these ${chosen.length}`}`
              : "Use these"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-label text-warn">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PhotoTile({
  photo,
  order,
  added,
  disabled,
  onToggle,
  eager,
}: {
  photo: PickView["photos"][number];
  order: number | null;
  added: boolean;
  disabled: boolean;
  onToggle: () => void;
  eager: boolean;
}) {
  const on = order !== null;
  return (
    <figure className="grid min-w-0 gap-1">
      <button
        type="button"
        aria-pressed={added ? undefined : on}
        aria-disabled={added || undefined}
        disabled={disabled}
        onClick={added ? undefined : onToggle}
        className={cn(
          "group/tile relative block aspect-[4/5] overflow-hidden rounded-md bg-surface-sunk",
          "transition-[box-shadow] duration-(--dur-feedback) ease-standard",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          on && "ring-2 ring-action ring-offset-2 ring-offset-surface-raised",
          added && "cursor-default",
        )}
      >
        <Image
          src={photo.localPath}
          alt={photo.alt}
          fill
          sizes="(max-width: 480px) 45vw, 160px"
          // Served as they are from our own origin (ADR 0012).
          unoptimized
          loading={eager ? "eager" : "lazy"}
          className={cn(
            "object-cover transition-[transform,filter] duration-(--dur-shape) ease-emphasized",
            on ? "scale-[1.04]" : "group-hover/tile:scale-[1.03]",
            added && "saturate-[0.6]",
          )}
        />
        {on ? (
          <span
            aria-hidden
            className="num absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-action text-label font-semibold text-on-action shadow-item"
          >
            {order}
          </span>
        ) : added ? (
          <span className="absolute top-1.5 right-1.5 inline-flex h-6 items-center gap-1 rounded-full bg-booked-soft px-2 text-caption font-semibold text-booked shadow-item">
            <Check aria-hidden strokeWidth={2.5} className="size-3" />
            Added
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-7 rounded-full border-2 border-on-action/90 bg-scrim/20 opacity-80 transition-opacity duration-(--dur-feedback) group-hover/tile:opacity-100"
          />
        )}
      </button>
      <figcaption className="line-clamp-2 text-caption text-ink-3">
        <PexelsCredit
          photographer={photo.photographer}
          photographerUrl={photo.photographerUrl}
          pageUrl={photo.pageUrl}
        />
      </figcaption>
    </figure>
  );
}
