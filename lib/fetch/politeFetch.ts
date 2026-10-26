import type { LookupAddress } from "node:dns";
import { lookup as lookupHost } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, BlockList } from "node:net";

export type FetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
};

// Loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT,
// documentation, multicast and reserved ranges. Anything not listed is public.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 127], // :: and ::1 (IPv4-mapped addresses are matched against the IPv4 rules by Node)
  ["64:ff9b::", 96], // NAT64, can embed a private IPv4 address
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4, can embed a private IPv4 address
  ["fc00::", 7], // unique local, incl. AWS metadata fd00:ec2::254
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

function assertPublic(address: string) {
  const family = isIP(address);
  if (family === 0 || blocked.check(address, family === 6 ? "ipv6" : "ipv4"))
    throw new Error(`politeFetch: blocked address ${address}`);
}

export type Lookup = (hostname: string) => Promise<LookupAddress[]>;

const systemLookup: Lookup = (hostname) => lookupHost(hostname, { all: true });

/** Rejects with the signal's reason if it aborts before `promise` settles. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .finally(() => signal.removeEventListener("abort", onAbort))
      .then(resolve, reject);
  });
}

/** Resolves the host once and returns an address that passed the guard. */
async function resolvePublic(
  hostname: string,
  lookup: Lookup,
  signal: AbortSignal,
) {
  if (isIP(hostname)) {
    assertPublic(hostname);
    return hostname;
  }
  // A resolver that stalls must not hold the call past its deadline.
  const addresses = await untilAborted(lookup(hostname), signal);
  if (addresses.length === 0)
    throw new Error(`politeFetch: ${hostname} did not resolve`);
  // Refuse if any address is internal, so a mixed answer can't be raced.
  for (const { address } of addresses) assertPublic(address);
  return addresses[0]!.address;
}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8_000; // for the whole call, redirects included

/** Refuses a URL whose scheme or port the guard doesn't allow. */
function checkScheme(target: URL) {
  if (target.protocol !== "http:" && target.protocol !== "https:")
    throw new Error(`politeFetch: scheme ${target.protocol} not allowed`);
  // URL drops a port that is the scheme's default, so any port left is refused.
  if (target.port !== "")
    throw new Error(`politeFetch: port ${target.port} not allowed`);
}

function get(
  target: URL,
  address: string,
  userAgent: string,
  signal: AbortSignal,
) {
  const https = target.protocol === "https:";
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  return new Promise<{ res: IncomingMessage; body: Buffer }>(
    (resolve, reject) => {
      const fail = (error: Error) =>
        reject(signal.aborted ? signal.reason : error);
      // Dial the checked address directly; Host and SNI carry the real name.
      const req = (https ? httpsRequest : httpRequest)(
        {
          host: address,
          port: https ? 443 : 80,
          path: target.pathname + target.search,
          headers: {
            Host: target.host,
            "User-Agent": userAgent,
            Accept: "text/html,*/*;q=0.8",
          },
          servername: https && !isIP(hostname) ? hostname : undefined,
          signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BYTES) {
              req.destroy();
              reject(
                new Error(`politeFetch: ${target.href} is larger than 2 MB`),
              );
            } else chunks.push(chunk);
          });
          res.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
          res.on("error", fail);
        },
      );
      req.on("error", fail);
      req.end();
    },
  );
}

export type PoliteFetchOptions = {
  userAgent: string;
  lookup?: Lookup;
  /**
   * Called before every request, the first URL and each redirect hop, after the
   * scheme and port checks and before the host is looked up. Throw to refuse the
   * hop: no request is made and politeFetch rejects with that error. Callers use it
   * for their own source rules, robots.txt and pacing; the SSRF guard still runs
   * at every hop after it. This callback shares the whole-call 8 s deadline.
   */
  beforeHop?: (url: URL) => void | Promise<void>;
};

/**
 * GET a public web page with the SSRF guard from IMPLEMENTATION_PLAN.md section 4.9
 * applied to the URL and every redirect hop. Throws when a guard or limit trips;
 * returns any HTTP status otherwise, so callers can honour 403 and 429.
 */
export async function politeFetch(
  url: string,
  { userAgent, lookup = systemLookup, beforeHop }: PoliteFetchOptions,
): Promise<FetchResult> {
  const timedOut = () =>
    new Error(`politeFetch: ${url} timed out after ${TIMEOUT_MS / 1000} s`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timedOut()), TIMEOUT_MS);
  let target = new URL(url);
  try {
    for (let redirects = 0; ; redirects++) {
      checkScheme(target);
      if (beforeHop)
        await untilAborted(
          Promise.resolve().then(() => beforeHop(new URL(target))),
          controller.signal,
        );
      const hostname = target.hostname.replace(/^\[|\]$/g, "");
      const address = await resolvePublic(hostname, lookup, controller.signal);
      const { res, body } = await get(
        target,
        address,
        userAgent,
        controller.signal,
      );
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        if (redirects === MAX_REDIRECTS)
          throw new Error(`politeFetch: too many redirects from ${url}`);
        target = new URL(location, target);
        continue;
      }
      return {
        finalUrl: target.href,
        status,
        contentType: res.headers["content-type"] ?? "",
        text: body.toString("utf8"),
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
