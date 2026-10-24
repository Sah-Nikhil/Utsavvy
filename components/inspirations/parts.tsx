"use client";

import { Check, Plus } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Pieces the Add Inspiration panel, the Chat's stock photo strip and the
 * Inspiration card share.
 */

/** "Photo by Anil Sharma on Pexels", with the photographer and the photo's page both linked (rule 24). */
export function PexelsCredit({
  photographer,
  photographerUrl,
  pageUrl,
  className,
}: {
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
  className?: string;
}) {
  const link =
    "underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink-3";
  return (
    <span className={cn("min-w-0", className)}>
      Photo by{" "}
      <a
        href={photographerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        {photographer}
      </a>{" "}
      on{" "}
      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        Pexels
      </a>
    </span>
  );
}

/** A row of colour dots for a palette (the colours are data, so they come in as styles). */
export function Swatches({
  palette,
  size = "sm",
  className,
}: {
  palette: readonly string[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (palette.length === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center",
        size === "sm" ? "-space-x-1" : "-space-x-1.5",
        className,
      )}
    >
      {palette.map((colour, i) => (
        <span
          key={`${colour}-${i}`}
          className={cn(
            "rounded-full ring-2 ring-surface",
            size === "sm" ? "size-3" : "size-4.5",
          )}
          style={{ backgroundColor: colour }}
        />
      ))}
    </span>
  );
}

export type LibraryPhotoView = {
  pexelsId: number;
  localPath: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
  added: boolean;
};

/**
 * One library photo with its credit and an Add button. Tapping adds it as an
 * Inspiration; once it is in the Event the button shows "Added".
 */
export function LibraryPhotoTile({
  photo,
  onAdd,
  busy,
  disabled,
  sizes,
  className,
  imageClassName,
}: {
  photo: LibraryPhotoView;
  onAdd: () => void;
  busy: boolean;
  disabled: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  const label = photo.added ? "Added" : busy ? "Adding" : "Add";
  return (
    <figure className={cn("group/photo grid min-w-0 gap-1.5", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-sm bg-surface-sunk",
          imageClassName,
        )}
      >
        <Image
          src={photo.localPath}
          alt={photo.alt}
          fill
          sizes={sizes}
          // Served as they are from our own origin (ADR 0012): already 1200 px WebP.
          unoptimized
          className="object-cover transition-transform duration-(--dur-arrival) ease-emphasized group-hover/photo:scale-[1.03]"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || busy || photo.added}
          aria-label={`${label}: ${photo.alt}`}
          className={cn(
            "state-layer absolute right-1.5 bottom-1.5 inline-flex h-8 items-center gap-1 rounded-sm px-2.5 text-label font-semibold shadow-item",
            "transition-[background-color,color] duration-(--dur-feedback) ease-standard",
            photo.added
              ? "bg-booked-soft text-booked"
              : "bg-surface text-action disabled:opacity-60",
          )}
        >
          {photo.added ? (
            <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
          ) : (
            <Plus aria-hidden strokeWidth={2.5} className="size-3.5" />
          )}
          {label}
        </button>
      </div>
      <figcaption className="truncate text-caption text-ink-3">
        <PexelsCredit
          photographer={photo.photographer}
          photographerUrl={photo.photographerUrl}
          pageUrl={photo.pageUrl}
        />
      </figcaption>
    </figure>
  );
}

/** A quiet panel note, such as the empty or no-match state. */
export function PanelNote({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-2 rounded-md bg-surface-sunk px-4 py-3.5 text-label text-ink-2">
      <p>{children}</p>
      {action}
    </div>
  );
}
