"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Dimmed paper-toned scrim shared by Dialog and Sheet. */
export function DialogBackdrop({
  className,
  ...props
}: WithClassName<ComponentProps<typeof DialogPrimitive.Backdrop>>) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-scrim",
        "transition-opacity duration-(--dur-arrival) ease-standard",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: WithClassName<ComponentProps<typeof DialogPrimitive.Title>>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-headline text-ink", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: WithClassName<ComponentProps<typeof DialogPrimitive.Description>>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-body text-ink-2", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: WithClassName<ComponentProps<"div">>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-end gap-2",
        className,
      )}
      {...props}
    />
  );
}

/** The corner close control used by Dialog and Sheet. */
export function DialogCloseButton({
  label = "Close",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <DialogPrimitive.Close
      render={
        <Button
          variant="text"
          size="sm"
          icon
          aria-label={label}
          className={className}
        />
      }
    >
      <X aria-hidden />
    </DialogPrimitive.Close>
  );
}

export type DialogContentProps = WithClassName<
  ComponentProps<typeof DialogPrimitive.Popup>
> & {
  title: ReactNode;
  description?: ReactNode;
  /** Hide the corner close button when the footer already offers a way out. */
  hideClose?: boolean;
};

/**
 * A centred dialog: tonal raised surface, large corners, a subtle overlay shadow.
 * Keep modals for work that needs interruption or protected focus.
 */
export function DialogContent({
  title,
  description,
  hideClose,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto",
          "-translate-x-1/2 -translate-y-1/2 rounded-lg border border-item-line bg-surface-raised p-6 text-ink shadow-overlay",
          "transition-[opacity,scale,translate] duration-(--dur-arrival) ease-emphasized",
          "data-starting-style:scale-[0.97] data-starting-style:opacity-0",
          "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-(--dur-feedback) data-ending-style:ease-standard",
          "focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-4">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </div>
          {hideClose ? null : <DialogCloseButton className="-mt-1 -mr-2" />}
        </div>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
