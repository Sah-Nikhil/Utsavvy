import { useEffect, useState } from "react";

/*
 * A Proposal closes 24 hours after it was posted. The server marks it expired
 * with a scheduled job, and Accept refuses it from `expiresAt` on even if the
 * job is late. The card doesn't wait for the job either: it shows the
 * Proposal expired, without Accept, from `expiresAt` on.
 */

type Status = { kind: string; text: string };

/** What a card shows at `now`: an open Proposal past its expiry reads as expired. */
export function seenAt<
  V extends { status: Status; canDecide: boolean; expiresAt: number },
>(view: V, now: number): V {
  if (view.status.kind !== "open" || now < view.expiresAt) return view;
  return {
    ...view,
    status: { kind: "expired", text: "Expired" },
    canDecide: false,
  };
}

/** setTimeout's longest wait (about 24 days); a Proposal expires within 24 hours. */
const MAX_WAIT = 2 ** 31 - 1;

/**
 * The time to show a card at: when it renders, then once more at
 * `expiresAt`, so an open card closes itself on time.
 */
export function useExpiryClock(expiresAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === undefined) return;
    const wait = Math.min(Math.max(0, expiresAt - Date.now()), MAX_WAIT);
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return now;
}
