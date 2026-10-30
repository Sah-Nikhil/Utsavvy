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
import { cn } from "@/lib/utils";
import {
  CATEGORY_PLURALS,
  functionChoice,
  isVendorCategory,
  pricingNote,
  type FunctionOption,
} from "./cards";
import { HandTypedVendorForm } from "./HandTypedVendorForm";
import { VendorCard } from "./VendorCard";

/*
 * "Find Vendors" on a Vendor checklist Entry (IMPLEMENTATION_PLAN.md section
 * 2, v1): the shared Vendors Utsavvy knows for the Entry's category in the
 * Event's city, priced for its Function. "Add to Canvas" shortlists one and
 * links it to this Entry. Outside Jaipur there are none yet, so it points to
 * Chat web search instead. Only Members who can change the plan see it.
 *
 * "Type it in" (X7) adds a Vendor with no website, such as the family's usual
 * caterer, by name, phone and area. It is private to the Event and is linked
 * to this Entry the same way. A free-label Entry ("Mehendi artist") has no
 * known Vendors, so its sheet offers only that.
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
  /** The Entry as Members read it: "Caterer", "Venue", or its free label. */
  entryName: string;
  /** A fixed category key, or the Entry's free label. */
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
  const known = isVendorCategory(category);
  const found = useQuery(
    api.vendors.findKnown,
    open && known ? { eventId, category, functionKey, asOf } : "skip",
  );
  const shortlist = useMutation(api.vendors.shortlist);
  const addHandTyped = useMutation(api.vendors.addHandTyped);
  const [adding, setAdding] = useState<Id<"vendors"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typedIn, setTypedIn] = useState<string | null>(null);

  const plural = known ? CATEGORY_PLURALS[category] : null;

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
          plural && found?.city
            ? `${plural[0]!.toUpperCase()}${plural.slice(1)} Utsavvy knows in ${found.city}`
            : plural
              ? undefined
              : "Type in a Vendor you already know"
        }
        className="sm:w-[min(26rem,100vw)]"
      >
        {known && choice.options.length > 1 ? (
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
        {!known ? null : found === undefined ? (
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
        <section
          aria-labelledby={`type-it-in-${entryId}`}
          className={cn(
            "mt-5 grid gap-3 rounded-lg bg-surface-sunk p-4",
            known ? "" : "mt-0",
          )}
        >
          <div className="grid gap-0.5">
            <h3
              id={`type-it-in-${entryId}`}
              className="text-title font-semibold text-ink"
            >
              No website? Type it in
            </h3>
            <p className="text-caption text-ink-2">
              For a Vendor you already know, such as the family&rsquo;s usual{" "}
              {entryName.toLowerCase()}. Only this Event sees it, and only what
              you type is kept.
            </p>
          </div>
          <HandTypedVendorForm
            idPrefix={`add-${entryId}`}
            categoryLabel={entryName}
            submitLabel="Add to Canvas"
            busyLabel="Adding…"
            onSubmit={async (values) => {
              setTypedIn(null);
              await addHandTyped({
                eventId,
                checklistEntryId: entryId,
                ...values,
              });
              setTypedIn(values.name);
            }}
          />
          {typedIn ? (
            <p
              role="status"
              className="inline-flex items-center gap-1 text-label font-medium text-ink-2"
            >
              <Check aria-hidden className="size-4" />
              Added {typedIn} to the Canvas, linked to {entryName}.
            </p>
          ) : null}
        </section>
      </SheetContent>
    </Sheet>
  );
}
