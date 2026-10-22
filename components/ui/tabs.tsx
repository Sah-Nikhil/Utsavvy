"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

export function Tabs({
  className,
  ...props
}: WithClassName<ComponentProps<typeof TabsPrimitive.Root>>) {
  return (
    <TabsPrimitive.Root className={cn("grid gap-3", className)} {...props} />
  );
}

/** A tab row with a sliding indigo underline (the active tab's indicator). */
export function TabsList({
  className,
  children,
  ...props
}: WithClassName<ComponentProps<typeof TabsPrimitive.List>>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "relative flex items-stretch gap-1 border-b border-rule",
        className,
      )}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          "absolute bottom-[-1px] left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-action",
          "transition-[translate,width] duration-(--dur-arrival) ease-emphasized",
        )}
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({
  className,
  ...props
}: WithClassName<ComponentProps<typeof TabsPrimitive.Tab>>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "state-layer inline-flex h-10 items-center gap-1.5 rounded-t-xs px-3 text-label font-semibold text-ink-2",
        "transition-colors duration-(--dur-feedback) ease-standard",
        "data-active:text-action data-disabled:opacity-40",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: WithClassName<ComponentProps<typeof TabsPrimitive.Panel>>) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "text-body text-ink focus-visible:outline-offset-4",
        className,
      )}
      {...props}
    />
  );
}
