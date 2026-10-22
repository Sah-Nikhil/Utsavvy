"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Selection } from "@/lib/types/canvas";

// The person's current selection on the Canvas: an Item, an Entry or a
// passage, or null. The Canvas (S2) sets it; the Chat, Comments, history and
// Compact mode read it to know what "this" means.

const SelectionContext = createContext<Selection>(null);
const SetSelectionContext = createContext<(selection: Selection) => void>(
  () => {},
);

/** Wraps the workspace so every panel shares one selection. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null);
  return (
    <SetSelectionContext.Provider value={setSelection}>
      <SelectionContext.Provider value={selection}>
        {children}
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
