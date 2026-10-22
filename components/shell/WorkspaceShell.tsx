"use client";

import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, History, ImagePlus, Settings, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CanvasView } from "@/components/canvas/CanvasView";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { DemoBanner } from "@/components/demo/DemoBanner";
import {
  GooglePlacesButton,
  GooglePlacesProvider,
  GooglePlacesSheet,
} from "@/components/google-places/GooglePlacesSheet";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { AddInspirationPanel } from "@/components/inspirations/AddInspirationPanel";
import { EventSettingsPanel } from "@/components/people/EventSettingsPanel";
import { PeoplePanel } from "@/components/people/PeoplePanel";
import {
  PinterestIdeasProvider,
  PinterestIdeasSheet,
} from "@/components/pinterest-ideas/PinterestIdeasSheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { SelectionProvider } from "./selection";

/**
 * The workspace at /events/[eventId] (IMPLEMENTATION_PLAN.md section 4.2): the
 * Canvas beside the Chat, with a mount point for every panel and sheet. Each
 * mount point is a component in its slice's own folder, so slices fill them in
 * without editing the shell. S16 adds Compact mode and the phone layout.
 */
export function WorkspaceShell({ eventId }: { eventId: string }) {
  return (
    <SelectionProvider>
      <GooglePlacesProvider>
        <PinterestIdeasProvider>
          <div className="flex h-dvh flex-col bg-canvas text-ink">
            <div data-mount="banner">
              <DemoBanner eventId={eventId} />
            </div>
            <WorkspaceHeader eventId={eventId} />
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <main
                id="main"
                data-mount="canvas"
                aria-label="Canvas"
                className="min-h-0 flex-1 overflow-auto"
              >
                <CanvasView eventId={eventId} />
              </main>
              <aside
                data-mount="chat"
                aria-label="Chat"
                className="min-h-0 border-t border-rule bg-surface md:w-[380px] md:border-t-0 md:border-l"
              >
                <ChatPanel eventId={eventId} />
              </aside>
            </div>
          </div>
          <div data-mount="google-places">
            <GooglePlacesSheet />
          </div>
          <PinterestIdeasSheet />
        </PinterestIdeasProvider>
      </GooglePlacesProvider>
    </SelectionProvider>
  );
}

function WorkspaceHeader({ eventId }: { eventId: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-surface-header px-3 md:px-4">
      <Tooltip content="Your Events">
        <Button
          variant="text"
          size="md"
          icon
          aria-label="Back to your Events"
          render={<Link href="/events" />}
          nativeButton={false}
        >
          <ArrowLeft />
        </Button>
      </Tooltip>
      <div className="min-w-0 flex-1 border-l border-rule pl-3">
        <h1 className="truncate font-display text-title font-semibold tracking-[-0.01em]">
          Your Event
        </h1>
        <p className="truncate text-caption text-ink-3">
          The Event&apos;s name and dates arrive with S1
        </p>
      </div>
      <div data-mount="presence" className="hidden items-center sm:flex" />
      <div className="flex items-center gap-1">
        <GooglePlacesButton />
        <PanelButton
          mount="add-inspiration"
          label="Add Inspiration"
          icon={<ImagePlus />}
          title="Add Inspiration"
        >
          <AddInspirationPanel eventId={eventId} />
        </PanelButton>
        <PanelButton
          mount="people-panel"
          label="People"
          icon={<Users />}
          title="People"
        >
          <PeoplePanel eventId={eventId} />
        </PanelButton>
        <PanelButton
          mount="history-panel"
          label="History"
          icon={<History />}
          title="Edit history"
        >
          <HistoryPanel eventId={eventId} />
        </PanelButton>
        <PanelButton
          mount="event-settings"
          label="Event settings"
          icon={<Settings />}
          title="Event settings"
        >
          <EventSettingsPanel eventId={eventId} />
        </PanelButton>
      </div>
      <div className="pl-1">
        <UserButton />
      </div>
    </header>
  );
}

/** A header icon button that opens one panel as a side sheet. */
function PanelButton({
  mount,
  label,
  icon,
  title,
  children,
}: {
  mount: string;
  label: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <Tooltip content={label}>
        <SheetTrigger
          render={<Button variant="text" size="md" icon aria-label={label} />}
        >
          {icon}
        </SheetTrigger>
      </Tooltip>
      <SheetContent side="right" title={title}>
        <div data-mount={mount}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}
