import { ConvexError } from "convex/values";

/** The message a Convex function refused with, or `fallback` for anything else. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown } | null;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}
