"use client";

import { useQuery } from "convex/react";
import { ImageUp, Link2, Search } from "lucide-react";
import { useState } from "react";
import { PinterestIdeasButton } from "@/components/pinterest-ideas/PinterestIdeasSheet";
import { PasteLinkForm } from "@/components/references/PasteLinkForm";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colourName } from "@/lib/inspirations/theme";
import { SearchTab } from "./SearchTab";
import { Swatches } from "./parts";
import { UploadTab } from "./UploadTab";

// S13 (Inspirations) owns this folder: Search the stock library and Upload.
// "Paste a link" is X2's and "Browse ideas on Pinterest" is S21's.
// Generate arrives with X3 (IMPLEMENTATION_PLAN.md section 1).

export type AddInspirationPanelProps = { eventId: string };

type Tab = "search" | "upload" | "link";

export function AddInspirationPanel({ eventId }: AddInspirationPanelProps) {
  const id = eventId as Id<"events">;
  const panel = useQuery(api.inspirations.panel, { eventId: id });
  const [tab, setTab] = useState<Tab>("search");
  const canEdit = panel?.canEdit ?? false;
  const theme = panel?.theme;
  const themeWords = theme
    ? [...theme.decorKeywords, ...theme.styleWords].filter(
        (word, i, all) => all.indexOf(word) === i,
      )
    : [];
  const reportEmail = process.env.NEXT_PUBLIC_REPORT_EMAIL;

  return (
    <div className="grid gap-5">
      {theme ? <ThemeSummary theme={theme} /> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="flex items-end gap-2">
          <TabsList className="min-w-0 flex-1">
            <TabsTab value="search">
              <Search aria-hidden />
              Search
            </TabsTab>
            <TabsTab value="upload" disabled={!canEdit}>
              <ImageUp aria-hidden />
              Upload
            </TabsTab>
            <TabsTab value="link" disabled={!canEdit}>
              <Link2 aria-hidden />
              Paste a link
            </TabsTab>
          </TabsList>
          <PinterestIdeasButton />
        </div>
        <TabsPanel value="search">
          <SearchTab
            eventId={id}
            canEdit={canEdit}
            themeWords={themeWords}
            onUploadInstead={() => setTab("upload")}
          />
        </TabsPanel>
        <TabsPanel value="upload">
          {panel ? (
            <UploadTab eventId={id} rightsOn={panel.uploadRightsOn} />
          ) : null}
        </TabsPanel>
        <TabsPanel value="link">
          <PasteLinkForm eventId={eventId} />
        </TabsPanel>
      </Tabs>

      {!canEdit && panel ? (
        <p className="text-caption text-ink-3">
          Viewers can browse the stock library; Members add Inspirations.
        </p>
      ) : null}

      <footer className="border-t border-rule pt-3 text-caption text-ink-3">
        Stock photos are hand-picked from Pexels and credited to their
        photographers.
        {reportEmail ? (
          <>
            {" "}
            <a
              href={`mailto:${reportEmail}`}
              className="text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink"
            >
              Report content
            </a>
          </>
        ) : null}
      </footer>
    </div>
  );
}

/** The Event's Theme as it stands: its colours, then its words. */
function ThemeSummary({
  theme,
}: {
  theme: { palette: string[]; styleWords: string[]; decorKeywords: string[] };
}) {
  const words = [...theme.styleWords, ...theme.decorKeywords];
  const empty = theme.palette.length === 0 && words.length === 0;
  return (
    <section
      aria-label="The Theme"
      className="grid gap-2 rounded-md bg-surface-sunk px-4 py-3"
    >
      <div className="flex items-center gap-2.5">
        <h3 className="font-display text-title text-ink">Theme</h3>
        <Swatches palette={theme.palette} size="md" />
        {theme.palette.length > 0 ? (
          <span className="sr-only">
            Colours: {theme.palette.map(colourName).join(", ")}
          </span>
        ) : null}
      </div>
      <p className="text-label text-ink-2">
        {empty
          ? "No Theme yet. Tap “Use for Theme” on any photo to start one."
          : words.join(" · ")}
      </p>
    </section>
  );
}
