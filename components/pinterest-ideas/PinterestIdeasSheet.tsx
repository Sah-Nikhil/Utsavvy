"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ExternalLink, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PasteLinkForm } from "@/components/references/PasteLinkForm";
import { ReferenceEmbed } from "@/components/references/ReferenceEmbed";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FunctionMarker,
  type FunctionIndex,
} from "@/components/ui/function-marker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { can } from "@/lib/access/permissions";
import { cn } from "@/lib/utils";
import { boardsForEvent, type Board } from "./boards";

// S21 (Browse ideas on Pinterest) owns this folder. The sheet lists the public
// boards on Utsavvy's own Pinterest account for the Event's type, its chosen
// Function's first, and shows one through Pinterest's own board widget inside
// X2's isolated `/embed/pinterest` frame (ADR 0014). Nothing of ours sits over
// the widget: a Member opens a Pin on Pinterest and brings its link back with
// X2's Paste a link form.

export type PinterestIdeasApi = {
  /** Opens the sheet, optionally on the boards for one Function. */
  open(opts?: { functionKey?: string }): void;
};

type SheetState = {
  isOpen: boolean;
  functionKey: string | null;
  /** Bumped on every open, so a reopened sheet starts on the first board. */
  opening: number;
  setOpen: (open: boolean) => void;
};

const noop: PinterestIdeasApi = { open: () => {} };
const PinterestIdeasContext = createContext<PinterestIdeasApi>(noop);
const SheetStateContext = createContext<SheetState | null>(null);

export function PinterestIdeasProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [functionKey, setFunctionKey] = useState<string | null>(null);
  const [opening, setOpening] = useState(0);
  const open = useCallback((opts?: { functionKey?: string }) => {
    setFunctionKey(opts?.functionKey ?? null);
    setOpening((n) => n + 1);
    setOpen(true);
  }, []);
  const api = useMemo<PinterestIdeasApi>(() => ({ open }), [open]);
  const state = useMemo<SheetState>(
    () => ({ isOpen, functionKey, opening, setOpen }),
    [isOpen, functionKey, opening],
  );
  return (
    <PinterestIdeasContext.Provider value={api}>
      <SheetStateContext.Provider value={state}>
        {children}
      </SheetStateContext.Provider>
    </PinterestIdeasContext.Provider>
  );
}

export function usePinterestIdeas(): PinterestIdeasApi {
  return useContext(PinterestIdeasContext);
}

/** "Browse ideas on Pinterest", in the Add Inspiration panel. */
export function PinterestIdeasButton({
  functionKey,
  className,
}: {
  functionKey?: string;
  className?: string;
}) {
  const { open } = usePinterestIdeas();
  return (
    <Button
      variant="tonal"
      className={cn("justify-self-start", className)}
      onClick={() => open(functionKey ? { functionKey } : undefined)}
    >
      <Sparkles aria-hidden />
      Browse ideas on Pinterest
    </Button>
  );
}

export const NO_BOARDS = "No Pinterest boards for this kind of Event yet.";
export const BOARD_NOTICE =
  "This board loads from Pinterest, which receives the usual browser data.";
const BRING_IT_BACK =
  "Found one you like? Tap it to open it on Pinterest, copy its link and paste it here";

/** The sheet, mounted once at the top of the workspace. */
export function PinterestIdeasSheet() {
  const state = useContext(SheetStateContext);
  const params = useParams<{ eventId?: string }>();
  const eventId = params?.eventId;
  if (state === null || eventId === undefined) return null;
  return (
    <Sheet open={state.isOpen} onOpenChange={state.setOpen}>
      <SheetContent
        side="full"
        title="Browse ideas on Pinterest"
        description="Boards Utsavvy keeps on Pinterest, with your Event's Functions first."
        bodyClassName="p-0"
      >
        {state.isOpen ? (
          <SheetBody
            key={state.opening}
            eventId={eventId}
            functionKey={state.functionKey}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  eventId,
  functionKey,
}: {
  eventId: string;
  functionKey: string | null;
}) {
  const id = eventId as Id<"events">;
  // Right after a page load Convex may not have the sign-in yet, and both
  // queries below refuse a signed-out caller; `people.me` never throws.
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.people.me, isAuthenticated ? { eventId } : "skip");
  const active = me?.status === "active";
  const event = useQuery(api.events.get, active ? { eventId: id } : "skip");
  // The same subscription the Canvas holds, so it costs nothing more.
  const canvas = useQuery(api.canvas.get, active ? { eventId: id } : "skip");
  const [picked, setPicked] = useState<string | null>(null);
  const android = useInstalledOnAndroid();

  if (me?.status === "denied") {
    return (
      <p className="px-5 py-6 text-label text-ink-2">
        You&apos;re no longer part of this Event.
      </p>
    );
  }
  if (event === undefined || canvas === undefined) {
    return (
      <p role="status" className="px-5 py-6 text-label text-ink-2">
        Loading boards…
      </p>
    );
  }

  const functions = canvas.functions;
  const boards = boardsForEvent(
    { eventType: event.eventType, functions },
    functionKey,
  );
  const board = boards.find((b) => b.key === picked) ?? boards[0] ?? null;
  const canSave = can(canvas.me.role, "canvas.edit");
  const markerOf = (key: string) => {
    const index = functions.findIndex((fn) => fn.key === key);
    return index < 0
      ? null
      : {
          index: (Math.min(index, 7) + 1) as FunctionIndex,
          name: functions[index]!.name,
        };
  };

  const bringBack = canSave ? (
    <div className="grid gap-3">
      <p className="text-body text-ink">
        {BRING_IT_BACK}
        {android ? ", or share it to Utsavvy." : "."}
      </p>
      <PasteLinkForm eventId={eventId} />
    </div>
  ) : (
    <p className="rounded-sm border border-rule bg-surface-sunk px-3 py-2.5 text-label text-ink-2">
      Viewers can browse boards but not save them.
    </p>
  );

  if (board === null) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-5 px-5 py-6">
        <p className="font-display text-title text-ink">{NO_BOARDS}</p>
        {canSave ? <PasteLinkForm eventId={eventId} /> : bringBack}
      </div>
    );
  }

  return (
    <div className="grid min-h-full md:grid-cols-[17rem_minmax(0,1fr)]">
      <nav
        aria-label="Pinterest boards"
        className="border-b border-rule bg-surface md:border-r md:border-b-0"
      >
        <ul className="flex gap-2 overflow-x-auto px-5 py-3 md:grid md:gap-1 md:overflow-visible md:px-3 md:py-4">
          {boards.map((b) => {
            const current = b.key === board.key;
            const markers = b.functionKeys
              .map(markerOf)
              .filter((m) => m !== null);
            return (
              <li key={b.key} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={current}
                  onClick={() => setPicked(b.key)}
                  className={cn(
                    "state-layer grid w-full gap-1 rounded-sm border px-3 py-2 text-left",
                    "transition-[background-color,border-color,color] duration-(--dur-feedback) ease-standard",
                    current
                      ? "border-transparent bg-selected text-on-selected"
                      : "border-rule-strong text-ink md:border-transparent",
                  )}
                >
                  <span className="text-label font-semibold whitespace-nowrap md:whitespace-normal">
                    {b.label}
                  </span>
                  {markers.length > 0 ? (
                    <span
                      className={cn(
                        "hidden flex-wrap items-center gap-x-2 gap-y-0.5 text-caption md:flex",
                        current ? "text-on-selected" : "text-ink-2",
                      )}
                    >
                      {markers.map((m) => (
                        <span
                          key={m.name}
                          className="inline-flex items-center gap-1"
                        >
                          <FunctionMarker index={m.index} />
                          {m.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <BoardPanel key={board.key} board={board}>
        {bringBack}
      </BoardPanel>
    </div>
  );
}

function BoardPanel({
  board,
  children,
}: {
  board: Board;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`board-${board.key}`}
      data-pinterest-board={board.key}
      className="grid w-full max-w-3xl content-start gap-5 px-5 py-5 md:px-8 md:py-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid gap-1">
          <h3
            id={`board-${board.key}`}
            className="font-display text-headline font-medium tracking-[-0.01em] text-ink"
          >
            {board.label}
          </h3>
          <p className="text-caption text-ink-2">{BOARD_NOTICE}</p>
        </div>
        <a
          href={board.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open board on Pinterest
          <ExternalLink aria-hidden />
        </a>
      </header>
      <ReferenceEmbed platform="pinterest" url={board.url} />
      {children}
    </section>
  );
}

/**
 * Whether Utsavvy runs as the installed app on Android, where the Pinterest
 * app can share a Pin into it (X8's share target).
 */
function useInstalledOnAndroid(): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        standalone.matches && /Android/i.test(window.navigator.userAgent),
      );
    update();
    standalone.addEventListener("change", update);
    return () => standalone.removeEventListener("change", update);
  }, []);
  return installed;
}
