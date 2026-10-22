import type { NextConfig } from "next";
import { embedPolicy, mainPolicy, type CspEnvironment } from "./lib/csp/policy";

const cspEnv: CspEnvironment = {
  development: process.env.NODE_ENV === "development",
  vercelPreview: process.env.VERCEL_ENV === "preview",
};

const nextConfig: NextConfig = {
  // `next dev` would otherwise append its own block to AGENTS.md, which is the
  // orchestrator's file; agent instructions live in CLAUDE.md.
  agentRules: false,
  // The first `convex dev` wrote CONVEX_URL before Next.js existed; Vercel's
  // `convex deploy --cmd` sets NEXT_PUBLIC_CONVEX_URL itself.
  env: {
    NEXT_PUBLIC_CONVEX_URL:
      process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? "",
  },
  // No Referrer-Policy header: the browser default (strict-origin-when-cross-origin)
  // lets Google see our origin, which the website-restricted Maps key needs.
  async headers() {
    return [
      {
        source: "/:path((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: mainPolicy(cspEnv) },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: embedPolicy(cspEnv) },
        ],
      },
    ];
  },
};

export default nextConfig;
