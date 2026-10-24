import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <SiteChrome wide>
      <AuthFrame
        greeting="स्वागत है"
        greetingMeaning="Welcome"
        line="Your Events, their Canvas and the Chat pick up where you left them."
      >
        <SignIn fallbackRedirectUrl="/events" signUpUrl="/sign-up" />
      </AuthFrame>
    </SiteChrome>
  );
}
