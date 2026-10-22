/**
 * The personal "Ornaments" display setting. Look D draws purely decorative
 * ornaments (the Section corner pieces); a Member can turn them off on this
 * device. It is view state, so it lives in localStorage, not in Convex, and
 * leaves no history. Off is marked as html[data-ornaments="off"], which the
 * `ornaments-off:` variant in app/globals.css reads. Ornaments are on by default.
 */

export const ORNAMENTS_STORAGE_KEY = "utsavvy.ornaments";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RootLike = { dataset: Record<string, string | undefined> };
/**
 * The storage, or a function that reaches it. Pass `() => window.localStorage`:
 * in blocked-storage contexts the getter itself throws, so it must be called
 * inside the catch below.
 */
type StorageSource = StorageLike | undefined | (() => StorageLike | undefined);

function reach(source: StorageSource): StorageLike | undefined {
  return typeof source === "function" ? source() : source;
}

/** Whether this device shows ornaments. On unless the device stored "off". */
export function readOrnaments(storage: StorageSource): boolean {
  try {
    return reach(storage)?.getItem(ORNAMENTS_STORAGE_KEY) !== "off";
  } catch {
    // Storage can be blocked (private windows, strict cookie settings).
    return true;
  }
}

/** Remembers the choice on this device; on is the default, so it clears the key. */
export function writeOrnaments(storage: StorageSource, on: boolean) {
  try {
    const store = reach(storage);
    if (on) store?.removeItem(ORNAMENTS_STORAGE_KEY);
    else store?.setItem(ORNAMENTS_STORAGE_KEY, "off");
  } catch {
    // The setting still applies to this page.
  }
}

/** Shows or hides ornaments on the page by marking <html>. */
export function applyOrnaments(root: RootLike, on: boolean) {
  if (on) delete root.dataset.ornaments;
  else root.dataset.ornaments = "off";
}

/** The account menu item's label: the action a click takes. */
export function ornamentsMenuLabel(on: boolean): string {
  return on ? "Turn ornaments off" : "Turn ornaments on";
}

/**
 * Inline script for <head> that marks <html> before first paint, so a device
 * with ornaments off never flashes them on reload. The CSP allows it through
 * `script-src 'unsafe-inline'` (lib/csp/policy.ts).
 */
export const ornamentsScript = `try{if(localStorage.getItem(${JSON.stringify(ORNAMENTS_STORAGE_KEY)})==="off")document.documentElement.dataset.ornaments="off"}catch(e){}`;
