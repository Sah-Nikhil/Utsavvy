---
id: 4
title: Which backend gives live Chat and Canvas updates, presence and sign-in for a one-week build?
labels: [wayfinder:research]
status: open
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
