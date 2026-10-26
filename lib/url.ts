/**
 * A stored URL (a Listed price's page, a Vendor's own site or profile) as a
 * link target, or null when it isn't an http or https URL. Anything else, such
 * as `javascript:`, `data:` or text that doesn't parse, is shown as plain text
 * and never put in an `href`.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed.href
    : null;
}
