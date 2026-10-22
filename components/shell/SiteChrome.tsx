import { Show } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AccountButton } from "./AccountButton";

/** The wordmark: Utsavvy in Fraunces, with its Devanagari root beside it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-baseline gap-2 rounded-xs text-ink no-underline",
        className,
      )}
    >
      <span className="font-display text-title font-semibold tracking-[-0.01em]">
        Utsavvy
      </span>
      <span lang="hi" className="font-display-hi text-label text-ink-3">
        उत्सव
      </span>
    </Link>
  );
}

/** The footer every page shares: the terms and the "Report content" address. */
export function SiteFooter() {
  const reportEmail = process.env.NEXT_PUBLIC_REPORT_EMAIL;
  return (
    <footer className="border-t border-rule px-6 py-5 text-caption text-ink-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2">
        <span>Utsavvy is a non-commercial hackathon prototype.</span>
        <Link
          href="/terms"
          className="text-ink-2 underline-offset-2 hover:underline"
        >
          Terms and privacy
        </Link>
        {reportEmail ? (
          <a
            href={`mailto:${reportEmail}`}
            className="text-ink-2 underline-offset-2 hover:underline"
          >
            Report content
          </a>
        ) : null}
      </div>
    </footer>
  );
}

/** Header, page body and footer for every page outside the workspace. */
export function SiteChrome({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="border-b border-rule bg-surface-header">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Wordmark />
          <nav
            aria-label="Account"
            className="flex items-center gap-4 text-label"
          >
            <Show when="signed-in">
              <Link
                href="/events"
                className="text-ink-2 underline-offset-2 hover:underline"
              >
                Your Events
              </Link>
              <AccountButton />
            </Show>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="font-semibold text-action underline-offset-2 hover:underline"
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
          "mx-auto w-full flex-1 px-6 py-10",
          wide ? "max-w-6xl" : "max-w-5xl",
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
