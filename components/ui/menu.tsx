"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuGroup = MenuPrimitive.Group;

/**
 * Floating surface shared by Menu and Tooltip-like popups: the container tone
 * with one soft offset shadow, growing out of its trigger.
 */
export const popupSurface = cn(
  "rounded-lg bg-surface-container text-ink shadow-overlay",
  "origin-(--transform-origin) transition-[opacity,scale] duration-(--dur-arrival) ease-emphasized",
  "data-starting-style:scale-[0.92] data-starting-style:opacity-0",
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-(--dur-exit) data-ending-style:ease-emphasized-accelerate",
  "focus-visible:outline-none",
);

export type MenuContentProps = WithClassName<
  ComponentProps<typeof MenuPrimitive.Popup>
> & {
  side?: ComponentProps<typeof MenuPrimitive.Positioner>["side"];
  align?: ComponentProps<typeof MenuPrimitive.Positioner>["align"];
  sideOffset?: number;
};

export function MenuContent({
  side = "bottom",
  align = "start",
  sideOffset = 6,
  className,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <MenuPrimitive.Popup
          className={cn(popupSurface, "min-w-52 p-1.5", className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export type MenuItemProps = WithClassName<
  ComponentProps<typeof MenuPrimitive.Item>
> & {
  icon?: ReactNode;
  /** Keyboard hint shown at the end, e.g. "Ctrl K". */
  hint?: ReactNode;
  tone?: "default" | "danger";
};

export function MenuItem({
  icon,
  hint,
  tone = "default",
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "state-layer flex min-h-10 cursor-default items-center gap-3 rounded-md px-3 text-label font-medium outline-none select-none",
        "transition-[border-radius] duration-(--dur-shape) ease-standard active:rounded-sm",
        "data-highlighted:before:opacity-(--state-focus)",
        "data-disabled:pointer-events-none data-disabled:opacity-40",
        tone === "danger" ? "text-warn" : "text-ink",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn("flex", tone === "danger" ? "text-warn" : "text-ink-2")}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex-1">{children}</span>
      {hint ? (
        <span className="text-caption text-ink-3 num">{hint}</span>
      ) : null}
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator({
  className,
  ...props
}: WithClassName<ComponentProps<typeof MenuPrimitive.Separator>>) {
  return (
    <MenuPrimitive.Separator
      className={cn("mx-3 my-1.5 h-px bg-rule", className)}
      {...props}
    />
  );
}

/** A heading for a group of items. Must sit inside <MenuGroup>. */
export function MenuGroupLabel({
  className,
  ...props
}: WithClassName<ComponentProps<typeof MenuPrimitive.GroupLabel>>) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-3 pt-2 pb-1 text-caption font-semibold text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
