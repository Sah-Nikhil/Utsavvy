"use client";

import { useMutation } from "convex/react";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BriefError, useBriefCall } from "./shared";

/**
 * "Make my plan" and "Plan at my budget anyway" (S14): starts the first plan
 * from the Brief, and with `belowMinimum` plans at the budget anyway, every
 * Entry below its usual range. The plan's progress shows in the Chat; a second
 * tap, by anyone, finds it already started.
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
  const make = useMutation(api.plan.make);
  const call = useBriefCall(() => make({ eventId, belowMinimum }));
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        variant={variant}
        data-make-plan
        disabled={call.busy}
        aria-busy={call.busy || undefined}
        onClick={() => void call.run()}
      >
        {call.busy ? (
          <LoaderCircle
            aria-hidden
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ) : null}
        {children}
      </Button>
      <BriefError>{call.error}</BriefError>
    </div>
  );
}
