"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { ChatCardProps } from "@/components/chat/cards/registry";
import { LibraryPhotoTile } from "@/components/inspirations/parts";
import { errorMessage } from "@/components/people/errors";
import { api } from "@/convex/_generated/api";
import { parseStripCard } from "@/lib/inspirations/strip";

/*
 * The stock photo strip in a reply (inspirations.md rule 3): up to 6 library
 * photos that matched the request, never padded. Any Member in the Chat can
 * tap one; only tapped photos become Inspirations, tagged with the Function
 * the request named.
 */

export function StockStrip({ eventId, cardId }: ChatCardProps) {
  const card = parseStripCard(cardId);
  const photos = useQuery(
    api.inspirations.libraryPhotos,
    card ? { eventId, pexelsIds: card.pexelsIds } : "skip",
  );
  const panel = useQuery(api.inspirations.panel, { eventId });
  const canvas = useQuery(api.canvas.get, { eventId });
  const add = useMutation(api.inspirations.addFromLibrary);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (card === null) return null;
  const canEdit = panel?.canEdit ?? false;
  // A Function removed since the reply lands the photo Event-wide.
  const functionKey =
    card.functionKey !== null &&
    canvas?.functions.some((f) => f.key === card.functionKey)
      ? card.functionKey
      : null;
  const functionName = canvas?.functions.find(
    (f) => f.key === functionKey,
  )?.name;

  async function addPhoto(pexelsId: number) {
    setAdding(pexelsId);
    setError(null);
    try {
      await add({ eventId, pexelsId, functionKey });
    } catch (e) {
      setError(errorMessage(e, "Couldn't add that photo. Try again."));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-caption text-ink-3">
        {canEdit
          ? `Tap Add on the ones you like${functionName ? `; they land tagged ${functionName}` : ""}.`
          : "Members can add these to the Canvas."}
      </p>
      <ul
        aria-label="Stock photos"
        className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]"
      >
        {(photos ?? []).map((photo) => (
          <li key={photo.pexelsId} className="w-40 shrink-0 snap-start">
            <LibraryPhotoTile
              photo={photo}
              onAdd={() => void addPhoto(photo.pexelsId)}
              busy={adding === photo.pexelsId}
              disabled={!canEdit}
              sizes="160px"
              imageClassName="aspect-[4/5]"
            />
          </li>
        ))}
        {photos === undefined
          ? card.pexelsIds.map((id) => (
              <li
                key={id}
                aria-hidden
                className="aspect-[4/5] w-40 shrink-0 animate-pulse rounded-sm bg-surface-sunk"
              />
            ))
          : null}
      </ul>
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
