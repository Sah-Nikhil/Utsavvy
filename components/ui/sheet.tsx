"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DialogBackdrop,
  DialogCloseButton,
  DialogDescription,
  DialogTitle,
} from "./dialog";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export type SheetSide = "right" | "left" | "bottom" | "full";

const sideClass: Record<SheetSide, string> = {
  right: cn(
    "inset-y-0 right-0 w-[min(28rem,100vw)] rounded-l-xl border-l",
    "data-starting-style:translate-x-full data-ending-style:translate-x-full",
  ),
  left: cn(
    "inset-y-0 left-0 w-[min(28rem,100vw)] rounded-r-xl border-r",
    "data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
  ),
  bottom: cn(
    "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl border-t",
    "data-starting-style:translate-y-full data-ending-style:translate-y-full",
  ),
  // Full screen, e.g. the Google places sheet (ADR 0011). Arrives from below.
  full: cn(
    "inset-0 sm:inset-3 sm:rounded-xl sm:border",
    "data-starting-style:translate-y-6 data-starting-style:opacity-0",
    "data-ending-style:translate-y-6 data-ending-style:opacity-0",
  ),
};

export type SheetContentProps = Omit<
  ComponentProps<typeof SheetPrimitive.Popup>,
  "className"
> & {
  side?: SheetSide;
  title: ReactNode;
  description?: ReactNode;
  /** Extra controls in the header row, before the close button. */
  headerActions?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SheetContent({
  side = "right",
  title,
  description,
  headerActions,
  className,
  bodyClassName,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <DialogBackdrop />
      <SheetPrimitive.Popup
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col border-item-line bg-surface-raised text-ink shadow-sheet",
          "transition-[translate,opacity] duration-(--dur-arrival) ease-emphasized",
          "data-ending-style:duration-(--dur-feedback) data-ending-style:ease-standard",
          "focus-visible:outline-none",
          sideClass[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" ? (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-rule-strong/50"
          />
        ) : null}
        <div className="flex items-start gap-3 border-b border-rule px-5 pt-4 pb-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <DialogTitle className="text-title">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-label">
                {description}
              </DialogDescription>
            ) : null}
          </div>
          {headerActions}
          <DialogCloseButton className="-mr-2" />
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}
