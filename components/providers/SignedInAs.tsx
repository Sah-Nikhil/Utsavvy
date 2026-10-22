"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * "Signed in as ..." from the person's own `users` row, read through Convex with
 * their Clerk token. Nothing shows until that authenticated read succeeds;
 * `data-account-ready` marks that moment for the smoke test. The email shows
 * only once Clerk's session token carries an `email` claim.
 */
export function SignedInAs() {
  const me = useQuery(api.users.me);
  if (!me) return null;
  return (
    <p
      data-account-ready=""
      data-account-email={me.email}
      className="text-label text-ink-3"
    >
      {me.email ? `Signed in as ${me.email}` : "Signed in"}
    </p>
  );
}
