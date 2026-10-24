"use client";

import {
  ArrowLeft,
  History,
  ImagePlus,
  LayoutList,
  MessagesSquare,
  MoreVertical,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { CanvasView } from "@/components/canvas/CanvasView";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CompactView } from "@/components/compact/CompactView";
import { ItemPreviewSheet } from "@/components/compact/ItemPreviewSheet";
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
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Selection } from "@/lib/types/canvas";
import { cn } from "@/lib/utils";
import { AccountButton } from "./AccountButton";
import { EventHeading } from "./EventHeading";
import { initialPhoneView, phoneView } from "./phoneView";
import { PointingChip } from "./PointingChip";
import { SelectionProvider, useSetSelection } from "./selection";
import { ShowItemProvider, useIsDesktop } from "./showItem";

/**
 * The workspace at /events/[eventId] (IMPLEMENTATION_PLAN.md section 4.2), with
 * a mount point for every panel and sheet. Each mount point is a component in
 * its slice's own folder, so slices fill them in without editing the shell.
 *
 * Responsive (S16): on desktop the Canvas sits beside the Chat, and the
 * Canvas can be shown as a list (Compact mode). On a phone the Chat is the
 * main view and the Canvas tab is Compact mode.
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
            <Workspace eventId={eventId} />
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

/** The caller's view preferences, asked only once they are known to be in the Event. */
function useViewPrefs(eventId: string) {
  const { isAuthenticated } = useConvexAuth();
  const me = useMembership(eventId);
  return useQuery(
    api.viewPrefs.get,
    isAuthenticated && me?.status === "active"
      ? { eventId: me.eventId }
      : "skip",
  );
}

/** How the current layout shows an Item; the body that is mounted sets it. */
type ShowRef = RefObject<(target: Selection) => void>;

function Workspace({ eventId }: { eventId: string }) {
  const desktop = useIsDesktop();
  const [panel, setPanel] = useState<PanelKey | null>(null);
  // The header's panels (History) show Items too, so the provider wraps the
  // header and the body, and passes each call on to the body's own way.
  const showRef: ShowRef = useRef(() => {});
  const show = useCallback((target: Selection) => showRef.current(target), []);
  const header = (
    <WorkspaceHeader
      eventId={eventId}
      panel={panel}
      setPanel={setPanel}
      phone={desktop === false}
    />
  );
  return (
    <ShowItemProvider show={show}>
      {header}
      {/* Until the browser says which layout fits, the header shows alone. */}
      {desktop === null ? null : desktop ? (
        <DesktopBody eventId={eventId} showRef={showRef} />
      ) : (
        <PhoneBody eventId={eventId} showRef={showRef} />
      )}
    </ShowItemProvider>
  );
}

// ---------------------------------------------------------------------------
// Desktop: the Canvas, or the Canvas as a list, beside the Chat

type DesktopView = "canvas" | "compact";

function viewKey(eventId: string) {
  return `utsavvy.workspace.view.${eventId}`;
}

function readSavedView(eventId: string): DesktopView | null {
  try {
    const saved = window.localStorage.getItem(viewKey(eventId));
    return saved === "canvas" || saved === "compact" ? saved : null;
  } catch {
    return null;
  }
}

function DesktopBody({
  eventId,
  showRef,
}: {
  eventId: string;
  showRef: ShowRef;
}) {
  const prefs = useViewPrefs(eventId);
  const setSelection = useSetSelection();
  // This browser's last choice, else the Event's default view.
  const [chosen, setChosen] = useState<DesktopView | null>(() =>
    readSavedView(eventId),
  );
  const view: DesktopView = chosen ?? prefs?.defaultView ?? "canvas";
  const choose = useCallback(
    (next: DesktopView) => {
      setChosen(next);
      try {
        window.localStorage.setItem(viewKey(eventId), next);
      } catch {
        // Storage can be blocked; the choice lasts until the page closes.
      }
    },
    [eventId],
  );
  const show = useCallback(
    // The whole target, so an Entry or a passage stays what is selected.
    (target: Selection) => setSelection(target),
    [setSelection],
  );

  useEffect(() => {
    showRef.current = show;
  }, [showRef, show]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-row">
        <main
          id="main"
          data-mount="canvas"
          data-view={view}
          aria-label="Canvas"
          className="relative min-h-0 flex-1 overflow-auto"
        >
          {view === "canvas" ? (
            <>
              {/* First in the tab order: the list is the keyboard route to the Canvas. */}
              <div className="absolute bottom-3 left-3 z-10">
                <Button
                  variant="tonal"
                  size="sm"
                  onClick={() => choose("compact")}
                  className="shadow-item"
                >
                  <LayoutList aria-hidden />
                  Canvas as a list
                </Button>
              </div>
              <CanvasView eventId={eventId} />
            </>
          ) : (
            <CompactView
              eventId={eventId}
              toolbarStart={
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => choose("canvas")}
                >
                  <Workflow aria-hidden />
                  Freeform Canvas
                </Button>
              }
            />
          )}
        </main>
        {/* The Chat is a tonal pane resting on the sand ground (MD3). */}
        <aside
          data-mount="chat"
          aria-label="Chat"
          className="m-2 mt-0 min-h-0 w-[340px] shrink-0 rounded-xl bg-surface-low lg:w-[380px]"
        >
          <ChatPanel eventId={eventId} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phone: the Chat first, with a Canvas tab in Compact mode

function PhoneBody({
  eventId,
  showRef,
}: {
  eventId: string;
  showRef: ShowRef;
}) {
  const prefs = useViewPrefs(eventId);
  const [state, dispatch] = useReducer(phoneView, initialPhoneView);
  const show = useCallback(
    (target: Selection) => {
      if (target === null) return;
      dispatch({
        type: "reference",
        target,
        pointing: prefs?.mobilePointing ?? "jump",
      });
    },
    [prefs?.mobilePointing],
  );

  useEffect(() => {
    showRef.current = show;
  }, [showRef, show]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <aside
            id="phone-tab-chat"
            data-mount="chat"
            aria-label="Chat"
            hidden={state.tab !== "chat"}
            className="absolute inset-0 flex flex-col rounded-t-xl bg-surface-low [&_[data-chat]]:h-full"
          >
            <PointingChip eventId={eventId} onShow={show} />
            <div className="min-h-0 flex-1">
              <ChatPanel eventId={eventId} />
            </div>
          </aside>
          <main
            id="main"
            data-mount="canvas"
            data-view="compact"
            aria-label="Canvas"
            hidden={state.tab !== "canvas"}
            className="absolute inset-0 overflow-y-auto"
          >
            <CompactView
              eventId={eventId}
              phone
              focusItemId={
                state.tab === "canvas" ? (state.focus?.itemId ?? null) : null
              }
            />
          </main>
          {state.tab === "canvas" && state.backToChat ? (
            // Floats over the list so it stays in reach however far the
            // jump scrolled (an extended FAB, MD3).
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
              <Button
                variant="filled"
                onClick={() => dispatch({ type: "backToChat" })}
                className="pointer-events-auto shadow-overlay"
              >
                <ArrowLeft aria-hidden />
                Back to Chat
              </Button>
            </div>
          ) : null}
        </div>
        <PhoneTabs
          tab={state.tab}
          onTab={(tab) => dispatch({ type: "tab", tab })}
        />
      </div>
      <ItemPreviewSheet
        eventId={eventId}
        itemId={state.sheet?.itemId ?? null}
        onClose={() => dispatch({ type: "closeSheet" })}
        onOpenOnCanvas={() => dispatch({ type: "openSheetOnCanvas" })}
      />
    </>
  );
}

/** The phone's navigation bar (MD3): the Chat and the Canvas, each a destination. */
function PhoneTabs({
  tab,
  onTab,
}: {
  tab: "chat" | "canvas";
  onTab: (tab: "chat" | "canvas") => void;
}) {
  const tabs = [
    { key: "chat", label: "Chat", icon: <MessagesSquare aria-hidden /> },
    { key: "canvas", label: "Canvas", icon: <LayoutList aria-hidden /> },
  ] as const;
  return (
    <nav
      aria-label="Workspace"
      className="grid shrink-0 grid-cols-2 gap-2 bg-surface-low px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {tabs.map((t) => {
        const current = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-current={current ? "page" : undefined}
            onClick={() => onTab(t.key)}
            data-phone-tab={t.key}
            className="group/tab flex flex-col items-center gap-1 rounded-lg pb-1 text-caption font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[current=page]:text-ink"
          >
            <span
              className={cn(
                "state-layer flex h-8 w-16 items-center justify-center rounded-full",
                "transition-[background-color,width] duration-(--dur-arrival) ease-emphasized",
                "[&_svg]:size-5",
                current && "bg-action-tonal text-on-action-tonal",
              )}
            >
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// The header

type PanelKey =
  "add-inspiration" | "people-panel" | "history-panel" | "event-settings";

const PANELS: {
  key: PanelKey;
  label: string;
  title: string;
  icon: ReactNode;
}[] = [
  {
    key: "add-inspiration",
    label: "Add Inspiration",
    title: "Add Inspiration",
    icon: <ImagePlus />,
  },
  { key: "people-panel", label: "People", title: "People", icon: <Users /> },
  {
    key: "history-panel",
    label: "History",
    title: "Edit history",
    icon: <History />,
  },
  {
    key: "event-settings",
    label: "Event settings",
    title: "Event settings",
    icon: <Settings />,
  },
];

function panelBody(key: PanelKey, eventId: string): ReactNode {
  switch (key) {
    case "add-inspiration":
      return <AddInspirationPanel eventId={eventId} />;
    case "people-panel":
      return <PeoplePanel eventId={eventId} />;
    case "history-panel":
      return <HistoryPanel eventId={eventId} />;
    case "event-settings":
      return <EventSettingsPanel eventId={eventId} />;
  }
}

function WorkspaceHeader({
  eventId,
  panel,
  setPanel,
  phone,
}: {
  eventId: string;
  panel: PanelKey | null;
  setPanel: (panel: PanelKey | null) => void;
  phone: boolean;
}) {
  return (
    // The header sits on the same sand ground as the Canvas (no rule under it):
    // the Chat pane beside it is what rises (MD3 tonal surfaces).
    <header className="flex h-16 shrink-0 items-center gap-2 bg-surface-header px-2 sm:gap-3 md:px-4">
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
        {PANELS.map((p) => (
          <PanelSheet
            key={p.key}
            mount={p.key}
            label={p.label}
            icon={p.icon}
            title={p.title}
            open={panel === p.key}
            onOpenChange={(open) => setPanel(open ? p.key : null)}
            showTrigger={!phone}
          >
            {panelBody(p.key, eventId)}
          </PanelSheet>
        ))}
        {phone ? (
          <Menu>
            <Tooltip content="More">
              <MenuTrigger
                render={
                  <Button
                    variant="text"
                    size="md"
                    icon
                    aria-label="More: Inspiration, People, History, settings"
                  />
                }
              >
                <MoreVertical />
              </MenuTrigger>
            </Tooltip>
            <MenuContent align="end">
              {PANELS.map((p) => (
                <MenuItem
                  key={p.key}
                  icon={p.icon}
                  onClick={() => setPanel(p.key)}
                >
                  {p.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
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

/**
 * One panel as a side sheet. On desktop its header icon button opens it; on a
 * phone the header's "More" menu does, so the trigger is left out.
 */
function PanelSheet({
  mount,
  label,
  icon,
  title,
  open,
  onOpenChange,
  showTrigger,
  children,
}: {
  mount: string;
  label: string;
  icon: ReactNode;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showTrigger: boolean;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <Tooltip content={label}>
          <SheetTrigger
            render={<Button variant="text" size="md" icon aria-label={label} />}
          >
            {icon}
          </SheetTrigger>
        </Tooltip>
      ) : null}
      <SheetContent side="right" title={title}>
        <div data-mount={mount}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}
