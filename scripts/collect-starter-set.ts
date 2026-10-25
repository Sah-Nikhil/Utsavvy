/**
 * Collects the Jaipur starter set (issue #33) into seed/jaipur-vendors.json, in two steps.
 *
 * 1. fetch: read each candidate page politely and cache its text.
 *      bun scripts/collect-starter-set.ts fetch <candidates.txt> <cacheDir>
 *    <candidates.txt> holds one page URL per line (`#` starts a comment), at most 4 per
 *    site. Every request goes through politeFetch with our User-Agent, obeys robots.txt
 *    and waits about a second between requests to the same host.
 *
 *    The agent fills this file from its own web search, keeping only the result URLs of
 *    Vendors' own sites. Directories, Google Places and social sites are never read
 *    (`isDirectory` refuses them); nothing here searches the web or opens Instagram.
 *
 * 2. check: quote-check drafted Vendor records against the cached text and geocode them.
 *      bun --env-file=C:\Programming\SELF\0Web\PromptWars\Events\.env.local scripts/collect-starter-set.ts check <drafts.json> <cacheDir> <out.json>
 *    <drafts.json> is an array of `Vendor` records without `marker`, each `ownSite` fact
 *    citing the page and exact sentence it came from. Instagram-only Vendors typed in by
 *    Sah-Nikhil (see seed/README.md) pass through without a page. Facts whose sentence isn't on the cached
 *    page are dropped. Prints the rates seed/README.md records. Needs GEOAPIFY_API_KEY.
 *
 * Keep <cacheDir> outside the repo: it holds copies of Vendors' pages.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { politeFetch } from "../lib/fetch/politeFetch";

export const UNITS = [
  "per_plate",
  "per_person",
  "per_day",
  "per_function",
] as const;
/** Vendor fields that each need a provenance entry. */
export const FACT_FIELDS = [
  "name",
  "address",
  "phone",
  "email",
  "capacity",
  "areaServed",
] as const;

export type FactField = (typeof FACT_FIELDS)[number];
type Range = { min: number; max: number };
/**
 * One entry per filled field. `ownSite` facts keep the exact sentence from the page,
 * which the quote check looks for. `instagramProfileHumanChecked` facts were read off a
 * public Instagram profile by Sah-Nikhil and have no sentence; nothing here opens it.
 */
export type Provenance = {
  field: FactField;
  url: string;
  seenAt: string;
} & (
  | { kind: "ownSite"; sentence: string; confirmedBy: null }
  | {
      kind: "instagramProfileHumanChecked";
      sentence: null;
      confirmedBy: "Sah-Nikhil";
    }
);

export type ListedPrice = {
  sourceUrl: string;
  sentence: string;
  seenAt: string;
  comparable: boolean;
  amount?: Range;
  unit?: (typeof UNITS)[number];
  qualifier?: "exact" | "approx" | "starting";
  diet?: "veg" | "non-veg" | "either";
  guestRange?: Range;
  inclusionsNote?: string;
  text: string;
};

export type Marker = {
  lat: number;
  lng: number;
  confidence: number;
  matchType: string;
  approximate: boolean;
  provider: "geoapify";
  attribution: string;
};

/** The `vendors` table row without its ID, with its `listedPrices` rows nested. */
export type Vendor = {
  domain: string;
  name: string;
  category: "venue" | "caterer" | "decorator" | "photographer";
  /** Null for an Instagram-only Vendor, whose `domain` is `instagram.com/<handle>`. */
  website: string | null;
  /** The Instagram profile, for an Instagram-only Vendor only. */
  profileUrl?: string;
  address?: { line: string; locality: string; city: string };
  phone?: string;
  email?: string;
  /** Guests; `min` only when the site states one ("200 to 400"), not for "up to 500". */
  capacity?: { min?: number; max: number };
  areaServed?: string;
  summary: string;
  marker?: Marker;
  provenance: Provenance[];
  factsSeenAt: string;
  source: "starterSet";
  listedPrices: ListedPrice[];
};

// Directories, marketplaces and social sites from docs/design/vendors.md, matched as
// a label of the hostname so subdomains and country domains are caught too.
const DIRECTORIES = [
  "wedmegood",
  "weddingwire",
  "venuelook",
  "venuemonk",
  "shaadisaga",
  "weddingbazaar",
  "justdial",
  "sulekha",
  "indiamart",
  "zomato",
  "tripadvisor",
  "magicpin",
  "instagram",
  "facebook",
  "youtube",
  "pinterest",
  "linkedin",
  "google",
  // Listing and marketplace sites met while collecting the starter set.
  "bookeventz",
  "weddingz",
  "wedding", // wedding.net
  "mandap",
  "venuebookingz",
  "jaipurrental",
  "partykaro",
  "sloshout",
  "zoopgo",
  "servicebazzar",
  "shaadidukaan",
  "exportersindia",
  "tradeindia",
  "eternalweddingz",
  "bandbaajabarat",
  "myeventz",
  "theweddingcompany",
  "wedclub",
  "quora",
];

export const domainOf = (url: string) =>
  new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(
    /^www\./,
    "",
  );
export const isDirectory = (urlOrDomain: string) =>
  domainOf(urlOrDomain)
    .split(".")
    .some((label) => DIRECTORIES.includes(label));

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();
export const hasCurrency = (sentence: string) =>
  /₹|\b(?:rs|inr)\b\.?/i.test(sentence) || /\brs(?=\d)/i.test(sentence);

/** True when `amount` is written in the sentence: 150000, 1,50,000, 150k, 1.5 lakh or 1.5L. */
export function sentenceHasAmount(sentence: string, amount: number) {
  const plain = sentence.replace(/(?<=\d),(?=\d)/g, "");
  for (const [, digits, suffix = ""] of plain.matchAll(
    /(\d+(?:\.\d+)?)\s*(k|lakhs?|lacs?|l)?(?![a-z\d])/gi,
  )) {
    const scale = /^k$/i.test(suffix) ? 1_000 : suffix ? 100_000 : 1;
    if (Math.round(Number(digits) * scale) === amount) return true;
  }
  return false;
}

/**
 * Keeps a fact only when its recorded sentence is on the page it cites (after
 * whitespace normalisation), and a price only when its amount and currency are in
 * that sentence too. `pages` maps a page URL to its fetched text.
 */
export function quoteCheck(draft: Vendor, pages: Map<string, string>) {
  const dropped: string[] = [];
  const onPage = (url: string, sentence: string) => {
    const text = pages.get(url);
    return text !== undefined && normalise(text).includes(normalise(sentence));
  };
  const vendor: Vendor = { ...draft };
  for (const field of FACT_FIELDS) {
    if (vendor[field] === undefined) continue;
    const source = vendor.provenance.find((p) => p.field === field);
    if (source?.kind === "instagramProfileHumanChecked") continue;
    if (source && onPage(source.url, source.sentence)) continue;
    dropped.push(`${draft.domain} ${field}`);
    delete vendor[field];
  }
  vendor.provenance = draft.provenance.filter(
    (p) => vendor[p.field] !== undefined,
  );
  vendor.listedPrices = draft.listedPrices.filter((p) => {
    const ok =
      onPage(p.sourceUrl, p.sentence) &&
      hasCurrency(p.sentence) &&
      (!p.amount ||
        (sentenceHasAmount(p.sentence, p.amount.min) &&
          sentenceHasAmount(p.sentence, p.amount.max)));
    if (!ok) dropped.push(`${draft.domain} price: ${p.sentence}`);
    return ok;
  });
  return { vendor: vendor.name === undefined ? undefined : vendor, dropped };
}

export const USER_AGENT =
  "UtsavvyBot/1.0 (+https://github.com/Sah-Nikhil/Utsavvy)";
const ROBOTS_TOKEN = "utsavvybot";

/**
 * A minimal RFC 9309 robots.txt reader: our group (else `*`), `*` and `$` in paths,
 * the longest matching rule wins and Allow wins a tie. Returns `allowed(pathAndQuery)`.
 */
export function parseRobots(text: string) {
  type Group = {
    agents: string[];
    rules: { allow: boolean; pattern: string }[];
  };
  const groups: Group[] = [];
  let current: Group | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const match = raw
      .replace(/#.*/, "")
      .match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key = "", value = ""] = match;
    const field = key.toLowerCase();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0)
        groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if (
      current &&
      (field === "allow" || field === "disallow") &&
      value !== ""
    ) {
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  const ours = groups.filter((g) => g.agents.includes(ROBOTS_TOKEN));
  const rules = (
    ours.length ? ours : groups.filter((g) => g.agents.includes("*"))
  ).flatMap((g) => g.rules);
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toRegExp = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split("*")
      .map(escape)
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`);
  };
  return (path: string) => {
    if (path === "/robots.txt") return true;
    let best: { allow: boolean; pattern: string } | undefined;
    for (const rule of rules) {
      if (!toRegExp(rule.pattern).test(path)) continue;
      const longer = !best || rule.pattern.length > best.pattern.length;
      const tieAllow =
        best && rule.pattern.length === best.pattern.length && rule.allow;
      if (longer || tieAllow) best = rule;
    }
    return best?.allow ?? true;
  };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};
const BLOCK_TAGS =
  /^\/?(p|div|br|hr|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|main|aside|title|option|dd|dt)\b/i;

/** The visible text of an HTML page, whitespace-normalised, for the quote check. */
export function htmlToText(html: string) {
  return normalise(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      // Block tags separate words; inline tags like <b> don't, so "₹<b>850</b>" stays "₹850".
      .replace(/<([^>]*)>/g, (_, tag: string) =>
        BLOCK_TAGS.test(tag) ? " " : "",
      )
      .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
        if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? entity;
        const code =
          name[1]!.toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : Number(name.slice(1));
        return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }),
  );
}

type GeoapifyResult = {
  lat: number;
  lon: number;
  result_type: string;
  rank: { confidence: number; match_type: string };
};
const JAIPUR = { lat: 26.9124, lng: 75.7873 };
// Result types coarser than a street: a Marker there is only roughly right.
const COARSE = new Set([
  "country",
  "state",
  "county",
  "city",
  "district",
  "suburb",
  "postcode",
]);

export const toMarker = (result: GeoapifyResult): Marker => ({
  lat: result.lat,
  lng: result.lon,
  confidence: result.rank.confidence,
  matchType: result.rank.match_type,
  approximate: result.rank.confidence < 0.8 || COARSE.has(result.result_type),
  provider: "geoapify",
  attribution: "© OpenStreetMap contributors, Geoapify",
});

/** Within 50 km of central Jaipur (flat-earth distance is fine at this scale). */
export function nearJaipur(lat: number, lng: number) {
  const km = 111.32;
  const dx = (lng - JAIPUR.lng) * km * Math.cos((JAIPUR.lat * Math.PI) / 180);
  const dy = (lat - JAIPUR.lat) * km;
  return Math.hypot(dx, dy) <= 50;
}

/**
 * Geoapify forward geocoding, limited to India and biased to Jaipur. A match
 * outside Jaipur is no match: the Vendor gets no Marker rather than a wrong one.
 */
export async function geocode(text: string, apiKey: string) {
  const query = new URLSearchParams({
    text,
    filter: "countrycode:in",
    bias: `proximity:${JAIPUR.lng},${JAIPUR.lat}`,
    format: "json",
    limit: "1",
    apiKey,
  });
  const res = await fetch(
    `https://api.geoapify.com/v1/geocode/search?${query}`,
  );
  // Never put the request URL in an error or log: it carries the API key.
  if (!res.ok) throw new Error(`Geoapify geocoding failed: HTTP ${res.status}`);
  const { results } = (await res.json()) as { results?: GeoapifyResult[] };
  const top = results?.[0];
  return top && nearJaipur(top.lat, top.lon) ? toMarker(top) : undefined;
}

const PAGES_PER_SITE = 4;
const HOST_DELAY_MS = 1_000;
const lastRequest = new Map<string, number>();

/** politeFetch with our User-Agent, one request at a time per host, about a second apart. */
async function paced(url: string) {
  const host = new URL(url).host;
  const wait = (lastRequest.get(host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  try {
    return await politeFetch(url, { userAgent: USER_AGENT });
  } finally {
    lastRequest.set(host, Date.now());
  }
}

async function robotsFor(origin: string): Promise<(path: string) => boolean> {
  try {
    const res = await paced(`${origin}/robots.txt`);
    if (res.status >= 200 && res.status < 300) return parseRobots(res.text);
    if (res.status >= 400 && res.status < 500) return () => true; // RFC 9309: no robots.txt, no limits
  } catch {
    // unreachable: fall through
  }
  return () => false; // RFC 9309: unreachable robots.txt means fully disallowed
}

type PageEntry = {
  url: string;
  finalUrl?: string;
  status?: number;
  fetchedAt?: string;
  text?: string;
  /** Same-site links on the page, to choose up to 3 more pages from. */
  links?: string[];
  skipped?: string;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Same-site links in an HTML page, for choosing its price, menu or contact pages. */
function sameSiteLinks(html: string, base: string) {
  const links = new Set<string>();
  for (const [, href] of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)/gi,
  )) {
    try {
      const url = new URL(href!.replace(/&amp;/g, "&"), base);
      if (
        /^https?:$/.test(url.protocol) &&
        domainOf(url.href) === domainOf(base)
      )
        links.add(url.href);
    } catch {
      // not a URL
    }
  }
  return [...links].slice(0, 60);
}

async function fetchStep(candidatesPath: string, cacheDir: string) {
  const cachePath = join(cacheDir, "pages.json");
  // Runs add to the cache, so a site's first page can be read before choosing its others.
  const pages: Record<string, PageEntry> = await readFile(cachePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({}));
  const sites = new Map<string, string[]>();
  for (const line of (await readFile(candidatesPath, "utf8")).split(/\r?\n/)) {
    const url = line.replace(/#.*/, "").trim();
    if (url)
      sites.set(domainOf(url), [...(sites.get(domainOf(url)) ?? []), url]);
  }
  let directorySites = 0;
  let pagesOverLimit = 0;
  const robots = new Map<string, (path: string) => boolean>();

  for (const [domain, urls] of sites) {
    if (isDirectory(domain)) {
      directorySites++;
      continue;
    }
    const read = Object.values(pages).filter(
      (p) => domainOf(p.url) === domain && p.status !== undefined,
    );
    const fresh = urls.filter((url) => !pages[url]);
    const room = Math.max(0, PAGES_PER_SITE - read.length);
    pagesOverLimit += Math.max(0, fresh.length - room);
    for (const url of fresh.slice(0, room)) {
      const { origin, pathname, search } = new URL(url);
      if (!robots.has(origin)) robots.set(origin, await robotsFor(origin));
      if (!robots.get(origin)!(pathname + search)) {
        pages[url] = { url, skipped: "disallowed by robots.txt" };
        continue;
      }
      try {
        const res = await paced(url);
        const html = /html/i.test(res.contentType);
        const readable = html || /text\/plain/i.test(res.contentType);
        const ownSite = domainOf(res.finalUrl) === domain;
        const ok = res.status >= 200 && res.status < 300 && readable && ownSite;
        pages[url] = {
          url,
          finalUrl: res.finalUrl,
          status: res.status,
          fetchedAt: today(),
          text: ok
            ? html
              ? htmlToText(res.text)
              : normalise(res.text)
            : undefined,
          links: ok && html ? sameSiteLinks(res.text, res.finalUrl) : undefined,
          skipped: ok
            ? undefined
            : !ownSite
              ? "redirected off the site"
              : `HTTP ${res.status} ${res.contentType}`,
        };
        // shortcut: no Jina Reader retry for JavaScript-only pages yet; add it if Phase B needs it.
        if (res.status === 403 || res.status === 429) break; // the site refused us: leave it alone
      } catch (error) {
        pages[url] = { url, status: 0, skipped: (error as Error).message };
      }
    }
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(pages, null, 2) + "\n");
  const entries = Object.values(pages);
  const attempted = entries.filter((p) => p.status !== undefined);
  console.log(
    JSON.stringify(
      {
        directorySitesSkipped: directorySites,
        pagesOverLimit,
        sites: new Set(entries.map((p) => domainOf(p.url))).size,
        robotsDisallowed: entries.filter(
          (p) => p.skipped === "disallowed by robots.txt",
        ).length,
        pagesAttempted: attempted.length,
        pagesFetched: attempted.filter((p) => p.text !== undefined).length,
      },
      null,
      2,
    ),
  );
}

async function checkStep(
  draftsPath: string,
  cacheDir: string,
  outPath: string,
) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey)
    throw new Error(
      "GEOAPIFY_API_KEY is not set: run with bun --env-file=<path to .env.local>",
    );
  const drafts: Vendor[] = JSON.parse(await readFile(draftsPath, "utf8"));
  const cache: Record<string, PageEntry> = JSON.parse(
    await readFile(join(cacheDir, "pages.json"), "utf8"),
  );
  const pages = new Map<string, string>();
  for (const entry of Object.values(cache))
    if (entry.text !== undefined)
      for (const url of [entry.url, entry.finalUrl])
        if (url) pages.set(url, entry.text);

  const vendors: Vendor[] = [];
  const dropped: string[] = [];
  let addresses = 0;
  let exactMarkers = 0;
  for (const draft of drafts) {
    const checked = quoteCheck(draft, pages);
    dropped.push(...checked.dropped);
    const vendor = checked.vendor;
    if (!vendor) continue;
    if (vendor.address) {
      addresses++;
      const { line, locality, city } = vendor.address;
      vendor.marker = await geocode(
        `${line}, ${locality}, ${city}, Rajasthan`,
        apiKey,
      );
      if (vendor.marker && !vendor.marker.approximate) exactMarkers++;
    }
    vendors.push(vendor);
  }
  await writeFile(outPath, JSON.stringify(vendors, null, 2) + "\n");

  const factsChecked = drafts.reduce(
    (n, d) =>
      n +
      FACT_FIELDS.filter((f) => d[f] !== undefined).length +
      d.listedPrices.length,
    0,
  );
  console.log(
    JSON.stringify(
      {
        drafts: drafts.length,
        vendorsKept: vendors.length,
        factsChecked,
        factsDropped: dropped.length,
        addressesGeocoded: addresses,
        exactMarkers,
        addressMatchRate: addresses ? exactMarkers / addresses : null,
        dropped,
      },
      null,
      2,
    ),
  );
}

async function main([step, ...args]: string[]) {
  if (step === "fetch" && args.length === 2)
    return fetchStep(args[0]!, args[1]!);
  if (step === "check" && args.length === 3)
    return checkStep(args[0]!, args[1]!, args[2]!);
  console.error(
    "Usage: see the comment at the top of scripts/collect-starter-set.ts",
  );
  process.exitCode = 1;
}

if (import.meta.main) await main(process.argv.slice(2));
