import type { ReactNode } from "react";
import { Rangoli } from "./Rangoli";
import { SectionOrnament } from "./SectionOrnament";

/*
 * The frame around Clerk's sign-in and sign-up cards. Clerk renders flush
 * (components/shell/clerkAppearance.ts), so this white panel with the Section
 * corner pieces is the card people see, beside a rangoli greeting on wide
 * screens. The greeting is a Hindi word set in Tiro with its English sense.
 */
export function AuthFrame({
  greeting,
  greetingMeaning,
  line,
  children,
}: {
  /** A short Hindi greeting, e.g. "स्वागत है". */
  greeting: string;
  /** What the greeting means, in English. */
  greetingMeaning: string;
  line: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
      <div className="hidden justify-items-center gap-6 lg:grid">
        <Rangoli className="size-[20rem]" />
        <div className="grid max-w-sm gap-2 text-center">
          <p lang="hi" className="font-display-hi text-[2.75rem] text-motif">
            {greeting}
          </p>
          <p className="font-display text-title font-medium text-ink">
            {greetingMeaning}
          </p>
          <p className="text-body text-ink-2">{line}</p>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-[28rem] rounded-xl bg-surface-raised px-2 py-4 shadow-lift sm:px-6 sm:py-6">
        <SectionOrnament />
        <div className="flex justify-center">{children}</div>
      </div>
    </div>
  );
}
