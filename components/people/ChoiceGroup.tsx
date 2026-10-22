"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type Choice<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

/**
 * A labelled set of mutually exclusive choices, each a small card with a
 * radio dot. Keyboard: Tab into the group, arrows to move.
 */
export function ChoiceGroup<T extends string>({
  label,
  description,
  choices,
  value,
  onChange,
  disabled,
  columns = 2,
}: {
  label: string;
  description?: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5">
        <span id={labelId} className="text-label font-semibold text-ink">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-caption text-ink-2">
            {description}
          </span>
        ) : null}
      </div>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        value={value}
        onValueChange={(next) => onChange(next as T)}
        disabled={disabled}
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              "state-layer flex cursor-pointer items-start gap-2.5 rounded-sm border border-rule-strong bg-surface px-3 py-2.5",
              "transition-[border-color,background-color] duration-(--dur-feedback) ease-standard",
              "has-data-checked:border-action has-data-checked:bg-selected",
              "has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60",
            )}
          >
            <Radio.Root
              value={choice.value}
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule-strong bg-surface",
                "data-checked:border-action",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              <Radio.Indicator className="size-2 rounded-full bg-action" />
            </Radio.Root>
            <span className="grid gap-0.5">
              <span className="text-label font-semibold text-ink">
                {choice.label}
              </span>
              {choice.description ? (
                <span className="text-caption text-ink-2">
                  {choice.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
