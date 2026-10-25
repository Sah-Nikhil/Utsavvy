"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Selection } from "@/lib/types/canvas";

// The person's current selection on the Canvas: an Item, an Entry or a
// passage, or null. The Canvas (S2) sets it; the Chat, Comments, history and
// Compact mode read it to know what "this" means.

const SelectionContext = createContext<Selection>(null);
const SetSelectionContext = createContext<(selection: Selection) => void>(
  () => {},
);

/**
 * A request to bring an Item into view on the Canvas. `seq` grows with each
 * request, so asking for the Item that is already selected pans to it again.
 */
export type RevealRequest = { itemId: string; seq: number };

const RevealContext = createContext<RevealRequest | null>(null);
const RequestRevealContext = createContext<(itemId: string) => void>(() => {});

/** Wraps the workspace so every panel shares one selection. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const requestReveal = useCallback(
    (itemId: string) =>
      setReveal((last) => ({ itemId, seq: (last?.seq ?? 0) + 1 })),
    [],
  );
  return (
    <SetSelectionContext.Provider value={setSelection}>
      <SelectionContext.Provider value={selection}>
        <RequestRevealContext.Provider value={requestReveal}>
          <RevealContext.Provider value={reveal}>
            {children}
          </RevealContext.Provider>
        </RequestRevealContext.Provider>
      </SelectionContext.Provider>
    </SetSelectionContext.Provider>
  );
}

/** What is selected now, or null. */
export function useSelection(): Selection {
  return useContext(SelectionContext);
}

/** Changes the selection (the Canvas and Compact mode). */
export function useSetSelection(): (selection: Selection) => void {
  return useContext(SetSelectionContext);
}

/** The latest request to bring an Item into view; the Canvas acts on it. */
export function useRevealRequest(): RevealRequest | null {
  return useContext(RevealContext);
}

/** Asks the Canvas to bring an Item into view if it is out of sight. */
export function useRequestReveal(): (itemId: string) => void {
  return useContext(RequestRevealContext);
}
