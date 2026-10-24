"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  EMBED_FALLBACK_MESSAGE,
  EMBED_HEIGHT_MESSAGE,
} from "@/lib/references/embedPage";
import { parseReferenceUrl, platformName } from "@/lib/references/parse";
import { cn } from "@/lib/utils";

// X2 (Pinterest and Instagram References) owns this folder. A Reference is
// drawn by the platform's own widget, inside one of our `/embed/*` pages in an
// iframe (ADR 0014), so Pinterest's and Instagram's scripts never run in the
// workspace document.

export type ReferenceEmbedProps = {
  platform: "pinterest" | "instagram";
  url: string;
  className?: string;
  /** Shows "Open on <platform>" under the preview. On by default. */
  showLink?: boolean;
  /**
   * The scroll height of a Pinterest board, in pixels (240 to 900; the embed
   * page clamps it). Cards keep the page's 240 px default.
   */
  boardHeight?: number;
};

/** Height before the embed page reports its own, roughly a Pin or post. */
const INITIAL_HEIGHT = 360;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 1600;

/**
 * The Pinterest frame is sandboxed with an opaque origin, so Pinterest's script
 * can't reach this document at all.
 *
 * The Instagram frame is NOT isolated. Instagram's post iframe inherits the
 * sandbox and stays a blank placeholder without an origin (checked
 * 2026-10-22), so the frame keeps `allow-same-origin`. Because `/embed/instagram`
 * is served from the app's own origin, Meta's `embed.js` runs with the app
 * origin's privileges and could reach this document and the Member's session.
 * Sah-Nikhil accepted this for v1 on 2026-10-23 (ADR 0014, Consequences). To
 * keep that trust to Meta's script alone, the page renders a blockquote
 * Utsavvy builds itself, never Meta's oEmbed HTML.
 */
const SANDBOX: Record<ReferenceEmbedProps["platform"], string> = {
  pinterest: "allow-scripts allow-popups allow-popups-to-escape-sandbox",
  instagram:
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
};

export const PIN_SHORT_HELP =
  "Open it on Pinterest and paste the full Pin link to see a preview.";

/**
 * The embed page for a Reference link, or null when it has no preview: a
 * `pin.it` short link, which Pinterest's widget doesn't take and our server
 * never resolves.
 */
export function embedSrc(
  platform: ReferenceEmbedProps["platform"],
  url: string,
  options: { boardHeight?: number } = {},
): string | null {
  const parsed = parseReferenceUrl(url);
  if ("error" in parsed || parsed.platform !== platform) return null;
  if (parsed.embedUrl === null) return null;
  const height =
    platform === "pinterest" && options.boardHeight !== undefined
      ? `&height=${Math.round(options.boardHeight)}`
      : "";
  return `/embed/${platform}?url=${encodeURIComponent(parsed.embedUrl)}${height}`;
}

/**
 * A Reference's preview: loads only once the card is near the screen, fits the
 * iframe to the height the embed page reports, and always offers the link.
 */
export function ReferenceEmbed({
  platform,
  url,
  className,
  showLink = true,
  boardHeight,
}: ReferenceEmbedProps) {
  const name = platformName(platform);
  const src = embedSrc(platform, url, { boardHeight });
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (src === null || visible) return;
    const element = holder.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [src, visible]);

  useEffect(() => {
    if (!visible) return;
    function onMessage(event: MessageEvent) {
      // The Pinterest page runs with an opaque origin, so a message is matched
      // to this card's own iframe rather than to an origin.
      if (event.source !== frame.current?.contentWindow) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null || !("type" in data))
        return;
      if (data.type === EMBED_HEIGHT_MESSAGE && "height" in data) {
        const reported = Number(data.height);
        if (Number.isFinite(reported) && reported > 0)
          setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, reported)));
      } else if (data.type === EMBED_FALLBACK_MESSAGE) {
        setHeight((current) => current ?? MIN_HEIGHT);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [visible]);

  return (
    <div
      data-reference-embed={platform}
      className={cn("grid gap-2", className)}
    >
      {src === null ? (
        <p className="rounded-sm border border-rule bg-surface-sunk px-3 py-2.5 text-label text-ink-2">
          {PIN_SHORT_HELP}
        </p>
      ) : (
        <div
          ref={holder}
          className="relative overflow-hidden rounded-sm bg-surface-sunk"
          style={{ height: height ?? INITIAL_HEIGHT }}
        >
          {height === null ? (
            <p
              aria-hidden
              className="absolute inset-0 grid place-items-center px-4 text-center text-caption text-ink-3"
            >
              Loading the preview from {name}
            </p>
          ) : null}
          {visible ? (
            <iframe
              ref={frame}
              src={src}
              title={`${name} preview`}
              loading="lazy"
              sandbox={SANDBOX[platform]}
              referrerPolicy="no-referrer"
              className="relative block size-full border-0 bg-transparent"
            />
          ) : null}
        </div>
      )}
      {showLink ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-label font-semibold text-action underline-offset-3 hover:underline"
        >
          Open on {name}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}
