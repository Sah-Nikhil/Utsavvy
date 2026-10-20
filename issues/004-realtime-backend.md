---
id: 4
title: Which backend gives live Chat and Canvas updates, presence and sign-in for a one-week build?
labels: [wayfinder:research]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

## Question

Which backend best supports several Members sharing one Event's Chat and Canvas live, for a solo developer with about five build days?

Compare Convex, Firebase (Firestore, Auth, Realtime Database presence) and Supabase (Realtime, Auth, Presence) on:

- Live updates of Chat messages and Canvas items to every Member, and presence (who is here).
- Sign-in (Google sign-in) and joining an Event through an invite link.
- Image and file storage for Inspirations.
- Server-side AI calls whose streamed reply reaches every Member of the Chat at once.
- Free tier limits, Next.js App Router integration, bun compatibility, development on Windows, and deployment options (Vercel, Cloud Run, Firebase App Hosting).
- The stretch path to live cursors and conflict-free co-editing of one item (Yjs, Liveblocks, Automerge, Convex's sync components) with each backend.

Also cover PWA Web Share Target: browser support (Android Chrome, desktop Chrome, iOS Safari), what a Next.js app needs (manifest, service worker for POSTed files), and what arrives when sharing from the Instagram and Pinterest Android apps.

The developer already used Next.js, Convex and Clerk in SahayakOS.

End with a recommendation.

Findings: branch `research/realtime-backend`, file `research/realtime-backend.md`.

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Findings: branch `research/realtime-backend` (commit `cda7aae`), file `research/realtime-backend.md`.

- **Recommended: Convex + Clerk, with Next.js on Vercel.** Convex queries keep Chat and Canvas live for every Member. The Convex Agent component saves the Assistant's streamed reply in throttled batches, so every Member (including one who reconnects) sees it, and its tools can change the Canvas through checked mutations. Clerk has a documented Convex + App Router integration with Google sign-in, and Convex has an official bun quickstart.
- **Firebase**: Cloud Storage (for Inspiration images), Functions, Cloud Run and App Hosting all need the Blaze billing plan since 2026-02-03. Firestore has no native presence (needs Realtime Database, capped at 100 simultaneous connections on Spark). App Hosting doesn't list bun.
- **Supabase**: workable, but the shared streamed reply needs Broadcast plus durable rows for replay, Edge Functions stop at 150 seconds on Free, and local development on Windows needs Docker.
- **Every backend**: membership must be checked in every Event-scoped function and Assistant tool, and the AI reply has to be persisted (a plain HTTP stream only reaches the Member who asked). Presence needs a heartbeat component. v1 stays item-level last-write-wins with an edit log; Convex's ProseMirror Sync is the closest route to the co-editing stretch goal.
- **Phone share sheet**: works for installed PWAs on Android Chrome, desktop Chrome and Edge on Windows; iOS Safari has no Web Share Target, so in-app paste and upload must exist anyway. Instagram and Pinterest most likely send a link as text, not an image; check on a real Android device.

Input to [Which stack do we build on?](./010-stack-choice.md).
