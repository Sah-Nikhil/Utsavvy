"use client";

import { Toggle } from "@base-ui/react/toggle";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { FunctionMarker, type FunctionIndex } from "./function-marker";

export type ChipProps = Omit<
  ComponentProps<typeof Toggle>,
  "className" | "pressed" | "defaultPressed" | "onPressedChange"
> & {
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** Shows the Function's colour diamond (looks d and bd only). */
  functionIndex?: FunctionIndex;
  className?: string;
};

/** A selectable filter chip, e.g. one per Function in the Function filter. */
export function Chip({
  selected,
  defaultSelected,
  onSelectedChange,
  functionIndex,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <Toggle
      pressed={selected}
      defaultPressed={defaultSelected}
      onPressedChange={
        onSelectedChange ? (pressed) => onSelectedChange(pressed) : undefined
      }
      className={cn(
        "state-layer group inline-flex h-8 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface-container px-3 text-label font-medium text-ink-2",
        "transition-[background-color,border-color,color,border-radius] duration-(--dur-shape) ease-standard active:rounded-xs",
        // Selected chips round off a little more: the shape says "on".
        "data-pressed:rounded-[16px] data-pressed:border-transparent data-pressed:bg-selected data-pressed:text-on-selected",
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Check
        aria-hidden
        strokeWidth={2.5}
        className="-ml-1 hidden size-3.5 group-data-pressed:block"
      />
      {functionIndex ? <FunctionMarker index={functionIndex} /> : null}
      {children}
    </Toggle>
  );
}
