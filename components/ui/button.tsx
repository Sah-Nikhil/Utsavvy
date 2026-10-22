"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Behaviour and accessibility come from Base UI; the look is ours.
 * MD3 state layers (the `state-layer` utility in app/globals.css) show hover,
 * focus and press, and the corners tighten a little while pressed.
 */
export const buttonVariants = cva(
  [
    "state-layer inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap",
    "font-text font-semibold tracking-[0.005em]",
    "rounded-sm transition-[border-radius,background-color,color,box-shadow] duration-(--dur-feedback) ease-standard",
    "active:rounded-xs",
    "disabled:cursor-not-allowed disabled:opacity-40 data-disabled:cursor-not-allowed data-disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        filled: "bg-action text-on-action",
        tonal: "bg-action-tonal text-on-action-tonal",
        outline: "border border-rule-strong bg-transparent text-ink",
        text: "bg-transparent text-action",
      },
      size: {
        sm: "h-8 px-3 text-label [&_svg]:size-3.5",
        md: "h-9 px-4 text-label [&_svg]:size-4",
        lg: "h-11 px-5 text-body [&_svg]:size-[18px]",
      },
      icon: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "text", icon: false, className: "px-2" },
      { size: "sm", icon: true, className: "w-8" },
      { size: "md", icon: true, className: "w-9" },
      { size: "lg", icon: true, className: "w-11" },
      { variant: "text", icon: true, className: "text-ink-2" },
    ],
    defaultVariants: {
      variant: "filled",
      size: "md",
      icon: false,
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export type ButtonProps = Omit<
  ComponentProps<typeof ButtonPrimitive>,
  "className"
> & {
  variant?: NonNullable<ButtonVariantProps["variant"]>;
  size?: NonNullable<ButtonVariantProps["size"]>;
  /** Icon-only button. Give it an `aria-label`. */
  icon?: boolean;
  className?: string;
};

export function Button({
  variant,
  size,
  icon,
  className,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, icon }), className)}
      {...props}
    />
  );
}
