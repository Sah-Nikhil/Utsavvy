"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Put one provider near the root so neighbouring tooltips share their delay. */
export function TooltipProvider({
  delay = 450,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

export type TooltipProps = {
  /** The tooltip text. Keep it short; it never holds the only copy of anything. */
  content: ReactNode;
  /** The trigger: one focusable element, such as an icon Button. */
  children: ReactElement;
  side?: ComponentProps<typeof TooltipPrimitive.Positioner>["side"];
  className?: string;
};

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={6}
          className="z-50"
        >
          <TooltipPrimitive.Popup
            className={cn(
              "max-w-64 rounded-sm bg-ink px-2.5 py-1.5 text-caption font-medium text-surface",
              "origin-(--transform-origin) transition-[opacity,scale] duration-(--dur-feedback) ease-standard",
              "data-starting-style:scale-[0.96] data-starting-style:opacity-0",
              "data-ending-style:opacity-0 data-instant:duration-0",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
