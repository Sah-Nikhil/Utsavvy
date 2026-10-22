"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Upserts the signed-in person's `users` row from their Clerk identity once per
 * session (IMPLEMENTATION_PLAN.md section 4.1: no webhook in v1).
 */
export function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureMe = useMutation(api.users.ensureMe);
  useEffect(() => {
    if (isAuthenticated) void ensureMe({});
  }, [isAuthenticated, ensureMe]);
  return null;
}
