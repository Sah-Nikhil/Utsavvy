"use client";

import { createContext, useContext, type ReactNode } from "react";

// S21 (Browse ideas on Pinterest) owns this file. Contract stubs: no-ops until
// S21 shows the curated boards through Pinterest's board widget (ADR 0014).

export type PinterestIdeasApi = {
  /** Opens the sheet, optionally on the boards for one Function. */
  open(opts?: { functionKey?: string }): void;
};

const noop: PinterestIdeasApi = { open: () => {} };
const PinterestIdeasContext = createContext<PinterestIdeasApi>(noop);

export function PinterestIdeasProvider({ children }: { children: ReactNode }) {
  return (
    <PinterestIdeasContext.Provider value={noop}>
      {children}
    </PinterestIdeasContext.Provider>
  );
}

export function usePinterestIdeas(): PinterestIdeasApi {
  return useContext(PinterestIdeasContext);
}

export function PinterestIdeasSheet() {
  return null;
}

/** "Browse ideas on Pinterest", in the Add Inspiration panel. */
export function PinterestIdeasButton() {
  return null;
}
