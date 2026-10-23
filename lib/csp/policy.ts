/**
 * The Content Security Policy (IMPLEMENTATION_PLAN.md section 4.12), built from
 * one list so a new source is a one-line change. `next.config.ts` sends the
 * main policy on every route and the embed policy on `/embed/*` only.
 *
 * Sources, checked 2026-10-22:
 * - Clerk: https://clerk.com/docs/security/clerk-csp (development instances
 *   serve the Frontend API from *.clerk.accounts.dev).
 * - Google Maps JavaScript: https://developers.google.com/maps/documentation/javascript/content-security-policy
 *   (the allowlist variant). S20's spike confirms these on a deployed preview.
 * - Vercel's preview toolbar: https://vercel.com/docs/vercel-toolbar/managing-toolbar#using-a-content-security-policy
 * - Pinterest and Instagram, embed routes only: ADR 0014.
 */

type Directive =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "frame-src"
  | "worker-src"
  | "child-src"
  | "media-src"
  | "object-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors"
  | "manifest-src";

type Policy = Partial<Record<Directive, string[]>>;

/** Where each group of sources comes from; one entry per outside service. */
const SOURCES: Record<string, Policy> = {
  self: {
    "default-src": ["'self'"],
    // Next.js inlines its bootstrap scripts; nonces are out of scope for v1.
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  },
  // *.protect.clerk.com is Clerk's abuse and fraud protection; its connect-src
  // entry needs the `:*` port because those hosts serve on ports other than 443.
  clerk: {
    "script-src": [
      "https://*.clerk.accounts.dev",
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ],
    "connect-src": [
      "https://*.clerk.accounts.dev",
      "https://clerk-telemetry.com",
      "https://*.protect.clerk.com:*",
    ],
    "img-src": ["https://img.clerk.com"],
    "frame-src": [
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ],
  },
  convex: {
    "connect-src": ["https://*.convex.cloud", "wss://*.convex.cloud"],
  },
  // OpenFreeMap vector tiles, label fonts and sprites; MapLibre runs its workers from blob: URLs.
  openFreeMap: {
    "connect-src": ["https://tiles.openfreemap.org"],
    "img-src": ["https://tiles.openfreemap.org"],
    "worker-src": ["blob:"],
    "child-src": ["blob:"],
  },
  googleMaps: {
    "script-src": [
      "https://*.googleapis.com",
      "https://*.gstatic.com",
      "*.google.com",
      "https://*.ggpht.com",
      "*.googleusercontent.com",
      "'unsafe-eval'",
      "blob:",
    ],
    "img-src": [
      "https://*.googleapis.com",
      "https://*.gstatic.com",
      "*.google.com",
      "*.googleusercontent.com",
    ],
    "frame-src": ["*.google.com"],
    "connect-src": [
      "https://*.googleapis.com",
      "*.google.com",
      "https://*.gstatic.com",
      "data:",
      "blob:",
    ],
    "font-src": ["https://fonts.gstatic.com"],
    "style-src": ["https://fonts.googleapis.com"],
  },
};

/** Vercel's preview toolbar, sent only on preview deployments. */
const VERCEL_PREVIEW: Policy = {
  "script-src": ["https://vercel.live"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "img-src": ["https://vercel.live", "https://vercel.com"],
  "frame-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
};

/** React's development tooling evaluates code; never sent in production builds. */
const DEVELOPMENT: Policy = {
  "script-src": ["'unsafe-eval'"],
  "connect-src": ["ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*"],
};

/** Pinterest's and Instagram's widgets, allowed on `/embed/*` only (ADR 0014). */
const EMBEDS: Policy = {
  "script-src": [
    "https://assets.pinterest.com",
    "https://widgets.pinterest.com",
    "https://www.instagram.com",
  ],
  // s.pinimg.com: a board owner's picture. v1.pinimg.com: video Pins. Both
  // found by X2's deployed check on 2026-10-23 (#82).
  "img-src": [
    "https://i.pinimg.com",
    "https://s.pinimg.com",
    "https://log.pinterest.com",
    "data:",
  ],
  "media-src": ["https://v1.pinimg.com"],
  "frame-src": ["https://www.instagram.com"],
  "style-src": ["'unsafe-inline'"],
};

function merge(...policies: Policy[]): Policy {
  const out: Policy = {};
  for (const policy of policies) {
    for (const [directive, sources] of Object.entries(policy) as [
      Directive,
      string[],
    ][]) {
      const existing = out[directive] ?? [];
      out[directive] = [
        ...existing,
        ...sources.filter((s) => !existing.includes(s)),
      ];
    }
  }
  return out;
}

function serialize(policy: Policy): string {
  return Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

export type CspEnvironment = {
  /** `process.env.NODE_ENV === "development"` */
  development: boolean;
  /** `process.env.VERCEL_ENV === "preview"` */
  vercelPreview: boolean;
};

function base(env: CspEnvironment): Policy {
  return merge(
    ...Object.values(SOURCES),
    env.vercelPreview ? VERCEL_PREVIEW : {},
    env.development ? DEVELOPMENT : {},
  );
}

/** The policy for every route except `/embed/*`. */
export function mainPolicy(env: CspEnvironment): string {
  return serialize(merge(base(env), { "frame-ancestors": ["'self'"] }));
}

/** The policy for `/embed/*`: the main list plus Pinterest's and Instagram's hosts. */
export function embedPolicy(env: CspEnvironment): string {
  return serialize(merge(base(env), EMBEDS, { "frame-ancestors": ["'self'"] }));
}

/**
 * The policy for `/embed/pinterest`: the `/embed` policy plus a CSP sandbox
 * with the card iframe's own flags, so the page keeps an opaque origin even
 * when opened directly rather than in its card (#82, review of PR #78).
 * Instagram's page can't take it: Instagram's own iframe inherits the sandbox
 * and stays blank.
 */
export function pinterestEmbedPolicy(env: CspEnvironment): string {
  return `${embedPolicy(env)}; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox`;
}
