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
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
