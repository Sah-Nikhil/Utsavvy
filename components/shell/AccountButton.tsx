"use client";

import { UserButton } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  applyOrnaments,
  ornamentsMenuLabel,
  writeOrnaments,
} from "@/lib/ornaments";

/*
 * Clerk's account menu with Utsavvy's personal display settings added as
 * custom actions. Used in SiteChrome and the workspace header. The Ornaments
 * state is read from <html>, where app/layout.tsx's inline script sets it before
 * first paint, so the label is right from the first open.
 */

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ornaments"],
  });
  return () => observer.disconnect();
}

const ornamentsOn = () => document.documentElement.dataset.ornaments !== "off";

export function AccountButton() {
  const on = useSyncExternalStore(subscribe, ornamentsOn, () => true);

  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action
          label={ornamentsMenuLabel(on)}
          labelIcon={<Sparkles aria-hidden className="size-4" />}
          onClick={() => {
            applyOrnaments(document.documentElement, !on);
            writeOrnaments(() => window.localStorage, !on);
          }}
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
