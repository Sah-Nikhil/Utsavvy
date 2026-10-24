import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <SiteChrome wide>
      <AuthFrame
        greeting="शुभारंभ"
        greetingMeaning="A good beginning"
        line="Create an account to plan your first Event, or to join one your family started."
      >
        <SignUp fallbackRedirectUrl="/events" signInUrl="/sign-in" />
      </AuthFrame>
    </SiteChrome>
  );
}
