import {
  parseReferenceUrl,
  platformName,
  type ReferencePlatform,
} from "./parse";

/**
 * The isolated pages `/embed/pinterest` and `/embed/instagram` (ADR 0014).
 * Each is a small standalone HTML document, served by a route handler instead
 * of a React page so that none of the app (Clerk, Convex, our React tree) loads
 * inside the iframe, and Pinterest's and Instagram's scripts see only this
 * page. `next.config.ts` gives `/embed/*` its own Content Security Policy.
 *
 * The page tells the card that holds it how tall it is, and when the widget
 * can't draw the post, it shows a plain link and says so:
 * - `{ type: "utsavvy-embed-height", height }` whenever its height changes;
 * - `{ type: "utsavvy-embed-fallback" }` once, when it falls back to the link.
 */

export const EMBED_HEIGHT_MESSAGE = "utsavvy-embed-height";
export const EMBED_FALLBACK_MESSAGE = "utsavvy-embed-fallback";

export const PINTEREST_SCRIPT = "https://assets.pinterest.com/js/pinit.js";
export const INSTAGRAM_SCRIPT = "https://www.instagram.com/embed.js";

/** How long a widget has to draw before the page shows the link instead. */
const WIDGET_TIMEOUT_MS = 10_000;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type PageConfig = {
  /** The platform's widget script, or null to show the link straight away. */
  script: string | null;
  platform: ReferencePlatform;
};

/** JSON safe to place inside an inline script. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/**
 * Runs inside the embed page. Sizes the Pinterest widget to the frame, loads
 * the platform's script, reports the page height to the parent card, and falls
 * back to the link when the script fails or the widget draws nothing in time.
 */
function pageScript(config: PageConfig): string {
  return `(function () {
  var config = ${inlineJson(config)};
  var embed = document.getElementById("embed");
  var fallback = document.getElementById("fallback");
  var settled = false;
  function post(message) {
    if (window.parent !== window) window.parent.postMessage(message, location.origin);
  }
  function report() {
    post({ type: "${EMBED_HEIGHT_MESSAGE}", height: Math.ceil(document.body.getBoundingClientRect().height) });
  }
  function showLink() {
    if (settled) return;
    settled = true;
    embed.hidden = true;
    fallback.hidden = false;
    post({ type: "${EMBED_FALLBACK_MESSAGE}" });
    report();
  }
  function drawn() {
    var widget = config.platform === "pinterest"
      ? embed.querySelector("[class^='PIN_'], [class*=' PIN_']")
      : embed.querySelector("iframe");
    return widget !== null && embed.getBoundingClientRect().height >= 80;
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(report).observe(document.body);
  report();
  if (config.script === null) { showLink(); return; }

  var anchor = embed.querySelector("a[data-pin-do]");
  if (anchor !== null) {
    var width = document.documentElement.clientWidth;
    if (anchor.getAttribute("data-pin-do") === "embedPin") {
      anchor.setAttribute("data-pin-width", width >= 600 ? "large" : width >= 345 ? "medium" : "small");
    } else {
      anchor.setAttribute("data-pin-board-width", String(Math.max(150, width - 2)));
      anchor.setAttribute("data-pin-scale-height", "240");
      anchor.setAttribute("data-pin-scale-width", "80");
    }
  }

  var started = Date.now();
  var poll = setInterval(function () {
    if (settled) { clearInterval(poll); return; }
    if (drawn()) { settled = true; clearInterval(poll); report(); return; }
    if (Date.now() - started > ${WIDGET_TIMEOUT_MS}) { clearInterval(poll); showLink(); }
  }, 250);

  var script = document.createElement("script");
  script.async = true;
  script.src = config.script;
  script.onerror = function () { clearInterval(poll); showLink(); };
  document.body.appendChild(script);
})();`;
}

function page(args: {
  title: string;
  embedHtml: string;
  link: string | null;
  config: PageConfig;
}): string {
  const name = platformName(args.config.platform);
  const fallback =
    args.link === null
      ? `<p>This link can't be previewed.</p>`
      : `<p>The preview from ${name} isn't available.</p><p><a href="${escapeHtml(args.link)}" target="_blank" rel="noopener noreferrer">Open on ${name}</a></p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(args.title)}</title>
<style>
html, body { margin: 0; background: transparent; }
body { font: 15px/1.45 system-ui, sans-serif; color: CanvasText; overflow: hidden; }
#embed { display: flex; justify-content: center; }
#fallback { padding: 8px 2px; }
#fallback p { margin: 0 0 6px; }
#fallback a { color: LinkText; text-underline-offset: 3px; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<div id="embed">${args.embedHtml}</div>
<div id="fallback" hidden>${fallback}</div>
<script>${pageScript(args.config)}</script>
</body>
</html>`;
}

/**
 * Whether the request is the card's iframe loading the page. Opened any other
 * way (a link, a new tab), the page loads no platform script and shows only
 * the link, so Pinterest's and Instagram's scripts never run as a top-level
 * page on our origin. A browser that sends no `Sec-Fetch-Dest` gets the link.
 */
export function isFramed(request: Request): boolean {
  return request.headers.get("sec-fetch-dest") === "iframe";
}

/**
 * The Pinterest page: Pinterest's own `embedPin` or `embedBoard` widget for a
 * full Pin or board link inside the card's iframe, otherwise only the link.
 */
export function pinterestEmbedPage(
  url: string | null,
  options: { framed: boolean } = { framed: true },
): string {
  const parsed = url === null ? null : parseReferenceUrl(url);
  if (
    parsed === null ||
    "error" in parsed ||
    parsed.platform !== "pinterest" ||
    parsed.embedUrl === null ||
    !options.framed
  ) {
    const link =
      parsed !== null && !("error" in parsed) && parsed.platform === "pinterest"
        ? (parsed.embedUrl ?? parsed.url)
        : null;
    return page({
      title: "Pinterest preview",
      embedHtml: "",
      link,
      config: { script: null, platform: "pinterest" },
    });
  }
  const pinDo = parsed.urlKind === "pin" ? "embedPin" : "embedBoard";
  return page({
    title: parsed.urlKind === "pin" ? "Pinterest Pin" : "Pinterest board",
    embedHtml: `<a data-pin-do="${pinDo}" href="${escapeHtml(parsed.embedUrl)}"></a>`,
    link: parsed.embedUrl,
    config: { script: PINTEREST_SCRIPT, platform: "pinterest" },
  });
}

/**
 * The Instagram page: the blockquote Utsavvy builds for the post (see
 * `loadInstagramEmbed`) and Instagram's `embed.js`, or the link when Meta
 * said the post can't be embedded.
 */
export function instagramEmbedPage(args: {
  link: string | null;
  blockquote: string | null;
}): string {
  return page({
    title: "Instagram post",
    embedHtml: args.blockquote ?? "",
    link: args.link,
    config: {
      script:
        args.blockquote === null || args.link === null
          ? null
          : INSTAGRAM_SCRIPT,
      platform: "instagram",
    },
  });
}
