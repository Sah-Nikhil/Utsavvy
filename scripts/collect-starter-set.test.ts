import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// As in lib/fetch/politeFetch.test.ts: every outgoing request is recorded, then sent
// to a local test server, so no test reaches a real Vendor site.
const dialled = vi.hoisted(
  () => [] as { hostHeader: string; path: string; at: number }[],
);
const local = vi.hoisted(() => ({ port: 0 }));

vi.mock("node:http", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:http")>();
  const request = (
    options: import("node:http").RequestOptions,
    callback: (res: IncomingMessage) => void,
  ) => {
    const headers = options.headers as Record<string, string>;
    dialled.push({
      hostHeader: headers.Host!,
      path: String(options.path),
      at: Date.now(),
    });
    return real.request(
      { ...options, host: "127.0.0.1", port: local.port },
      callback,
    );
  };
  return { ...real, default: { ...real, request }, request };
});
vi.mock("node:https", async () => {
  const http = await import("node:http");
  return { default: { request: http.request }, request: http.request };
});

const { createReader } = await import("./collect-starter-set");

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let routes: Record<string, Handler> = {};
const server = createServer((req, res) => {
  const handler = routes[`${req.headers.host}${req.url}`];
  if (handler) handler(req, res);
  else res.writeHead(404).end("not found");
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  local.port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  routes = {};
  dialled.length = 0;
});

const PUBLIC_IP = "93.184.216.34";
/** A stub DNS that answers every hostname with one public address. */
const dns = () =>
  vi.fn(async (_hostname: string) => [{ address: PUBLIC_IP, family: 4 }]);
const redirect =
  (location: string): Handler =>
  (_req, res) =>
    res.writeHead(302, { location }).end();
const page =
  (text: string): Handler =>
  (_req, res) =>
    res.writeHead(200, { "content-type": "text/html" }).end(text);

describe("reading a candidate page", () => {
  it.each([
    ["a social site", "https://www.instagram.com/vendor/", "www.instagram.com"],
    [
      "a directory",
      "https://www.wedmegood.com/vendors/jaipur/vendor",
      "www.wedmegood.com",
    ],
    ["another site", "https://other.example/rates", "other.example"],
  ])(
    "refuses a redirect to %s before requesting it",
    async (_, location, host) => {
      routes["vendor.example/"] = redirect(location);
      const lookup = dns();
      const reader = createReader({ lookup, delayMs: 0 });

      await expect(reader.read("http://vendor.example/")).rejects.toThrow(
        /redirected off the site/,
      );
      expect(lookup).not.toHaveBeenCalledWith(host);
      expect(dialled.map((d) => d.hostHeader + d.path)).toEqual([
        "vendor.example/robots.txt",
        "vendor.example/",
      ]);
    },
  );

  it("refuses a same-site redirect into a path robots.txt disallows, however it is encoded", async () => {
    routes["vendor.example/robots.txt"] = (_req, res) =>
      res
        .writeHead(200, { "content-type": "text/plain" })
        .end("User-agent: *\nDisallow: /private/foo\n");
    routes["vendor.example/"] = redirect("/private/%66oo");
    const reader = createReader({ lookup: dns(), delayMs: 0 });

    await expect(reader.read("http://vendor.example/")).rejects.toThrow(
      /disallowed by robots\.txt/,
    );
    expect(dialled.map((d) => d.path)).toEqual(["/robots.txt", "/"]);
  });

  it("checks a redirect to another host of the same site against that host's robots.txt", async () => {
    routes["vendor.example/"] = redirect("https://www.vendor.example/menu");
    routes["www.vendor.example/robots.txt"] = (_req, res) =>
      res
        .writeHead(200, { "content-type": "text/plain" })
        .end("User-agent: utsavvybot\nDisallow: /menu\n");
    const reader = createReader({ lookup: dns(), delayMs: 0 });

    await expect(reader.read("http://vendor.example/")).rejects.toThrow(
      /disallowed by robots\.txt/,
    );
    expect(dialled.map((d) => d.hostHeader + d.path)).toEqual([
      "vendor.example/robots.txt",
      "vendor.example/",
      "www.vendor.example/robots.txt",
    ]);
  });

  it("treats a robots.txt that redirects off the site as disallowing everything, without reading it", async () => {
    routes["vendor.example/robots.txt"] = redirect(
      "https://www.instagram.com/robots.txt",
    );
    routes["vendor.example/"] = page("<p>never read</p>");
    const lookup = dns();
    const reader = createReader({ lookup, delayMs: 0 });

    await expect(reader.read("http://vendor.example/")).rejects.toThrow(
      /disallowed by robots\.txt/,
    );
    expect(lookup).not.toHaveBeenCalledWith("www.instagram.com");
    expect(dialled.map((d) => d.hostHeader + d.path)).toEqual([
      "vendor.example/robots.txt",
    ]);
  });

  it("follows an allowed same-site redirect, waiting between requests to a host", async () => {
    routes["vendor.example/"] = redirect("/menu");
    routes["vendor.example/menu"] = page("<p>Veg thali ₹450 per plate</p>");
    const delayMs = 150;
    const reader = createReader({ lookup: dns(), delayMs });

    const result = await reader.read("http://vendor.example/");

    expect(result).toMatchObject({
      finalUrl: "http://vendor.example/menu",
      status: 200,
    });
    expect(dialled.map((d) => d.path)).toEqual(["/robots.txt", "/", "/menu"]);
    for (let i = 1; i < dialled.length; i++)
      expect(dialled[i]!.at - dialled[i - 1]!.at).toBeGreaterThanOrEqual(
        delayMs - 20, // timer granularity
      );
  });
});
