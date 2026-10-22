"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<
  ComponentProps<typeof SwitchPrimitive.Root>,
  "className"
> & {
  /** Visible label. Without one, pass an `aria-label`. */
  label?: ReactNode;
  className?: string;
};

export function Switch({ label, className, ...props }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      className={cn(
        "group relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-rule-strong bg-surface-sunk",
        "transition-[background-color,border-color] duration-(--dur-feedback) ease-standard",
        "data-checked:border-action data-checked:bg-action",
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3.5 translate-x-1 rounded-full bg-rule-strong",
          "transition-[translate,width,height,background-color] duration-(--dur-feedback) ease-standard",
          "not-data-checked:group-hover:bg-ink-2 group-active:size-4",
          "data-checked:size-4.5 data-checked:translate-x-[18px] data-checked:bg-on-action",
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 text-label text-ink",
        className,
      )}
    >
      {control}
      {label}
    </label>
  );
}
