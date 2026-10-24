"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * "Make my plan" and "Plan at my budget anyway". The hook S14 (the first plan)
 * fills: it starts the plan from the Brief, and with `belowMinimum` plans at
 * the budget anyway, every Entry below its usual range. Until then it says so.
 */
export function MakePlanButton({
  eventId,
  belowMinimum = false,
  variant = "filled",
  children,
}: {
  eventId: Id<"events">;
  belowMinimum?: boolean;
  variant?: "filled" | "outline";
  children: ReactNode;
}) {
  const [note, setNote] = useState<string | null>(null);
  void eventId;
  void belowMinimum;
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        variant={variant}
        data-make-plan
        onClick={() => setNote("The first plan arrives with S14.")}
      >
        {children}
      </Button>
      {note ? (
        <p role="status" className="text-caption text-ink-3">
          {note}
        </p>
      ) : null}
    </div>
  );
}
