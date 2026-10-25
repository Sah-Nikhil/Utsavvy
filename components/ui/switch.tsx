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
        "group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-rule-strong bg-surface-high",
        "transition-[background-color,border-color] duration-(--dur-feedback) ease-standard",
        "data-checked:border-action data-checked:bg-action",
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // MD3 switch: a small handle when off, a large one when on, and the
          // handle grows while pressed.
          "block size-3.5 translate-x-1.5 rounded-full bg-rule-strong",
          "transition-[translate,width,height,background-color] duration-(--dur-shape) ease-emphasized",
          "not-data-checked:group-hover:bg-ink-2 not-data-checked:group-active:size-5 not-data-checked:group-active:translate-x-0.5",
          "data-checked:size-5 data-checked:translate-x-[22px] data-checked:bg-on-action",
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
