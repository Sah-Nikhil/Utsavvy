"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Link2, Store } from "lucide-react";
import { useState } from "react";
import { useCanvasItem } from "@/components/canvas/CanvasItemContext";
import { ItemFrame } from "@/components/items/ItemFrame";
import { LinkQuotes } from "@/components/quotes/LinkQuotes";
import type { ItemComponentProps } from "@/components/items/registry";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import {
  LINK_STATUSES,
  LINK_STATUS_LABELS,
  type LinkStatus,
} from "@/components/vendors/cards";
import { VendorCard } from "@/components/vendors/VendorCard";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/*
 * A Shortlisted Vendor on the Canvas (S9): the shared Vendor card plus this
 * Event's private layer, one status per linked checklist Entry ("Sangeet:
 * Quoted · Wedding: Booked") and its Quotes (S12: add one, see how it adds
 * up, and once Booked say yes to using it as the line's amount). Booking a
 * link marks its Entry done. Another Event that shortlisted the same Vendor
 * never sees these.
 */

const HOUR = 60 * 60 * 1000;

export function ShortlistedVendorItem({
  item,
}: ItemComponentProps<"shortlistedVendor">) {
  const canvas = useCanvasItem();
  const [asOf] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const data = useQuery(api.vendors.forItem, { itemId: item._id, asOf });
  const setStatus = useMutation(api.vendors.setLinkStatus);
  const link = useMutation(api.vendors.link);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const view = data?.view ?? null;
  const canManage = data?.canManage ?? false;
  const title = view?.card.vendor.name ?? "Shortlisted Vendor";

  return (
    <ItemFrame
      kind="Shortlisted Vendor"
      icon={<Store />}
      title={title}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      selected={canvas?.selected}
      bodyClassName="grid gap-3"
      actions={
        canManage && data && data.linkable.length > 0 ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="text"
                  size="sm"
                  icon
                  aria-label="Link to an Entry"
                  disabled={busy}
                />
              }
            >
              <Link2 />
            </MenuTrigger>
            <MenuContent align="end">
              {data.linkable.map((entry) => (
                <MenuItem
                  key={entry._id}
                  onClick={() =>
                    void run(() =>
                      link({ itemId: item._id, checklistEntryId: entry._id }),
                    )
                  }
                >
                  {entry.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null
      }
    >
      {data === undefined ? (
        <div
          aria-hidden
          className="h-64 animate-pulse rounded-sm bg-surface-sunk"
        />
      ) : view === null ? (
        <p className="text-label text-ink-3">
          This Vendor is no longer listed.
        </p>
      ) : (
        <>
          <section aria-label="Checklist links" className="grid gap-1.5">
            {view.links.length === 0 ? (
              <p className="text-caption text-ink-3">
                Not linked to a checklist Entry yet.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {view.links.map((l) => (
                  <li
                    key={l._id}
                    data-status={l.status}
                    className="grid gap-1.5"
                  >
                    <StatusMenu
                      label={l.entryLabel}
                      status={l.status}
                      disabled={!canManage || busy}
                      onPick={(status) =>
                        void run(() => setStatus({ linkId: l._id, status }))
                      }
                    />
                    {l.status === "dropped" ? null : (
                      <LinkQuotes
                        linkId={l._id}
                        vendorName={title}
                        entryLabel={l.entryLabel}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <VendorCard
            vendor={view.card}
            eventLayer={null}
            city={data.city}
            className="border-0 bg-transparent p-0"
          />
        </>
      )}
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}
    </ItemFrame>
  );
}

function StatusMenu({
  label,
  status,
  disabled,
  onPick,
}: {
  label: string;
  status: LinkStatus;
  disabled: boolean;
  onPick: (status: LinkStatus) => void;
}) {
  const chip = cn(
    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-caption font-medium",
    status === "booked"
      ? "border-booked bg-booked-soft text-ink"
      : status === "dropped"
        ? "border-rule text-ink-3 line-through"
        : "border-rule-strong text-ink",
  );
  const text = `${label}: ${LINK_STATUS_LABELS[status]}`;
  if (disabled) return <span className={chip}>{text}</span>;
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`Status for ${label}: ${LINK_STATUS_LABELS[status]}`}
            className={cn(
              chip,
              "focus-visible:outline-2 focus-visible:outline-focus",
            )}
          />
        }
      >
        {text}
        <ChevronDown aria-hidden className="size-3.5" />
      </MenuTrigger>
      <MenuContent align="start">
        {LINK_STATUSES.map((option) => (
          <MenuItem
            key={option}
            disabled={option === status}
            onClick={() => onPick(option)}
          >
            {LINK_STATUS_LABELS[option]}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
