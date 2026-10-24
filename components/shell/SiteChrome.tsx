import { Show } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AccountButton } from "./AccountButton";
import { RangoliMark } from "./Rangoli";

/** The wordmark: a rangoli diamond, Utsavvy in Fraunces and its Devanagari root. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center gap-2 rounded-sm text-ink no-underline",
        className,
      )}
    >
      <RangoliMark className="size-[18px] transition-transform duration-(--dur-arrival) ease-emphasized group-hover:rotate-45 motion-reduce:transition-none" />
      <span className="font-display text-[1.1875rem] leading-none font-semibold tracking-[-0.015em]">
        Utsavvy
      </span>
      <span
        lang="hi"
        className="font-display-hi translate-y-px text-label text-ink-3"
      >
        उत्सव
      </span>
    </Link>
  );
}

const navLink =
  "state-layer inline-flex h-9 items-center rounded-[18px] px-3.5 font-semibold no-underline transition-[border-radius] duration-(--dur-shape) ease-standard active:rounded-sm";

/** The footer every page shares: the terms and the "Report content" address. */
export function SiteFooter() {
  const reportEmail = process.env.NEXT_PUBLIC_REPORT_EMAIL;
  return (
    <footer className="bg-surface-dim text-caption text-ink-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-6">
        <span className="inline-flex items-center gap-2">
          <RangoliMark className="size-3.5" />
          Utsavvy is a non-commercial hackathon prototype.
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto">
          <Link
            href="/terms"
            className="text-ink underline-offset-4 hover:underline"
          >
            Terms and privacy
          </Link>
          {reportEmail ? (
            <a
              href={`mailto:${reportEmail}`}
              className="text-ink underline-offset-4 hover:underline"
            >
              Report content
            </a>
          ) : null}
        </span>
      </div>
    </footer>
  );
}

/**
 * Header, page body and footer for every page outside the workspace, on Look
 * D's sand ground. `bleed` hands the full width to the page (the landing);
 * otherwise the body is a centred column.
 */
export function SiteChrome({
  children,
  wide = false,
  bleed = false,
}: {
  children: ReactNode;
  wide?: boolean;
  bleed?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav
            aria-label="Account"
            className="flex items-center gap-1.5 text-label"
          >
            <Show when="signed-in">
              <Link href="/events" className={cn(navLink, "text-ink")}>
                Your Events
              </Link>
              <span className="pl-1.5">
                <AccountButton />
              </span>
            </Show>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className={cn(navLink, "bg-action-tonal text-on-action-tonal")}
              >
                Sign in
              </Link>
            </Show>
          </nav>
        </div>
      </header>
      <main
        id="main"
        className={cn(
          "w-full flex-1",
          bleed
            ? null
            : [
                "mx-auto px-4 pt-6 pb-16 sm:px-6 sm:pt-10",
                wide ? "max-w-6xl" : "max-w-5xl",
              ],
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
