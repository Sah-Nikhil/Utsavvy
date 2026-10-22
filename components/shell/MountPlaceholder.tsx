import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What a mount point shows until its slice fills it. */
export function MountPlaceholder({
  title,
  slice,
  children,
  className,
}: {
  title: string;
  slice: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-rule-strong bg-surface-sunk/60 px-4 py-3 text-label text-ink-2",
        className,
      )}
    >
      <p className="font-semibold text-ink">{title}</p>
      <p>Arrives with {slice}.</p>
      {children}
    </div>
  );
}
