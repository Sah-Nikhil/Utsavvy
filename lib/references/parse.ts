/**
 * Recognises a pasted Pinterest or Instagram link (inspirations.md rule 6,
 * ADR 0014). It only looks at the host and the path: nothing here, and nothing
 * on our server, ever opens the link.
 *
 * - `url` is the link as the Member gave it, without its query string or
 *   fragment (those carry share and tracking codes, not the post), except an
 *   Instagram carousel's `img_index`, which says which slide they meant.
 * - `embedUrl` is the canonical link the platform's widget takes:
 *   `in.pinterest.com` and the other country hosts become `www.pinterest.com`,
 *   and an Instagram link shared with the poster's name in its path becomes
 *   `/p/<code>/` or `/reel/<code>/`. A `pin.it` short link has none, because
 *   Pinterest's widget takes only full Pin links and we never resolve it.
 */

export type ReferencePlatform = "pinterest" | "instagram";

export type ParsedReference =
  | {
      platform: "pinterest";
      urlKind: "pin" | "board";
      url: string;
      embedUrl: string;
    }
  | { platform: "pinterest"; urlKind: "pinShort"; url: string; embedUrl: null }
  | {
      platform: "instagram";
      urlKind: "post" | "reel";
      url: string;
      embedUrl: string;
    };

/**
 * - `invalid`: not a link at all.
 * - `notHttps`: a link that isn't `https:` (including `javascript:` and `data:`).
 * - `notSupported`: a link to another site, or a Pinterest or Instagram page
 *   that isn't a Pin, board, post or Reel (search, ideas, profiles, stories).
 */
export type ReferenceUrlError = "invalid" | "notHttps" | "notSupported";

export type ParseResult = ParsedReference | { error: ReferenceUrlError };

const MAX_LENGTH = 2048;

/** `pinterest.com`, `www.pinterest.com` and two-letter country hosts such as `in.pinterest.com`. */
const PINTEREST_HOST = /^(?:(?:www|[a-z]{2})\.)?pinterest\.com$/;
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

/** First path segments on pinterest.com that are pages, not a person's boards. */
const PINTEREST_RESERVED = new Set([
  "pin",
  "search",
  "ideas",
  "idea",
  "today",
  "explore",
  "discover",
  "categories",
  "topics",
  "business",
  "settings",
  "login",
  "signup",
  "password",
  "about",
  "shopping",
  "videos",
  "news_hub",
  "notifications",
  "messages",
  "homefeed",
  "resource",
  "oauth",
  "_",
]);

const PIN_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Pinterest's titled Pin links: `/pin/<title-words>--<number>/`. */
const PIN_SLUG = /^[A-Za-z0-9_-]{1,200}--(\d{1,30})$/;
const PINTEREST_USER = /^[A-Za-z0-9_]{1,64}$/;
const BOARD_SLUG = /^[A-Za-z0-9_%.-]{1,200}$/;
const SHORT_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const INSTAGRAM_USER = /^[A-Za-z0-9_.]{1,30}$/;
/** First path segments on instagram.com that are pages, never a poster's name. */
const INSTAGRAM_RESERVED = new Set([
  "stories",
  "share",
  "explore",
  "accounts",
  "direct",
]);
/** A carousel's slide number, the one query parameter a stored Instagram link keeps. */
const IMG_INDEX = /^\d{1,2}$/;

/** Path segments, ignoring empty ones from leading, trailing or doubled slashes. */
function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((s) => s !== "");
}

function parsePinterest(
  segments: string[],
  url: string,
): ParsedReference | null {
  const [first, second, third, ...rest] = segments;
  if (first === undefined) return null;

  // /pin/<id>/ and the share form /pin/<id>/sent/
  if (first === "pin") {
    if (second === undefined) return null;
    const id = PIN_SLUG.exec(second)?.[1] ?? second;
    if (!PIN_ID.test(id)) return null;
    if (third !== undefined && !(third === "sent" && rest.length === 0))
      return null;
    return {
      platform: "pinterest",
      urlKind: "pin",
      url,
      embedUrl: `https://www.pinterest.com/pin/${id}/`,
    };
  }

  // /<user>/<board>/: exactly two segments, neither a page nor a profile tab.
  if (
    segments.length === 2 &&
    second !== undefined &&
    !PINTEREST_RESERVED.has(first.toLowerCase()) &&
    PINTEREST_USER.test(first) &&
    !second.startsWith("_") &&
    BOARD_SLUG.test(second)
  ) {
    return {
      platform: "pinterest",
      urlKind: "board",
      url,
      embedUrl: `https://www.pinterest.com/${first}/${second}/`,
    };
  }
  return null;
}

function parseInstagram(
  segments: string[],
  url: string,
): ParsedReference | null {
  if (
    segments[0] !== undefined &&
    INSTAGRAM_RESERVED.has(segments[0].toLowerCase())
  )
    return null;
  // Shared links may carry the poster's name first: /<user>/p/<code>/.
  const rest =
    segments.length === 3 && INSTAGRAM_USER.test(segments[0]!)
      ? segments.slice(1)
      : segments;
  if (rest.length !== 2) return null;
  const [kind, code] = rest as [string, string];
  if (!SHORT_CODE.test(code)) return null;
  if (kind === "p" || kind === "tv") {
    return {
      platform: "instagram",
      urlKind: "post",
      url,
      embedUrl: `https://www.instagram.com/p/${code}/`,
    };
  }
  if (kind === "reel" || kind === "reels") {
    return {
      platform: "instagram",
      urlKind: "reel",
      url,
      embedUrl: `https://www.instagram.com/reel/${code}/`,
    };
  }
  return null;
}

/** Parses a pasted link into a Reference, or says why it can't be one. */
export function parseReferenceUrl(input: string): ParseResult {
  const text = input.trim();
  if (text === "" || text.length > MAX_LENGTH) return { error: "invalid" };

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { error: "invalid" };
  }
  if (parsed.protocol !== "https:") return { error: "notHttps" };
  if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "")
    return { error: "notSupported" };

  const host = parsed.hostname.toLowerCase();
  const segments = segmentsOf(parsed.pathname);
  // The Member's link, minus the query string and fragment.
  const url = `https://${parsed.host}${parsed.pathname}`;

  let result: ParsedReference | null = null;
  if (host === "pin.it") {
    if (segments.length === 1 && SHORT_CODE.test(segments[0]!)) {
      result = {
        platform: "pinterest",
        urlKind: "pinShort",
        url,
        embedUrl: null,
      };
    }
  } else if (PINTEREST_HOST.test(host)) {
    result = parsePinterest(segments, url);
  } else if (INSTAGRAM_HOSTS.has(host)) {
    // A carousel link keeps its slide, so "Open on Instagram" shows the one
    // the Member meant.
    const slide = parsed.searchParams.get("img_index");
    result = parseInstagram(
      segments,
      slide !== null && IMG_INDEX.test(slide)
        ? `${url}?img_index=${slide}`
        : url,
    );
  }
  return result ?? { error: "notSupported" };
}

/** Whether a parse result is a Reference rather than an error. */
export function isParsedReference(
  result: ParseResult,
): result is ParsedReference {
  return !("error" in result);
}

/** "Pinterest" or "Instagram", as the UI and the Assistant name the platform. */
export function platformName(platform: ReferencePlatform): string {
  return platform === "pinterest" ? "Pinterest" : "Instagram";
}
