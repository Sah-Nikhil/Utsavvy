"use client";

import { useMutation, useQuery } from "convex/react";
import { Search, X } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LibraryPhotoTile, PanelNote } from "./parts";

/*
 * Search (inspirations.md rule 2): the stock library's curator tags. An empty
 * query shows the Event's own set; a query shows up to 6 photos whose tags
 * match one of its words, and never pads with unrelated ones. The Theme's
 * words sit above as starting points.
 */

const PAGE = 24;

export function SearchTab({
  eventId,
  canEdit,
  themeWords,
  onUploadInstead,
}: {
  eventId: Id<"events">;
  canEdit: boolean;
  themeWords: readonly string[];
  onUploadInstead: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const result = useQuery(api.inspirations.search, {
    eventId,
    query: deferred,
    limit,
  });
  const add = useMutation(api.inspirations.addFromLibrary);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(pexelsId: number) {
    setAdding(pexelsId);
    setError(null);
    try {
      await add({ eventId, pexelsId });
    } catch (e) {
      setError(errorMessage(e, "Couldn't add that photo. Try again."));
    } finally {
      setAdding(null);
    }
  }

  const searching = deferred.trim() !== "";
  const photos = result?.photos ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor={inputId} className="sr-only">
          Search the stock library
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “marigold mandap” or “haldi”"
            autoComplete="off"
            className="pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <Button
              variant="text"
              size="sm"
              icon
              aria-label="Clear the search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1 -translate-y-1/2"
            >
              <X />
            </Button>
          ) : null}
        </div>
        {themeWords.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-ink-3">From your Theme:</span>
            {themeWords.slice(0, 6).map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => setQuery(word)}
                className="state-layer h-7 rounded-xs border border-rule px-2.5 text-caption font-medium text-ink-2 transition-colors duration-(--dur-feedback) ease-standard hover:border-rule-strong"
              >
                {word}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-label text-warn">
          {error}
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {result === undefined
          ? ""
          : searching
            ? `${photos.length} ${photos.length === 1 ? "photo matches" : "photos match"}`
            : `Showing ${photos.length} photos from your Event's set`}
      </p>

      {result === undefined ? (
        <ul aria-hidden className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <li
              key={i}
              className="aspect-[4/3] animate-pulse rounded-sm bg-surface-sunk"
            />
          ))}
        </ul>
      ) : photos.length === 0 ? (
        searching ? (
          <PanelNote
            action={
              canEdit ? (
                <Button variant="tonal" size="sm" onClick={onUploadInstead}>
                  Upload your own
                </Button>
              ) : null
            }
          >
            I don&apos;t have stock photos for that yet. You can upload your
            own.
          </PanelNote>
        ) : (
          <PanelNote>
            There&apos;s no stock set for this kind of Event yet. Search for
            what you have in mind, such as “stage” or “lanterns”.
          </PanelNote>
        )
      ) : (
        <>
          <p className="text-caption text-ink-3">
            {searching
              ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"} from the stock library`
              : "Hand-picked for your kind of Event"}
          </p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
            {photos.map((photo) => (
              <li key={photo.pexelsId}>
                <LibraryPhotoTile
                  photo={photo}
                  onAdd={() => void addPhoto(photo.pexelsId)}
                  busy={adding === photo.pexelsId}
                  disabled={!canEdit}
                  sizes="(max-width: 448px) 50vw, 200px"
                  imageClassName="aspect-[4/3]"
                />
              </li>
            ))}
          </ul>
          {!searching &&
          result.setSize !== null &&
          result.setSize > photos.length ? (
            <Button
              variant="outline"
              size="md"
              className="justify-self-center"
              onClick={() => setLimit((n) => n + PAGE)}
            >
              Show more
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
