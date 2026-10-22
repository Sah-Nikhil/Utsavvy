import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/shell/SiteChrome";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <SiteChrome>
      <div className="flex justify-center py-6">
        <SignUp fallbackRedirectUrl="/events" signInUrl="/sign-in" />
      </div>
    </SiteChrome>
  );
}
