import type { AuthConfig } from "convex/server";

// Clerk's Convex integration (https://clerk.com/docs/guides/development/integrations/databases/convex).
// CLERK_FRONTEND_API_URL is set on each Convex deployment with `bunx convex env set`.
export default {
  providers: [
    {
      // auth.config.ts is read when functions are pushed, before the typed `env` exists.
      // eslint-disable-next-line @convex-dev/no-process-env
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
