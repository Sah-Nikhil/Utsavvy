"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Selection } from "@/lib/types/canvas";

/*
 * "Show me that Item", for anything in the workspace that names one (a
 * reference in the Chat, a history row). On a phone it follows the person's
 * mobile pointing: the Canvas tab with the Item highlighted and "Back to
 * Chat", or a preview sheet over the Chat. On desktop it selects the Item.
 * Showing nothing (null) clears the selection on desktop and does nothing on a
 * phone.
 */

const ShowItemContext = createContext<(target: Selection) => void>(() => {});

export function ShowItemProvider({
  show,
  children,
}: {
  show: (target: Selection) => void;
  children: ReactNode;
}) {
  return (
    <ShowItemContext.Provider value={show}>{children}</ShowItemContext.Provider>
  );
}

/** Shows an Item the way this person and this screen want it shown. */
export function useShowItem(): (target: Selection) => void {
  return useContext(ShowItemContext);
}

/** The width where the workspace puts the Canvas beside the Chat (Tailwind's `md`). */
export const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the workspace is in its desktop layout; null before the browser has said (server render). */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null,
  );
}
