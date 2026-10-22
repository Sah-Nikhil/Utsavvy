import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <SiteChrome>
      <div className="flex justify-center py-6">
        <SignIn fallbackRedirectUrl="/events" signUpUrl="/sign-up" />
      </div>
    </SiteChrome>
  );
}
