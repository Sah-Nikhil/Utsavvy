import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { EnsureUser } from "@/components/providers/EnsureUser";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { LookSwitch } from "@/components/shell/LookSwitch";
import { DEFAULT_LOOK, LOOK_STORAGE_KEY } from "@/lib/looks";
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

const isDevelopment = process.env.NODE_ENV === "development";

// Development only: restore the look picked in the switch before first paint.
const restoreLook = `try{var l=localStorage.getItem(${JSON.stringify(LOOK_STORAGE_KEY)});if(l==="b"||l==="d"||l==="bd")document.documentElement.dataset.look=l}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <html
        lang="en"
        data-look={DEFAULT_LOOK}
        className={`${anek.variable} ${fraunces.variable} ${tiro.variable}`}
        suppressHydrationWarning={isDevelopment}
      >
        <head>
          {isDevelopment ? (
            <script dangerouslySetInnerHTML={{ __html: restoreLook }} />
          ) : null}
        </head>
        <body>
          <ConvexClientProvider>
            <EnsureUser />
            {children}
          </ConvexClientProvider>
          {isDevelopment ? <LookSwitch /> : null}
        </body>
      </html>
    </ClerkProvider>
  );
}
