"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOOK,
  LOOK_STORAGE_KEY,
  LOOKS,
  isLook,
  type Look,
} from "@/lib/looks";
import { cn } from "@/lib/utils";

/*
 * Development-only switch between the candidate looks (IMPLEMENTATION_PLAN.md
 * section 7.4). It sets html[data-look] and remembers the pick in localStorage;
 * app/layout.tsx restores it before first paint. Removed with the losing look
 * before the contract PR merges.
 */

const NAMES: Record<Look, { short: string; long: string }> = {
  bd: { short: "B+D", long: "Ivory ledger with Function colours" },
  b: { short: "B", long: "Ivory ledger" },
  d: { short: "D", long: "Contemporary rangoli" },
};

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-look"],
  });
  return () => observer.disconnect();
}

function currentLook(): Look {
  const value = document.documentElement.dataset.look;
  return isLook(value) ? value : DEFAULT_LOOK;
}

function setLook(look: Look) {
  document.documentElement.dataset.look = look;
  try {
    localStorage.setItem(LOOK_STORAGE_KEY, look);
  } catch {
    // Storage can be unavailable (private windows); the switch still works for this page.
  }
}

export function LookSwitch() {
  if (process.env.NODE_ENV !== "development") return null;
  return <LookSwitchControl />;
}

function LookSwitchControl() {
  const look = useSyncExternalStore(subscribe, currentLook, () => DEFAULT_LOOK);

  return (
    <fieldset
      className={cn(
        "fixed bottom-16 left-3 z-[60] m-0 flex items-center gap-1 rounded-full border border-item-line bg-surface-raised/95 p-1 pl-3 shadow-overlay backdrop-blur-sm",
        "text-caption text-ink-2",
      )}
    >
      <legend className="sr-only">Look (development only)</legend>
      <span aria-hidden className="pr-1 font-semibold text-ink-3">
        Look
      </span>
      {LOOKS.map((value) => (
        <label
          key={value}
          title={NAMES[value].long}
          className={cn(
            "state-layer relative inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2.5 font-semibold",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus",
            look === value ? "bg-action text-on-action" : "text-ink-2",
          )}
        >
          <input
            type="radio"
            name="utsavvy-look"
            value={value}
            checked={look === value}
            onChange={() => setLook(value)}
            className="sr-only"
          />
          {NAMES[value].short}
          <span className="sr-only">, {NAMES[value].long}</span>
        </label>
      ))}
    </fieldset>
  );
}
