"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { FileText, Image as ImageIcon, Plus } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PriceBadge } from "@/components/ui/price-badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";
import { AddQuoteDialog } from "./AddQuoteDialog";

/*
 * One checklist link's Quotes on a Shortlisted Vendor (S12): the current
 * Quote with how it adds up, its note, the day it came and its attachment,
 * the older ones on request, "Add Quote", and, once the Vendor is Booked,
 * "Use the ₹2.85L Quote as this line's amount?". Only a Member's yes there
 * changes the budget line.
 */

type QuoteView = NonNullable<
  ReturnType<typeof useQuery<typeof api.quotes.listForLink>>
>["quotes"][number];

const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

export function LinkQuotes({
  linkId,
  vendorName,
  entryLabel,
}: {
  linkId: Id<"vendorLinks">;
  vendorName: string;
  entryLabel: string;
}) {
  const data = useQuery(api.quotes.listForLink, { linkId });
  const applyQuote = useMutation(api.quotes.useAsAmount);
  const [adding, setAdding] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [dismissed, setDismissed] = useState<Id<"quotes"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return null;
  const { current, quotes, ask, canManage } = data;
  const older = quotes.slice(1);
  const showAsk = ask !== null && dismissed !== ask.quoteId;

  async function yes() {
    if (!ask) return;
    setBusy(true);
    setError(null);
    try {
      await applyQuote({ entryId: ask.entryId, quoteId: ask.quoteId });
    } catch (e) {
      setError(errorMessage(e, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1.5 pl-1" data-link-quotes={linkId}>
      {current ? (
        <QuoteRow quote={current} />
      ) : (
        <p className="text-caption text-ink-3">No Quote yet.</p>
      )}
      {older.length > 0 ? (
        <div className="grid gap-1">
          <button
            type="button"
            aria-expanded={showOlder}
            onClick={() => setShowOlder((o) => !o)}
            className="justify-self-start rounded-xs text-caption text-ink-2 underline decoration-dotted underline-offset-[3px] hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            {showOlder
              ? "Hide older Quotes"
              : older.length === 1
                ? "1 older Quote"
                : `${older.length} older Quotes`}
          </button>
          {showOlder ? (
            <ul className="grid gap-1 border-l border-rule pl-2.5">
              {older.map((quote) => (
                <li key={quote._id}>
                  <QuoteRow quote={quote} older />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {showAsk ? (
        <div
          role="group"
          aria-label="Use the Quote"
          className="grid gap-2 rounded-sm bg-quote-soft px-2.5 py-2 text-label text-ink"
        >
          <p className="font-medium">{ask.question}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void yes()} disabled={busy}>
              Yes, use it
            </Button>
            <Button
              size="sm"
              variant="text"
              onClick={() => setDismissed(ask.quoteId)}
              disabled={busy}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {canManage ? (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden />
          Add Quote
          <span className="sr-only"> for {entryLabel}</span>
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-warn">
          {error}
        </p>
      ) : null}

      <Dialog open={adding} onOpenChange={setAdding}>
        {adding ? (
          <AddQuoteDialog
            linkId={linkId}
            vendorName={vendorName}
            entryLabel={entryLabel}
            functions={data.functions}
            served={data.served}
            close={() => setAdding(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function QuoteRow({
  quote,
  older = false,
}: {
  quote: QuoteView;
  older?: boolean;
}) {
  return (
    <div
      data-quote-id={quote._id}
      className={cn("grid gap-0.5", older && "text-ink-2")}
    >
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <PriceBadge kind="quote" detail="none" />
        <span className="num text-label font-semibold text-quote">
          {quote.line}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-caption text-ink-3">
        {quote.receivedAt !== null ? (
          <span>Received {DAY.format(quote.receivedAt)}</span>
        ) : null}
        {quote.source === "chatPaste" ? <span>From the Chat</span> : null}
        {quote.attachment ? (
          <AttachmentLink quoteId={quote._id} kind={quote.attachment} />
        ) : null}
      </span>
      {quote.note ? (
        <span
          className={cn("text-caption text-ink-2", scriptClass(quote.note))}
        >
          {quote.note}
        </span>
      ) : null}
    </div>
  );
}

/** Opens the attachment through a URL only the Event's people can get. */
function AttachmentLink({
  quoteId,
  kind,
}: {
  quoteId: Id<"quotes">;
  kind: "pdf" | "image";
}) {
  const convex = useConvex();
  const [failed, setFailed] = useState(false);
  async function open() {
    setFailed(false);
    try {
      const url = await convex.query(api.quotes.attachmentUrl, { quoteId });
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }
  const Icon = kind === "pdf" ? FileText : ImageIcon;
  return (
    <button
      type="button"
      onClick={() => void open()}
      className="inline-flex items-center gap-1 rounded-xs text-action underline underline-offset-2 hover:text-action-strong focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Icon aria-hidden className="size-3.5" />
      {failed
        ? "Couldn't open it"
        : kind === "pdf"
          ? "Open the PDF"
          : "Open the photo"}
      <span className="sr-only"> (opens in a new tab)</span>
    </button>
  );
}
