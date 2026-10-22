"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

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
  // `join` needs the person's `users` row, which EnsureUser makes on sign-in.
  const account = useQuery(api.users.me);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "joining" });
  const started = useRef(false);

  useEffect(() => {
    if (!account || started.current) return;
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
  }, [account, join, token, router]);

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
