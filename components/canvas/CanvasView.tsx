"use client";

import { Component, type ReactNode } from "react";
import { Canvas } from "./Canvas";

export { Canvas } from "./Canvas";
export { useFunctionFilter } from "./FunctionFilter";

export type CanvasViewProps = { eventId: string };

/**
 * The shell's Canvas mount point (components/shell/WorkspaceShell.tsx). A
 * Canvas that can't open, because the Event doesn't exist or this person
 * isn't in it, says so instead of breaking the workspace.
 */
export function CanvasView({ eventId }: CanvasViewProps) {
  return (
    <CanvasErrorBoundary key={eventId}>
      <Canvas eventId={eventId} />
    </CanvasErrorBoundary>
  );
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex size-full min-h-[320px] items-center justify-center p-6">
        <div role="alert" className="grid max-w-sm gap-1.5 text-center">
          <p className="font-display text-title text-ink">
            This Canvas can&apos;t be opened
          </p>
          <p className="text-label text-ink-2">
            The Event may not exist, or you may no longer be in it. Go back to
            your Events and open it from there.
          </p>
        </div>
      </div>
    );
  }
}
