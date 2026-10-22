import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { MountPlaceholder } from "@/components/shell/MountPlaceholder";

export const metadata: Metadata = { title: "Terms and privacy" };

// S1 owns this page: what each outside service receives (IMPLEMENTATION_PLAN.md section 4.15).

export default function TermsPage() {
  return (
    <SiteChrome>
      <h1 className="mb-4 font-display text-headline font-semibold text-ink">
        Terms and privacy
      </h1>
      <MountPlaceholder title="Terms and privacy" slice="S1" />
    </SiteChrome>
  );
}
