import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

export const metadata: Metadata = { title: "Settings" };

// S16 owns this page: personal settings (the mobile pointing default).

export default function SettingsPage() {
  return (
    <SiteChrome>
      <h1 className="mb-4 font-display text-headline font-semibold text-ink">
        Settings
      </h1>
      <MountPlaceholder title="Personal settings" slice="S16" />
    </SiteChrome>
  );
}
