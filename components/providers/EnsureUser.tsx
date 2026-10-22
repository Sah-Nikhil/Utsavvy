"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Clerk refreshes the session token, and with it the claims Convex reads,
 * about every 60 seconds; after a profile change the new email or name reaches
 * Convex only with the next token.
 */
const CLAIMS_LAG_MS = 65_000;

/**
 * Upserts the signed-in person's `users` row from their Clerk identity
 * (IMPLEMENTATION_PLAN.md section 4.1: no webhook in v1): once Convex is
 * authenticated, and again when the person changes their Clerk profile during
 * the session (email, name or picture), so `users` doesn't keep an address they
 * no longer use. A failure is logged, not swallowed: without the row, every
 * Event query refuses the person.
 */
export function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const ensureMe = useMutation(api.users.ensureMe);
  const profile = user
    ? [
        user.updatedAt?.getTime(),
        user.primaryEmailAddress?.emailAddress,
        user.fullName,
        user.imageUrl,
      ].join("|")
    : null;
  const lastProfile = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const run = () =>
      ensureMe({}).catch((error: unknown) => {
        console.error("Utsavvy couldn't set up your account in Convex.", error);
      });
    run();
    const changed =
      lastProfile.current !== null && lastProfile.current !== profile;
    lastProfile.current = profile;
    if (!changed) return;
    const timer = setTimeout(run, CLAIMS_LAG_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, ensureMe, profile]);
  return null;
}
