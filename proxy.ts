import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 calls middleware "proxy". Every signed-in-only route redirects a
// signed-out visitor to /sign-in and back again afterwards.
const isSignedInOnly = createRouteMatcher([
  "/events(.*)",
  "/join(.*)",
  "/settings(.*)",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isSignedInOnly(req)) await auth.protect();
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    // Signed-in-only routes, listed first so a dotted ID such as
    // /events/report.png can't slip past the static-file exclusion below.
    "/events/:path*",
    "/join/:path*",
    "/settings/:path*",
    // Skip Next.js internals, the two isolated embed pages (no Clerk inside the
    // Pinterest and Instagram iframes, ADR 0014) and static files, unless found
    // in search params. Other /embed paths keep Clerk: the app's 404 uses it.
    "/((?!_next|embed/(?:pinterest|instagram)(?:[/?]|$)|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
