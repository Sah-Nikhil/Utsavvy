import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { EnsureUser } from "@/components/providers/EnsureUser";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { ornamentsScript } from "@/lib/ornaments";
import { anek, fraunces, tiro } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Utsavvy", template: "%s · Utsavvy" },
  description:
    "A planning Assistant for weddings, birthdays and community events in India: budgets, timelines, Vendor checklists and ideas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <html
        lang="en"
        className={`${anek.variable} ${fraunces.variable} ${tiro.variable}`}
        // The ornaments script below may set data-ornaments before React hydrates.
        suppressHydrationWarning
      >
        <head>
          {/* Applies the personal Ornaments setting before first paint (lib/ornaments.ts). */}
          <script dangerouslySetInnerHTML={{ __html: ornamentsScript }} />
        </head>
        <body>
          <ConvexClientProvider>
            <EnsureUser />
            {children}
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
