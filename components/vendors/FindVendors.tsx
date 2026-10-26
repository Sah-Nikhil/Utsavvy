"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Plus, Search } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { inlineControlClass } from "@/components/items/budget/parts";
import {
  CATEGORY_PLURALS,
  functionChoice,
  isVendorCategory,
  pricingNote,
  type FunctionOption,
} from "./cards";
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
  functionKeys,
  functions,
}: {
  eventId: Id<"events">;
  entryId: Id<"entries">;
  /** The Entry as Members read it: "Caterer", "Venue". */
  entryName: string;
  category: string;
  /** The Functions the Entry serves. */
  functionKeys: string[];
  /** The Event's Functions, for their names. */
  functions: FunctionOption[];
}) {
  const [open, setOpen] = useState(false);
  const choice = functionChoice(functionKeys, functions);
  // Several Functions: Event-wide until the Member picks one (Review of #122).
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const functionKey = picked === undefined ? choice.initial : picked;
  const functionName =
    choice.options.find((fn) => fn.key === functionKey)?.name ?? null;
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
        {choice.options.length > 1 ? (
          <label className="mb-2 flex items-center gap-2 text-label text-ink-2">
            Compare for
            <select
              value={functionKey ?? ""}
              onChange={(e) => setPicked(e.target.value || null)}
              className={inlineControlClass("w-auto pr-6")}
            >
              <option value="">Event-wide</option>
              {choice.options.map((fn) => (
                <option key={fn.key} value={fn.key}>
                  {fn.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {found &&
        found.vendors.length > 0 &&
        pricingNote(functionName, found.guests, choice.options.length) ? (
          <p data-pricing-note className="mb-3 text-caption text-ink-3">
            {pricingNote(functionName, found.guests, choice.options.length)}
          </p>
        ) : null}
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
