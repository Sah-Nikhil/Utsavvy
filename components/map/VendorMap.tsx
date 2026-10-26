"use client";

import { Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Id } from "@/convex/_generated/dataModel";
import { VendorMapPanel } from "./VendorMapPanel";

/*
 * S15: the Vendor map (IMPLEMENTATION_PLAN.md section 7.5). Section UI, not an
 * Item: it stores nothing of its own. The Vendors Section's label row shows
 * this button, which opens the map full screen with the list beside it. The
 * map loads only when opened, so the Canvas never pays for it.
 */

export type VendorMapProps = {
  eventId: string;
};

export function VendorMap({ eventId }: VendorMapProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="tonal"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <MapIcon aria-hidden />
        Map
      </Button>
      <SheetContent
        side="full"
        title="Vendors on the map"
        description="Shortlisted Vendors by status, other Vendors in the city faint."
        bodyClassName="p-0"
      >
        {open ? <VendorMapPanel eventId={eventId as Id<"events">} /> : null}
      </SheetContent>
    </Sheet>
  );
}
