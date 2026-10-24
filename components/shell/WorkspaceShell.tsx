"use client";

import { ArrowLeft, History, ImagePlus, Settings, Users } from "lucide-react";
import { useQuery } from "convex/react";
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
import { useMembership } from "@/components/people/useMembership";
import {
  PinterestIdeasProvider,
  PinterestIdeasSheet,
} from "@/components/pinterest-ideas/PinterestIdeasSheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { AccountButton } from "./AccountButton";
import { EventHeading } from "./EventHeading";
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
              {/* The Chat is a tonal pane resting on the sand ground (MD3). */}
              <aside
                data-mount="chat"
                aria-label="Chat"
                className="min-h-0 rounded-t-xl bg-surface-low md:m-2 md:mt-0 md:w-[380px] md:rounded-xl"
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
    // The header sits on the same sand ground as the Canvas (no rule under it):
    // the Chat pane beside it is what rises (MD3 tonal surfaces).
    <header className="flex h-16 shrink-0 items-center gap-3 bg-surface-header px-3 md:px-4">
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
      <div className="min-w-0 flex-1 border-l border-rule-strong/40 pl-3">
        <WorkspaceTitle eventId={eventId} />
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
        <AccountButton />
      </div>
    </header>
  );
}

/**
 * The Event's name and subtitle, live. Asked only once the caller is known to
 * be in the Event, so a refused Event shows no title rather than an error.
 */
function WorkspaceTitle({ eventId }: { eventId: string }) {
  const me = useMembership(eventId);
  const event = useQuery(
    api.events.get,
    me?.status === "active" ? { eventId: me.eventId } : "skip",
  );
  return (
    <EventHeading
      event={
        me === undefined ? undefined : me.status === "denied" ? null : event
      }
    />
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
