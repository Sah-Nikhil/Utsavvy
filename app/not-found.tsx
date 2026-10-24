import Link from "next/link";
import { SiteChrome } from "@/components/shell/SiteChrome";
import { StatusPage } from "@/components/shell/StatusPage";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <SiteChrome wide>
      <StatusPage hindi="यह पन्ना नहीं मिला" title="Page not found">
        <p>This page doesn&apos;t exist.</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/" />}>
            Go home
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
