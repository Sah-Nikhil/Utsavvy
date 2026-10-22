"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type Presence = "online" | "away" | "offline";
export type AvatarColour = 1 | 2 | 3 | 4 | 5 | 6;

const colourClass: Record<AvatarColour, string> = {
  1: "bg-avatar-1",
  2: "bg-avatar-2",
  3: "bg-avatar-3",
  4: "bg-avatar-4",
  5: "bg-avatar-5",
  6: "bg-avatar-6",
};

const sizeClass = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-caption",
  lg: "size-10 text-label",
} as const;

const dotSize = {
  sm: "size-2 border-[1.5px]",
  md: "size-2.5 border-2",
  lg: "size-3 border-2",
} as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** A stable colour per name, so a Member keeps their colour everywhere. */
function colourFor(name: string): AvatarColour {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ((hash % 6) + 1) as AvatarColour;
}

export type AvatarProps = {
  name: string;
  src?: string;
  /** Shows a presence dot. "offline" shows none. */
  presence?: Presence;
  size?: keyof typeof sizeClass;
  colour?: AvatarColour;
  className?: string;
};

export function Avatar({
  name,
  src,
  presence = "offline",
  size = "md",
  colour,
  className,
}: AvatarProps) {
  const label = presence === "offline" ? name : `${name}, ${presence}`;
  return (
    <span
      role="img"
      aria-label={label}
      data-presence={presence}
      className={cn("relative inline-flex shrink-0 rounded-full", className)}
    >
      <AvatarPrimitive.Root
        aria-hidden
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full leading-none font-semibold text-on-avatar select-none",
          colourClass[colour ?? colourFor(name)],
          sizeClass[size],
          presence === "away" && "opacity-55",
        )}
      >
        {src ? (
          <AvatarPrimitive.Image
            src={src}
            alt=""
            className="size-full object-cover"
          />
        ) : null}
        <AvatarPrimitive.Fallback>{initials(name)}</AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {presence !== "offline" ? (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full",
            dotSize[size],
            presence === "online"
              ? "border-surface bg-presence"
              : "border-ink-3 bg-surface",
          )}
        />
      ) : null}
    </span>
  );
}

/** Overlapping avatars, e.g. the Members looking at an Item. */
export function AvatarStack({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center *:ring-2 *:ring-surface [&>*:not(:first-child)]:-ml-1.5",
        className,
      )}
      {...props}
    />
  );
}
