"use client";

import { ConvexError } from "convex/values";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Canvas } from "./Canvas";

export { Canvas } from "./Canvas";
export { useCanvasItem, ViewerAvatars } from "./CanvasItemContext";
export { useFunctionFilter } from "./FunctionFilter";

export type CanvasViewProps = { eventId: string };

/**
 * The shell's Canvas mount point (components/shell/WorkspaceShell.tsx). A
 * Canvas that can't open, because the Event doesn't exist or this person
 * isn't in it, says so instead of breaking the workspace. Any other failure
 * offers to try again. One Item failing shows only on that Item (ItemNode).
 */
export function CanvasView({ eventId }: CanvasViewProps) {
  return (
    <CanvasErrorBoundary key={eventId}>
      <Canvas eventId={eventId} />
    </CanvasErrorBoundary>
  );
}

/** Whether the Canvas failed because this person can't open this Event. */
function cannotOpen(error: unknown): boolean {
  if (error instanceof ConvexError) {
    const data = error.data as { kind?: string } | undefined;
    return data?.kind === "AccessDenied";
  }
  // An Event ID that isn't one fails the query's argument check.
  return (
    error instanceof Error && /ArgumentValidationError/.test(error.message)
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown; failed: boolean }
> {
  state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const denied = cannotOpen(this.state.error);
    return (
      <div className="flex size-full min-h-[320px] items-center justify-center p-6">
        <div
          role="alert"
          className="grid max-w-sm justify-items-center gap-1.5 text-center"
        >
          <p className="font-display text-title text-ink">
            {denied
              ? "This Canvas can't be opened"
              : "Something went wrong on the Canvas"}
          </p>
          <p className="text-label text-ink-2">
            {denied
              ? "The Event may not exist, or you may no longer be in it. Go back to your Events and open it from there."
              : "Your plan is safe. Try opening the Canvas again."}
          </p>
          {denied ? null : (
            <Button
              variant="tonal"
              size="sm"
              className="mt-2"
              onClick={() => this.setState({ error: null, failed: false })}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }
}
