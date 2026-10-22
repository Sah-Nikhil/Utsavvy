import { pinterestEmbedPage } from "@/lib/references/embedPage";

// The isolated Pinterest page (ADR 0014). Pinterest's `pinit.js` runs only
// here, inside the card's iframe, under the `/embed/*` Content Security Policy.
// The server never opens the Member's link: it only writes Pinterest's anchor.
export function GET(request: Request): Response {
  const url = new URL(request.url).searchParams.get("url");
  return new Response(pinterestEmbedPage(url), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
