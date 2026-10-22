"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

export function Accordion({
  className,
  ...props
}: WithClassName<ComponentProps<typeof AccordionPrimitive.Root>>) {
  return (
    <AccordionPrimitive.Root className={cn("grid", className)} {...props} />
  );
}

export function AccordionItem({
  className,
  ...props
}: WithClassName<ComponentProps<typeof AccordionPrimitive.Item>>) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b border-rule last:border-b-0", className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: WithClassName<ComponentProps<typeof AccordionPrimitive.Trigger>>) {
  return (
    <AccordionPrimitive.Header className="m-0">
      <AccordionPrimitive.Trigger
        className={cn(
          "state-layer group flex w-full items-center gap-3 rounded-xs px-2 py-3 text-left text-body font-semibold text-ink",
          "data-disabled:opacity-40",
          className,
        )}
        {...props}
      >
        <span className="flex-1">{children}</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink-3 transition-transform duration-(--dur-feedback) ease-standard group-data-panel-open:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionPanel({
  className,
  children,
  ...props
}: WithClassName<ComponentProps<typeof AccordionPrimitive.Panel>>) {
  return (
    <AccordionPrimitive.Panel
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden text-body text-ink-2",
        "transition-[height] duration-(--dur-arrival) ease-emphasized",
        "data-starting-style:h-0 data-ending-style:h-0",
      )}
      {...props}
    >
      <div className={cn("px-2 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
