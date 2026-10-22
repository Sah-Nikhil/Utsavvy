import { parseReferenceUrl } from "./parse";

/**
 * Meta's tokenless Instagram oEmbed (ADR 0014). Only the `/embed/instagram`
 * page calls it, on the server, once per view: the answer is rendered and never
 * stored. The request goes to Meta's API, never to the Member's link.
 */
export const INSTAGRAM_OEMBED_ENDPOINT =
  "https://graph.facebook.com/v25.0/instagram_oembed";

export type InstagramEmbed =
  { kind: "embed"; blockquote: string } | { kind: "link" };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 5000;

const BLOCKQUOTE =
  /<blockquote\b[^>]*\bclass="[^"]*\binstagram-media\b[^"]*"[^>]*>[\s\S]*?<\/blockquote>/i;

/**
 * Markup that has no place in Meta's blockquote. The page renders the
 * blockquote as HTML on our own origin, so anything that could run code,
 * load another document or carry a picture sends it to the link card instead.
 */
const FORBIDDEN = [
  /<\s*(script|iframe|object|embed|link|meta|style|form|img|video|audio|source|base|frame)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /\ssrcdoc\s*=/i,
];

/** Every link in the blockquote must lead to Instagram. */
function linksOnlyToInstagram(html: string): boolean {
  for (const match of html.matchAll(
    /\s(?:href|data-instgrm-permalink)\s*=\s*"([^"]*)"/gi,
  )) {
    const value = match[1]!.replaceAll("&amp;", "&");
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.hostname !== "www.instagram.com")
      return false;
  }
  return true;
}

/** The first Instagram blockquote in Meta's `html`, or null when it isn't safe to render. */
export function extractBlockquote(html: string): string | null {
  const match = BLOCKQUOTE.exec(html);
  if (match === null) return null;
  const blockquote = match[0];
  if (FORBIDDEN.some((pattern) => pattern.test(blockquote))) return null;
  if (!/\sdata-instgrm-permalink\s*=/i.test(blockquote)) return null;
  if (!linksOnlyToInstagram(blockquote)) return null;
  return blockquote;
}

/**
 * Asks Meta for the post's embed and keeps only its blockquote: no script, no
 * caption, no thumbnail, no author or title. Anything else, including Meta's
 * error for a private, deleted or embed-disabled post, gives the link card.
 */
export async function loadInstagramEmbed(
  url: string,
  fetchImpl: Fetch = fetch,
): Promise<InstagramEmbed> {
  const parsed = parseReferenceUrl(url);
  if ("error" in parsed || parsed.platform !== "instagram")
    return { kind: "link" };

  const request = new URL(INSTAGRAM_OEMBED_ENDPOINT);
  request.searchParams.set("url", parsed.embedUrl);
  request.searchParams.set("omitscript", "true");
  request.searchParams.set("hidecaption", "true");
  request.searchParams.set("maxwidth", "540");

  try {
    const response = await fetchImpl(request.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { kind: "link" };
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("html" in body))
      return { kind: "link" };
    const html = (body as { html: unknown }).html;
    if (typeof html !== "string") return { kind: "link" };
    const blockquote = extractBlockquote(html);
    return blockquote === null
      ? { kind: "link" }
      : { kind: "embed", blockquote };
  } catch {
    return { kind: "link" };
  }
}
