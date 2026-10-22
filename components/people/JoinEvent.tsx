"use client";

import { useConvexAuth, useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/** How long to wait for sign-in to reach Convex before showing the failure. */
const JOIN_TIMEOUT_MS = 20_000;

type Outcome =
  | { kind: "joining" }
  | { kind: "refused"; message: string }
  | { kind: "failed" };

/**
 * Opens an invite link: joins at once with the link's role and goes to the
 * workspace, or shows why not ("You were removed from this Event.", "This
 * Event is full. Ask the Owner to make room." or a reset link). Someone
 * already in keeps their role and goes straight in. The proxy has already
 * made the person sign in.
 */
export function JoinEvent({ token }: { token: string }) {
  const router = useRouter();
  const join = useMutation(api.people.join);
  // `join` makes the person's `users` row itself if it isn't there yet, so it
  // needs only Convex to hold the Clerk token.
  const { isAuthenticated } = useConvexAuth();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "joining" });
  const started = useRef(false);

  useEffect(() => {
    if (isAuthenticated) return;
    // Never authenticated (Clerk or Convex unreachable): don't spin forever.
    const timer = setTimeout(() => {
      if (!started.current) setOutcome({ kind: "failed" });
    }, JOIN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;
    join({ token })
      .then((result) => {
        if (result.kind === "refused") {
          setOutcome({ kind: "refused", message: result.message });
        } else {
          router.replace(`/events/${result.eventId}`);
        }
      })
      .catch(() => setOutcome({ kind: "failed" }));
  }, [isAuthenticated, join, token, router]);

  if (outcome.kind === "joining") {
    return (
      <p className="text-body text-ink-2" aria-live="polite">
        Joining the Event…
      </p>
    );
  }
  return (
    <div className="grid max-w-lg justify-items-start gap-4" role="alert">
      <p className="font-display text-title font-semibold text-ink">
        {outcome.kind === "refused"
          ? outcome.message
          : "Something went wrong while joining. Try the link again."}
      </p>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href="/events" />}
      >
        Go to your Events
      </Button>
    </div>
  );
}
