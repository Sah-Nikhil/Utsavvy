import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Status labels such as Booked, Quoted, Contacted or To find. */
export const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-caption leading-none font-semibold tracking-[0.01em] whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-high text-ink-2",
        action: "bg-selected text-on-selected",
        booked: "bg-booked-soft text-booked",
        quote: "bg-quote-soft text-quote",
        warn: "bg-warn-soft text-warn",
        outline: "border border-rule-strong text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = Omit<ComponentProps<"span">, "className"> &
  VariantProps<typeof badgeVariants> & { className?: string };

export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}
