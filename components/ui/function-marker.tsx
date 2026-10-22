import { cn } from "@/lib/utils";

export type FunctionIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const fill: Record<FunctionIndex, string> = {
  1: "bg-function-1",
  2: "bg-function-2",
  3: "bg-function-3",
  4: "bg-function-4",
  5: "bg-function-5",
  6: "bg-function-6",
  7: "bg-function-7",
  8: "bg-function-8",
};

/**
 * The per-Function diamond (section 7.3, Contemporary rangoli). It carries the
 * Function's colour, so it stays when ornaments are off. Hidden from assistive
 * technology: the Function's name is always written next to it.
 */
export function FunctionMarker({
  index,
  className,
}: {
  index: FunctionIndex;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-function={index}
      className={cn(
        "inline-block size-2 shrink-0 rotate-45 rounded-[1.5px]",
        fill[index],
        className,
      )}
    />
  );
}

/** Classes for a Function's tinted row band, for tables and lists. */
export const functionBand: Record<FunctionIndex, string> = {
  1: "bg-function-1/10",
  2: "bg-function-2/10",
  3: "bg-function-3/10",
  4: "bg-function-4/10",
  5: "bg-function-5/10",
  6: "bg-function-6/10",
  7: "bg-function-7/10",
  8: "bg-function-8/10",
};
