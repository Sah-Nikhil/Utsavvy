"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Upserts the signed-in person's `users` row from their Clerk identity once per
 * session (IMPLEMENTATION_PLAN.md section 4.1: no webhook in v1). A failure is
 * logged, not swallowed: without the row, every Event query refuses the person.
 */
export function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureMe = useMutation(api.users.ensureMe);
  useEffect(() => {
    if (!isAuthenticated) return;
    ensureMe({}).catch((error: unknown) => {
      console.error("Utsavvy couldn't set up your account in Convex.", error);
    });
  }, [isAuthenticated, ensureMe]);
  return null;
}
