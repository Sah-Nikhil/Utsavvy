import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SeparatorProps = Omit<
  ComponentProps<typeof SeparatorPrimitive>,
  "className"
> & {
  className?: string;
};

export function Separator({
  orientation = "horizontal",
  className,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive
      orientation={orientation}
      className={cn(
        "shrink-0 bg-rule",
        orientation === "vertical" ? "h-auto w-px self-stretch" : "h-px w-full",
        className,
      )}
      {...props}
    />
  );
}
