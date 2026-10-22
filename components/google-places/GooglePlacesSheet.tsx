"use client";

import { createContext, useContext, type ReactNode } from "react";

// S20 (the Google places sheet) owns this file. Contract stubs: the provider
// passes its children through, the sheet and button render nothing, and
// `open` is a no-op until S20 builds the sheet on Google's Places UI Kit (ADR 0011).

export type GooglePlacesSheetApi = {
  /** Opens the full-screen sheet, optionally on one saved place. */
  open(opts?: { placeId?: string }): void;
};

const noop: GooglePlacesSheetApi = { open: () => {} };
const GooglePlacesContext = createContext<GooglePlacesSheetApi>(noop);

export function GooglePlacesProvider({ children }: { children: ReactNode }) {
  return (
    <GooglePlacesContext.Provider value={noop}>
      {children}
    </GooglePlacesContext.Provider>
  );
}

export function useGooglePlacesSheet(): GooglePlacesSheetApi {
  return useContext(GooglePlacesContext);
}

/** Mounted once at the top level of the workspace. */
export function GooglePlacesSheet() {
  return null;
}

/** Mounted in the workspace header. */
export function GooglePlacesButton() {
  return null;
}
