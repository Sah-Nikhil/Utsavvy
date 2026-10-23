import { escapeHtml } from "./embedPage";
import { parseReferenceUrl } from "./parse";

/**
 * Meta's tokenless Instagram oEmbed (ADR 0014). Only the `/embed/instagram`
 * page calls it, on the server, once per view. Its answer only decides whether
 * the post can be embedded and gives the version number; none of it is
 * rendered or stored. The request goes to Meta's API, never to the Member's
 * link.
 */
export const INSTAGRAM_OEMBED_ENDPOINT =
  "https://graph.facebook.com/v25.0/instagram_oembed";

export type InstagramEmbed =
  { kind: "embed"; blockquote: string } | { kind: "link" };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 5000;

/** Meta's `data-instgrm-version`, read from its answer only as a number. */
const VERSION_ATTRIBUTE = /\sdata-instgrm-version\s*=\s*"([^"]*)"/i;
const VERSION = /^\d{1,3}$/;

/**
 * The placeholder `embed.js` turns into the post, built by Utsavvy from the
 * validated post link, with the width Meta's own embed code uses. Meta's own HTML is never rendered (ADR 0014): the
 * oEmbed answer only confirms the post can be embedded and gives the version.
 */
export function instagramBlockquote(
  embedUrl: string,
  version: string | null,
): string {
  const link = escapeHtml(embedUrl);
  const versionAttribute =
    version !== null && VERSION.test(version)
      ? ` data-instgrm-version="${version}"`
      : "";
  return `<blockquote class="instagram-media" data-instgrm-permalink="${link}"${versionAttribute} style="margin:1px auto;max-width:540px;min-width:326px;width:calc(100% - 2px)"><a href="${link}" target="_blank" rel="noopener noreferrer">View this post on Instagram</a></blockquote>`;
}

/**
 * Asks Meta whether the post can be embedded. A yes gives Utsavvy's own
 * blockquote for it, carrying only Meta's version number; nothing else from
 * the answer (its HTML, script, caption, thumbnail, author or title) is kept.
 * Anything else, including Meta's error for a private, deleted or
 * embed-disabled post, gives the link card.
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
    const version = VERSION_ATTRIBUTE.exec(html)?.[1] ?? null;
    return {
      kind: "embed",
      blockquote: instagramBlockquote(parsed.embedUrl, version),
    };
  } catch {
    return { kind: "link" };
  }
}
