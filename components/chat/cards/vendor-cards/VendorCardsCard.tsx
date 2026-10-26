"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import type { ChatCardProps } from "@/components/chat/cards/registry";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { CATEGORY_PLURALS, parseVendorCards } from "@/components/vendors/cards";
import { VendorCard } from "@/components/vendors/VendorCard";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/*
 * The Vendor cards in a reply (S9): the starter-set Vendors `findVendors`
 * found, in its order, each with this Event's own layer. "Add to Canvas"
 * shortlists one onto the Vendors Section and links it to the checklist Entry
 * for its category; the Assistant shortlists only when a Member asked.
 */

const HOUR = 60 * 60 * 1000;

export function VendorCardsCard({ eventId, cardId }: ChatCardProps) {
  const card = parseVendorCards(cardId);
  // Hour-rounded, so the query stays cached while the card is open.
  const [asOf] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const data = useQuery(
    api.vendors.cards,
    card
      ? {
          eventId,
          vendorIds: card.vendorIds,
          functionKey: card.functionKey,
          asOf,
        }
      : "skip",
  );
  const shortlist = useMutation(api.vendors.shortlist);
  const [adding, setAdding] = useState<Id<"vendors"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (card === null) return null;

  async function add(vendorId: Id<"vendors">) {
    setAdding(vendorId);
    setError(null);
    try {
      await shortlist({
        eventId,
        vendorId,
        checklistEntryId: null,
        functionKey: card!.functionKey,
      });
    } catch (e) {
      setError(errorMessage(e, "Couldn't add that Vendor. Try again."));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-caption text-ink-3">
        {data?.canManage === false
          ? "Members can add these to the Canvas."
          : "Hand-checked Jaipur Vendors. Add one to shortlist it on the Canvas."}
      </p>
      <ol
        aria-label={`Vendor cards: ${CATEGORY_PLURALS[card.category]}`}
        className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]"
      >
        {(data?.vendors ?? []).map((view) => {
          const added = view.eventLayer !== null;
          const name = view.vendor.name;
          return (
            <li
              key={view.vendor._id}
              className="w-72 max-w-[85vw] shrink-0 snap-start"
            >
              <VendorCard
                vendor={view}
                eventLayer={view.eventLayer}
                city={data?.city ?? null}
                className="h-full"
                actions={
                  added ? (
                    <span className="inline-flex items-center gap-1 text-label font-medium text-ink-2">
                      <Check aria-hidden className="size-4" />
                      On the Canvas
                    </span>
                  ) : data?.canManage ? (
                    <Button
                      size="sm"
                      variant="tonal"
                      aria-label={`Add to Canvas: ${name}`}
                      disabled={adding !== null}
                      onClick={() => void add(view.vendor._id)}
                    >
                      <Plus aria-hidden />
                      {adding === view.vendor._id ? "Adding…" : "Add to Canvas"}
                    </Button>
                  ) : null
                }
              />
            </li>
          );
        })}
        {data === undefined
          ? card.vendorIds.map((id) => (
              <li
                key={id}
                aria-hidden
                className="h-80 w-72 max-w-[85vw] shrink-0 animate-pulse rounded-md bg-surface-sunk"
              />
            ))
          : null}
      </ol>
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
