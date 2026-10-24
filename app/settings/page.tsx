import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { PersonalSettings } from "./PersonalSettings";

export const metadata: Metadata = { title: "Settings" };

// S16 owns this page: the person's own settings (the mobile pointing default).

export default function SettingsPage() {
  return (
    <SiteChrome>
      <h1 className="mb-4 font-display text-headline font-semibold text-ink">
        Settings
      </h1>
      <PersonalSettings />
    </SiteChrome>
  );
}
