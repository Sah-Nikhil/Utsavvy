import type { ReactNode } from "react";
import { Rangoli } from "./Rangoli";

/*
 * The body of the 404 and error pages: a Hindi line in Tiro over an English
 * Fraunces heading, beside a quiet rangoli. Actions come in as children.
 */
export function StatusPage({
  hindi,
  title,
  children,
}: {
  hindi: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative grid min-h-[50dvh] content-center gap-4 overflow-x-clip py-8">
      <Rangoli className="absolute top-1/2 -right-32 size-[26rem] -translate-y-1/2 opacity-50 sm:right-0 sm:opacity-80" />
      <p lang="hi" className="relative font-display-hi text-[2rem] text-motif">
        {hindi}
      </p>
      <h1 className="relative max-w-[18ch] font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-ink">
        {title}
      </h1>
      <div className="relative grid max-w-[52ch] gap-5 text-body text-ink-2">
        {children}
      </div>
    </div>
  );
}
