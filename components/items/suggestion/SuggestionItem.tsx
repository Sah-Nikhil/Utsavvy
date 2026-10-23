"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Lightbulb } from "lucide-react";
import { useState } from "react";
import { useCanvasItem } from "@/components/canvas/CanvasItemContext";
import { EstimateLine } from "@/components/items/budget/parts";
import { ItemFrame } from "@/components/items/ItemFrame";
import type { ItemComponentProps } from "@/components/items/registry";
import { errorMessage } from "@/components/people/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";

/*
 * A Suggestion (S4): the Assistant's idea for the Event or one Function, with
 * its Estimate when it costs money. It isn't in the Budget until a Member taps
 * "Add to plan", which adds its budget Entry (same Estimate, no new research)
 * and a Timeline Entry. "Not for us" sets it aside.
 */

export function SuggestionItem({ item }: ItemComponentProps<"suggestion">) {
  const canvas = useCanvasItem();
  const addToPlan = useMutation(api.suggestions.addToPlan);
  const dismiss = useMutation(api.suggestions.dismiss);
  const canvasView = useQuery(api.canvas.get, { eventId: item.eventId });
  const canEdit = canvasView !== undefined && canvasView.me.role !== "viewer";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = item;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const status =
    data.status === "added" ? (
      <Badge tone="booked">
        <Check aria-hidden strokeWidth={2.5} />
        In the plan
      </Badge>
    ) : data.status === "dismissed" ? (
      <Badge tone="neutral">Not for us</Badge>
    ) : null;

  return (
    <ItemFrame
      kind="Suggestion"
      icon={<Lightbulb />}
      title={data.title}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
    >
      <div className="grid gap-2">
        {data.status !== "dismissed" ? (
          <p className={cn("text-label text-ink-2", scriptClass(data.body))}>
            {data.body}
          </p>
        ) : null}
        {data.estimate ? (
          <EstimateLine estimate={data.estimate} amount />
        ) : data.costCategory ? (
          <span className="text-caption text-ink-3">No Estimate yet</span>
        ) : null}
        {data.status === "open" ? (
          <p className="text-caption text-ink-3">
            Not in the Budget until it&apos;s added.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-caption text-warn">
            {error}
          </p>
        ) : null}
        {status ? (
          <div>{status}</div>
        ) : canEdit ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => addToPlan({ itemId: item._id }))}
            >
              Add to plan
            </Button>
            <Button
              variant="text"
              size="sm"
              disabled={busy}
              onClick={() => run(() => dismiss({ itemId: item._id }))}
            >
              Not for us
            </Button>
          </div>
        ) : null}
      </div>
    </ItemFrame>
  );
}
