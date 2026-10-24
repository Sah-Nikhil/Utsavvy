"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/*
 * An upload's picture for an <img>. The signed URL comes from a query that
 * checks the viewer is in the Event; the browser then fetches the file and
 * shows it from a `blob:` URL, so the page's image policy needs no Convex host.
 */

export type UploadImage =
  { state: "loading" } | { state: "ready"; src: string } | { state: "gone" };

export function useUploadImage(
  eventId: Id<"events">,
  itemId: Id<"items">,
): UploadImage {
  const url = useQuery(api.inspirations.imageUrl, { eventId, itemId });
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(
    null,
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ url, src: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(url);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (url === null) return { state: "gone" };
  if (url !== undefined && failedUrl === url) return { state: "gone" };
  if (loaded && loaded.url === url) return { state: "ready", src: loaded.src };
  return { state: "loading" };
}
