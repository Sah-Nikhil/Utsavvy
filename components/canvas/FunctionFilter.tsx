"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Chip } from "@/components/ui/chip";
import type { FunctionIndex } from "@/components/ui/function-marker";

/*
 * The Function filter (IMPLEMENTATION_PLAN.md section 7.3): pick one Function
 * and the Canvas dims every Item that isn't for it. Event-wide Items (no
 * Function) stay lit, since they are for every Function.
 */

export type CanvasFunction = { key: string; name: string };

type FunctionFilter = {
  /** The Function picked, or null for all of them. */
  functionKey: string | null;
  setFunctionKey: (key: string | null) => void;
  functions: readonly CanvasFunction[];
  /** The Function's colour, 1 to 8, in the Event's order. */
  indexOf: (key: string) => FunctionIndex | undefined;
  /** Whether the filter dims an Item with this `functionKey`. */
  dims: (itemFunctionKey: string | null) => boolean;
};

const FunctionFilterContext = createContext<FunctionFilter>({
  functionKey: null,
  setFunctionKey: () => {},
  functions: [],
  indexOf: () => undefined,
  dims: () => false,
});

export function FunctionFilterProvider({
  functions,
  children,
}: {
  functions: readonly CanvasFunction[];
  children: ReactNode;
}) {
  const [picked, setFunctionKey] = useState<string | null>(null);
  // A Function removed since it was picked clears the filter.
  const functionKey =
    picked !== null && functions.some((fn) => fn.key === picked)
      ? picked
      : null;
  const value = useMemo<FunctionFilter>(() => {
    const order = new Map(functions.map((fn, i) => [fn.key, i]));
    return {
      functionKey,
      setFunctionKey,
      functions,
      indexOf: (key) => {
        const i = order.get(key);
        return i === undefined ? undefined : (((i % 8) + 1) as FunctionIndex);
      },
      dims: (itemFunctionKey) =>
        functionKey !== null &&
        itemFunctionKey !== null &&
        itemFunctionKey !== functionKey,
    };
  }, [functionKey, functions]);
  return (
    <FunctionFilterContext.Provider value={value}>
      {children}
    </FunctionFilterContext.Provider>
  );
}

/** The Canvas's Function filter: the picked Function and whether an Item is dimmed. */
export function useFunctionFilter(): FunctionFilter {
  return useContext(FunctionFilterContext);
}

/** One chip per Function; picking the picked one again shows them all. */
export function FunctionFilterChips() {
  const { functions, functionKey, setFunctionKey, indexOf } =
    useFunctionFilter();
  if (functions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Show one Function"
      className="flex flex-wrap items-center gap-1.5"
    >
      {functions.map((fn) => (
        <Chip
          key={fn.key}
          selected={functionKey === fn.key}
          onSelectedChange={(on) => setFunctionKey(on ? fn.key : null)}
          functionIndex={indexOf(fn.key)}
          className="bg-surface"
        >
          {fn.name}
        </Chip>
      ))}
    </div>
  );
}
