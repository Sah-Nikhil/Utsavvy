import { instagramEmbedPage, isFramed } from "@/lib/references/embedPage";
import { loadInstagramEmbed } from "@/lib/references/instagram";
import { parseReferenceUrl } from "@/lib/references/parse";

// The isolated Instagram page (ADR 0014). The server asks Meta's oEmbed for the
// post's blockquote on each view and stores nothing; Instagram's `embed.js`
// then draws it, here only, inside the card's iframe. Opened any other way,
// the page asks Meta nothing and shows only the link.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  const parsed = url === null ? null : parseReferenceUrl(url);
  const link =
    parsed !== null && !("error" in parsed) && parsed.platform === "instagram"
      ? parsed.embedUrl
      : null;
  const embed =
    link === null || !isFramed(request)
      ? { kind: "link" as const }
      : await loadInstagramEmbed(link);
  const html = instagramEmbedPage({
    link,
    blockquote: embed.kind === "embed" ? embed.blockquote : null,
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
