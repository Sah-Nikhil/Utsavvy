"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Plus, Search } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORY_PLURALS, isVendorCategory } from "./cards";
import { VendorCard } from "./VendorCard";

/*
 * "Find Vendors" on a Vendor checklist Entry (IMPLEMENTATION_PLAN.md section
 * 2, v1): the shared Vendors Utsavvy knows for the Entry's category in the
 * Event's city, priced for its Function. "Add to Canvas" shortlists one and
 * links it to this Entry. Outside Jaipur there are none yet, so it points to
 * Chat web search instead. Only Members who can change the plan see it.
 */

const HOUR = 60 * 60 * 1000;

export function FindVendors({
  eventId,
  entryId,
  entryName,
  category,
  functionKey,
}: {
  eventId: Id<"events">;
  entryId: Id<"entries">;
  /** The Entry as Members read it: "Caterer", "Venue". */
  entryName: string;
  category: string;
  functionKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [asOf] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const found = useQuery(
    api.vendors.findKnown,
    open ? { eventId, category, functionKey, asOf } : "skip",
  );
  const shortlist = useMutation(api.vendors.shortlist);
  const [adding, setAdding] = useState<Id<"vendors"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isVendorCategory(category)) return null;
  const plural = CATEGORY_PLURALS[category];

  async function add(vendorId: Id<"vendors">) {
    setAdding(vendorId);
    setError(null);
    try {
      await shortlist({
        eventId,
        vendorId,
        checklistEntryId: entryId,
        functionKey,
      });
    } catch (e) {
      setError(errorMessage(e, "Couldn't add that Vendor. Try again."));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`Find Vendors for ${entryName}`}
            title={`Find Vendors for ${entryName}`}
            className="state-layer inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-ink-3 focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-3.5"
          />
        }
      >
        <Search aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="right"
        title={`Find Vendors: ${entryName}`}
        description={
          found?.city
            ? `${plural[0]!.toUpperCase()}${plural.slice(1)} Utsavvy knows in ${found.city}`
            : undefined
        }
        className="sm:w-[min(26rem,100vw)]"
      >
        {found === undefined ? (
          <div
            aria-hidden
            className="h-64 animate-pulse rounded-md bg-surface-sunk"
          />
        ) : found.vendors.length === 0 ? (
          <p role="status" className="text-body text-ink-2">
            {found.city && found.city.toLowerCase() !== "jaipur"
              ? `Utsavvy has no Vendors in ${found.city} yet; its Vendors are a hand-checked set in Jaipur.`
              : `Utsavvy knows no ${plural} here that fit yet.`}{" "}
            Ask Utsavvy in the Chat to look them up with web search.
          </p>
        ) : (
          <ul aria-label={`Known ${plural}`} className="grid gap-3">
            {found.vendors.map((view) => {
              const linked =
                view.eventLayer?.links.some(
                  (l) => l.checklistEntryId === entryId,
                ) ?? false;
              return (
                <li key={view.vendor._id}>
                  <VendorCard
                    vendor={view}
                    eventLayer={view.eventLayer}
                    city={found.city}
                    actions={
                      linked ? (
                        <span className="inline-flex items-center gap-1 text-label font-medium text-ink-2">
                          <Check aria-hidden className="size-4" />
                          Linked to {entryName}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="tonal"
                          aria-label={`Add to Canvas: ${view.vendor.name}`}
                          disabled={adding !== null}
                          onClick={() => void add(view.vendor._id)}
                        >
                          <Plus aria-hidden />
                          {adding === view.vendor._id
                            ? "Adding…"
                            : "Add to Canvas"}
                        </Button>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-caption text-warn">
            {error}
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
