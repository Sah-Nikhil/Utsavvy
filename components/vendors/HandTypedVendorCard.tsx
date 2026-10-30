"use client";

import { useMutation } from "convex/react";
import { Pencil, Phone, UserPen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PriceBadge } from "@/components/ui/price-badge";
import { api } from "@/convex/_generated/api";
import type { HandTypedView } from "@/convex/vendors";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryIllustration } from "./CategoryIllustration";
import { HandTypedVendorForm } from "./HandTypedVendorForm";

/*
 * A hand-typed Vendor's card (X7, vendors.md "Adding a Vendor by hand"): only
 * what a Member typed (name, phone, area), labelled as such, plus an Estimate
 * for its category. It never shows Listed prices: a Member records a Quote
 * after talking to the Vendor. It is private to the Event.
 */

const UNIT_LABELS: Record<string, string> = {
  per_plate: "per plate",
  per_person: "per person",
  per_day: "per day",
  per_function: "per Function",
  per_event: "for the whole event",
};

/** Keeps digits and a leading + so the phone number can be dialled. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function HandTypedVendorCard({
  vendor,
  canManage,
  className,
}: {
  vendor: HandTypedView;
  canManage: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const edit = useMutation(api.vendors.editHandTyped);
  const { estimate } = vendor;

  return (
    <article
      aria-label={vendor.name}
      data-hand-typed-vendor
      className={cn("grid gap-3 text-ink", className)}
    >
      <header className="flex items-start gap-3">
        <div className="grid size-14 shrink-0 place-items-center rounded-sm bg-motif-soft">
          <CategoryIllustration category={vendor.vendorCategory ?? ""} />
        </div>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 className="text-title leading-tight font-semibold text-balance">
            {vendor.name}
          </h3>
          <p className="text-label text-ink-2">{vendor.categoryLabel}</p>
          <p className="inline-flex items-center gap-1 text-caption text-ink-3">
            <UserPen aria-hidden className="size-3.5" />
            Typed in by a Member · private to this Event
          </p>
        </div>
        {canManage ? (
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogTrigger
              render={
                <Button
                  variant="text"
                  size="sm"
                  icon
                  aria-label={`Edit ${vendor.name}`}
                />
              }
            >
              <Pencil />
            </DialogTrigger>
            <DialogContent
              title={`Edit ${vendor.name}`}
              description="Only what you type is kept, and only this Event sees it."
            >
              <div className="mt-4">
                <HandTypedVendorForm
                  idPrefix={`edit-${vendor._id}`}
                  categoryLabel={vendor.categoryLabel}
                  initial={{
                    name: vendor.name,
                    phone: vendor.phone,
                    area: vendor.area,
                  }}
                  submitLabel="Save"
                  busyLabel="Saving…"
                  secondary={
                    <DialogClose
                      render={<Button type="button" variant="text" />}
                    >
                      Cancel
                    </DialogClose>
                  }
                  onSubmit={async (values) => {
                    await edit({ privateVendorId: vendor._id, ...values });
                    setEditing(false);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      {vendor.phone || vendor.area ? (
        <section aria-label="Contact" className="grid gap-0.5">
          <h4 className="text-caption font-semibold tracking-[0.04em] text-ink-3 uppercase">
            Contact
          </h4>
          {vendor.phone ? (
            <a
              href={telHref(vendor.phone)}
              className="inline-flex w-fit items-center gap-1.5 text-label font-medium text-action underline-offset-2 hover:underline num"
            >
              <Phone aria-hidden className="size-3.5" />
              {vendor.phone}
            </a>
          ) : null}
          {vendor.area ? (
            <p className="text-label text-ink">{vendor.area}</p>
          ) : null}
          <p className="text-caption text-ink-3">As typed by a Member</p>
        </section>
      ) : null}

      <section aria-label="Estimate" className="grid gap-0.5">
        <h4 className="text-caption font-semibold tracking-[0.04em] text-ink-3 uppercase">
          Estimate
        </h4>
        {estimate ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-label text-ink">
              <PriceBadge kind="estimate" />
              <span className="num">
                {formatINR(estimate.unitLow)} to {formatINR(estimate.unitHigh)}{" "}
                {UNIT_LABELS[estimate.unit] ?? estimate.unit}
              </span>
            </p>
            <p className="text-caption text-ink-3">{estimate.basis.text}</p>
          </>
        ) : (
          <p className="text-label text-ink-2">No Estimate yet</p>
        )}
        <p className="text-caption text-ink-3">
          No Listed prices: record a Quote once you&rsquo;ve talked to them.
        </p>
      </section>
    </article>
  );
}
