"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { StatusPage } from "@/components/shell/StatusPage";
import { Button } from "@/components/ui/button";

/** Shown when a page fails to render. "Try again" re-renders the segment. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SiteChrome wide>
      <StatusPage hindi="कुछ गड़बड़ हो गई" title="This page didn't load">
        <p>
          Something went wrong while loading it. Try again, or go back to your
          Events.
          {error.digest ? (
            <span className="mt-2 block text-caption text-ink-3 num">
              Reference {error.digest}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            size="lg"
            variant="tonal"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Your Events
          </Button>
        </div>
      </StatusPage>
    </SiteChrome>
  );
}
