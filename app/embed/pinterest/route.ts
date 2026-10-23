import {
  boardHeightFromParam,
  isFramed,
  pinterestEmbedPage,
} from "@/lib/references/embedPage";

// The isolated Pinterest page (ADR 0014). Pinterest's `pinit.js` runs only
// here, inside the card's iframe, under the `/embed/*` Content Security Policy.
// The server never opens the Member's link: it only writes Pinterest's anchor.
// Opened outside the card's iframe, the page shows only the link.
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const url = params.get("url");
  const page = pinterestEmbedPage(url, {
    framed: isFramed(request),
    boardHeight: boardHeightFromParam(params.get("height")),
  });
  return new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
