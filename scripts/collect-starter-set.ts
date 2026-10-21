/**
 * Collects the Jaipur starter set (issue #33) into seed/jaipur-vendors.json, in two steps.
 *
 * 1. fetch: read each candidate page politely and cache its text.
 *      bun scripts/collect-starter-set.ts fetch <candidates.txt> <cacheDir>
 *    <candidates.txt> holds one page URL per line (`#` starts a comment), at most 4 per
 *    site. Every request goes through politeFetch with our User-Agent, obeys robots.txt
 *    and waits about a second between requests to the same host.
 *
 *    TODO(Phase B): how candidate URLs are found and which sources may be read is being
 *    revisited. Until then this file is filled by hand and is the only input; nothing
 *    here searches the web.
 *
 * 2. check: quote-check drafted Vendor records against the cached text and geocode them.
 *      bun --env-file=C:\Programming\SELF\0Web\PromptWars\Events\.env.local scripts/collect-starter-set.ts check <drafts.json> <cacheDir> <out.json>
 *    <drafts.json> is an array of `Vendor` records without `marker`, each fact citing
 *    the page and exact sentence it came from. Facts whose sentence isn't on the cached
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
/** Vendor fields read from the Vendor's site; each needs provenance with its sentence. */
export const FACT_FIELDS = [
  "name",
  "address",
  "phone",
  "email",
  "capacity",
  "areaServed",
] as const;

type FactField = (typeof FACT_FIELDS)[number];
type Range = { min: number; max: number };
type Provenance = { url: string; seenAt: string; sentence: string };

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
  website: string;
  address?: { line: string; locality: string; city: string };
  phone?: string;
  email?: string;
  capacity?: Range;
  areaServed?: string;
  summary: string;
  marker?: Marker;
  provenance: Partial<Record<FactField, Provenance>>;
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
  const vendor: Vendor = { ...draft, provenance: { ...draft.provenance } };
  for (const field of FACT_FIELDS) {
    if (vendor[field] === undefined) continue;
    const source = vendor.provenance[field];
    if (source && onPage(source.url, source.sentence)) continue;
    dropped.push(`${draft.domain} ${field}`);
    delete vendor[field];
    delete vendor.provenance[field];
  }
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
    const [, key, value] = match;
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
          name[1].toLowerCase() === "x"
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

/** Geoapify forward geocoding, limited to India and biased to Jaipur. */
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
  return results?.[0] && toMarker(results[0]);
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
  skipped?: string;
};
const today = () => new Date().toISOString().slice(0, 10);

async function fetchStep(candidatesPath: string, cacheDir: string) {
  const sites = new Map<string, string[]>();
  for (const line of (await readFile(candidatesPath, "utf8")).split(/\r?\n/)) {
    const url = line.replace(/#.*/, "").trim();
    if (url)
      sites.set(domainOf(url), [...(sites.get(domainOf(url)) ?? []), url]);
  }
  const pages: Record<string, PageEntry> = {};
  const stats = {
    sites: sites.size,
    directorySites: 0,
    pagesOverLimit: 0,
    robotsDisallowed: 0,
    pagesAttempted: 0,
    pagesFetched: 0,
  };
  const robots = new Map<string, (path: string) => boolean>();

  for (const [domain, urls] of sites) {
    if (isDirectory(domain)) {
      stats.directorySites++;
      continue;
    }
    stats.pagesOverLimit += Math.max(0, urls.length - PAGES_PER_SITE);
    for (const url of urls.slice(0, PAGES_PER_SITE)) {
      const { origin, pathname, search } = new URL(url);
      if (!robots.has(origin)) robots.set(origin, await robotsFor(origin));
      if (!robots.get(origin)!(pathname + search)) {
        stats.robotsDisallowed++;
        pages[url] = { url, skipped: "disallowed by robots.txt" };
        continue;
      }
      stats.pagesAttempted++;
      try {
        const res = await paced(url);
        const readable = /html|text\/plain/i.test(res.contentType);
        const ownSite = domainOf(res.finalUrl) === domain;
        const ok = res.status >= 200 && res.status < 300 && readable && ownSite;
        pages[url] = {
          url,
          finalUrl: res.finalUrl,
          status: res.status,
          fetchedAt: today(),
          text: ok
            ? /html/i.test(res.contentType)
              ? htmlToText(res.text)
              : normalise(res.text)
            : undefined,
          skipped: ok
            ? undefined
            : !ownSite
              ? "redirected off the site"
              : `HTTP ${res.status} ${res.contentType}`,
        };
        if (ok) stats.pagesFetched++;
        // shortcut: no Jina Reader retry for JavaScript-only pages yet; add it if Phase B needs it.
        if (res.status === 403 || res.status === 429) break; // the site refused us: leave it alone
      } catch (error) {
        pages[url] = { url, skipped: (error as Error).message };
      }
    }
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    join(cacheDir, "pages.json"),
    JSON.stringify(pages, null, 2) + "\n",
  );
  console.log(JSON.stringify(stats, null, 2));
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
      vendor.marker = await geocode(`${line}, ${locality}, ${city}`, apiKey);
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
  if (step === "fetch" && args.length === 2) return fetchStep(args[0], args[1]);
  if (step === "check" && args.length === 3)
    return checkStep(args[0], args[1], args[2]);
  console.error(
    "Usage: see the comment at the top of scripts/collect-starter-set.ts",
  );
  process.exitCode = 1;
}

if (import.meta.main) await main(process.argv.slice(2));
