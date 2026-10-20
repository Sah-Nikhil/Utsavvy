# Next.js on Vercel, with Convex for data and live updates and Clerk for sign-in

Utsavvy is a Next.js 16 (App Router) app hosted on Vercel's Hobby plan, with Convex as the backend and Clerk for sign-in. Convex keeps every Member's Chat and Canvas live through subscribed queries, stores Inspiration uploads in its file storage, shows presence dots through its Presence component (`@convex-dev/presence`) and hosts the Assistant through the Convex Agent component, which saves the streamed reply so every Member of an Event sees it, including one who reconnects. Clerk has a documented Convex integration with Google sign-in, and the same stack (Next.js, Convex, Clerk) was used for SahayakOS, so it is the shortest path to a working shared Event in a one-week build. Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15), from the research in [Which backend gives live Chat and Canvas updates, presence and sign-in for a one-week build?](https://github.com/Sah-Nikhil/Utsavvy/issues/9).

## Considered options

- **Firebase**: file storage, Functions and App Hosting all require a billing account since 2026-02-03, Firestore has no native presence, and App Hosting doesn't list bun.
- **Supabase**: workable, but the shared streamed reply needs Broadcast plus durable rows for replay, Edge Functions stop at 150 seconds, and local development on Windows needs Docker.
- **Convex Auth** instead of Clerk: still beta, and its Next.js server-side support is "under active development".
- **Better Auth inside Convex**: works on any domain with no user cap, but is newer and needs our own Google OAuth client; Clerk is already familiar.
- **Clerk production keys**: need a domain we own ("you cannot use a `*.vercel.app` domain for production"). We don't have one.

## Consequences

- **Clerk runs on its development keys** on the public `*.vercel.app` URL and on preview URLs, which Clerk documents as supported. Development instances are capped at 100 users and Google's consent screen shows an `accounts.dev` domain. Both are acceptable for a hackathon. If a domain is bought later, move to production keys and our own Google OAuth client.
- **Judges get in two ways**: sign-in methods are Google and email + password. Two or three ready-made judge accounts (created in the Clerk dashboard) are Members of a seeded demo Event, and their logins go in the submission notes, not the repo. Development keys also run in Clerk's test mode, so any `+clerk_test` address (for example `judge+clerk_test@example.com`) signs up with the code `424242` without a real inbox. Because the judge logins are shared, a reset script restores the demo Event.
- **Every PR preview gets its own backend**: Convex preview deployments work on the free plan (beta, deleted after 5 days), so the browser test can run against each PR's Vercel preview.
- **Vercel Hobby is for non-commercial use only.** Utsavvy is a free hackathon entry with no ads and no payments, which fits.
- AI SDK 7 needs Node.js 22 or newer, so the Vercel project runs on Node 22+.
- Membership must be checked in every Event-scoped Convex function and Assistant tool; Convex has no row-level rules to fall back on.

## Sources

Checked 2026-10-21: [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Vercel limits](https://vercel.com/docs/limits), [Convex limits](https://docs.convex.dev/production/state/limits), [Convex preview deployments](https://docs.convex.dev/production/hosting/preview-deployments), [Convex Auth](https://docs.convex.dev/auth/convex-auth), [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [Clerk on Vercel](https://clerk.com/docs/deployments/deploy-to-vercel), [Clerk test emails](https://clerk.com/docs/guides/development/testing/test-emails-and-phones), [Clerk pricing](https://clerk.com/pricing).
