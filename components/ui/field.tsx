"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * A text field is a label, a control, an optional description and an error.
 * Base UI wires the ids (label `for`, aria-describedby) and the validity state.
 */

const controlClass = cn(
  "w-full min-w-0 rounded-sm border border-rule-strong bg-surface px-3 text-body text-ink",
  "transition-[border-color,box-shadow] duration-(--dur-feedback) ease-standard",
  "placeholder:text-ink-3",
  "hover:border-ink-2",
  "focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
  "data-invalid:border-warn data-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--warn)]",
  "disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:text-ink-3",
);

export type InputProps = Omit<
  ComponentProps<typeof InputPrimitive>,
  "className"
> & {
  className?: string;
};

export function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(controlClass, "h-10", className)}
      {...props}
    />
  );
}

export type TextareaProps = Omit<ComponentProps<"textarea">, "className"> & {
  className?: string;
};

export function Textarea({ className, rows = 3, ...props }: TextareaProps) {
  return (
    <FieldPrimitive.Control
      data-slot="textarea"
      render={<textarea rows={rows} />}
      className={cn(
        controlClass,
        "min-h-20 resize-y py-2 leading-normal",
        className,
      )}
      {...(props as ComponentProps<typeof FieldPrimitive.Control>)}
    />
  );
}

export type FieldRootProps = Omit<
  ComponentProps<typeof FieldPrimitive.Root>,
  "className"
> & {
  className?: string;
};

export function FieldRoot({ className, ...props }: FieldRootProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("grid gap-1.5", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: Omit<ComponentProps<typeof FieldPrimitive.Label>, "className"> & {
  className?: string;
}) {
  return (
    <FieldPrimitive.Label
      className={cn(
        "text-label font-semibold text-ink data-disabled:text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: Omit<ComponentProps<typeof FieldPrimitive.Description>, "className"> & {
  className?: string;
}) {
  return (
    <FieldPrimitive.Description
      className={cn("text-caption text-ink-2", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  ...props
}: Omit<ComponentProps<typeof FieldPrimitive.Error>, "className"> & {
  className?: string;
}) {
  return (
    <FieldPrimitive.Error
      className={cn("text-caption font-medium text-warn", className)}
      {...props}
    />
  );
}

export type FieldProps = {
  label: ReactNode;
  description?: ReactNode;
  /** When set, the field is marked invalid and this message is shown. */
  error?: ReactNode;
  disabled?: boolean;
  name?: string;
  className?: string;
  /** The control: <Input />, <Textarea /> or another Base UI field control. */
  children: ReactNode;
};

/** Label + control + description + error, in that reading order. */
export function Field({
  label,
  description,
  error,
  disabled,
  name,
  className,
  children,
}: FieldProps) {
  return (
    <FieldRoot
      invalid={error ? true : undefined}
      disabled={disabled}
      name={name}
      className={className}
    >
      <FieldLabel>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError match>{error}</FieldError> : null}
    </FieldRoot>
  );
}
