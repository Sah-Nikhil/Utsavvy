import Link from "next/link";
import { SiteChrome } from "@/components/shell/SiteChrome";

export default function NotFound() {
  return (
    <SiteChrome>
      <h1 className="mb-2 font-display text-headline font-semibold text-ink">
        Page not found
      </h1>
      <p className="text-body text-ink-2">
        This page doesn&apos;t exist.{" "}
        <Link href="/" className="text-action underline">
          Go home
        </Link>
      </p>
    </SiteChrome>
  );
}
