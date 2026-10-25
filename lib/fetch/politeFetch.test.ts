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

// Every outgoing request is recorded, then sent to a local test server instead of
// the address politeFetch chose, so tests can see where it would have connected.
const dialled = vi.hoisted(
  () => [] as { host: string; port: number; hostHeader: string }[],
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
      host: String(options.host),
      port: Number(options.port),
      hostHeader: headers.Host!,
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

const { politeFetch } = await import("./politeFetch");

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
const userAgent = "UtsavvyBot/1.0";
/** A stub DNS: each hostname maps to the addresses a real lookup would return. */
const dns = (table: Record<string, string | string[]>) =>
  vi.fn(async (hostname: string) =>
    [table[hostname] ?? []]
      .flat()
      .map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
  );

describe("politeFetch", () => {
  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("refuses %s", async (url) => {
    await expect(
      politeFetch(url, { userAgent, lookup: dns({}) }),
    ).rejects.toThrow(/blocked address/);
    expect(dialled).toHaveLength(0);
  });

  it("connects to the address it checked, not a second lookup, and returns the page", async () => {
    let seenAgent = "";
    routes["vendor.example/menu"] = (req, res) => {
      seenAgent = String(req.headers["user-agent"]);
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end("<p>Veg thali ₹450 per plate</p>");
    };
    // A rebinding DNS: public the first time, private on any later lookup.
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const result = await politeFetch("http://vendor.example/menu", {
      userAgent,
      lookup,
    });

    expect(result).toEqual({
      finalUrl: "http://vendor.example/menu",
      status: 200,
      contentType: "text/html; charset=utf-8",
      text: "<p>Veg thali ₹450 per plate</p>",
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(dialled).toEqual([
      { host: PUBLIC_IP, port: 80, hostHeader: "vendor.example" },
    ]);
    expect(seenAgent).toBe(userAgent);
  });

  it.each([
    "ftp://vendor.example/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])("refuses the scheme of %s", async (url) => {
    await expect(
      politeFetch(url, {
        userAgent,
        lookup: dns({ "vendor.example": PUBLIC_IP }),
      }),
    ).rejects.toThrow(/scheme/);
    expect(dialled).toHaveLength(0);
  });

  it.each(["http://vendor.example:8080/", "https://vendor.example:80/"])(
    "refuses the port of %s",
    async (url) => {
      await expect(
        politeFetch(url, {
          userAgent,
          lookup: dns({ "vendor.example": PUBLIC_IP }),
        }),
      ).rejects.toThrow(/port/);
      expect(dialled).toHaveLength(0);
    },
  );

  it("refuses a public hostname that resolves to a private address", async () => {
    const lookup = dns({ "vendor.example": [PUBLIC_IP, "192.168.1.1"] });
    await expect(
      politeFetch("http://vendor.example/", { userAgent, lookup }),
    ).rejects.toThrow(/blocked address 192\.168\.1\.1/);
    expect(dialled).toHaveLength(0);
  });

  const redirect =
    (location: string): Handler =>
    (_req, res) =>
      res.writeHead(302, { location }).end();

  it("refuses a redirect from a public host to a private one, checked at that hop", async () => {
    routes["vendor.example/"] = redirect("http://internal.example/admin");
    const lookup = dns({
      "vendor.example": PUBLIC_IP,
      "internal.example": "192.168.1.1",
    });

    await expect(
      politeFetch("http://vendor.example/", { userAgent, lookup }),
    ).rejects.toThrow(/blocked address 192\.168\.1\.1/);
    expect(lookup).toHaveBeenCalledWith("internal.example");
    expect(dialled.map((d) => d.hostHeader)).toEqual(["vendor.example"]);
  });

  it("follows 3 redirects, re-checking each hop, and refuses a fourth", async () => {
    const lookup = dns({
      "a.example": PUBLIC_IP,
      "b.example": PUBLIC_IP,
      "c.example": PUBLIC_IP,
      "d.example": PUBLIC_IP,
    });
    routes["a.example/"] = redirect("http://b.example/");
    routes["b.example/"] = redirect("/two"); // relative to the current hop
    routes["b.example/two"] = redirect("https://c.example/");
    routes["c.example/"] = (_req, res) =>
      res.writeHead(200, { "content-type": "text/plain" }).end("three hops");

    const ok = await politeFetch("http://a.example/", { userAgent, lookup });
    expect(ok).toMatchObject({
      finalUrl: "https://c.example/",
      status: 200,
      text: "three hops",
    });
    expect(dialled.map((d) => d.port)).toEqual([80, 80, 80, 443]);

    routes["c.example/"] = redirect("http://d.example/");
    routes["d.example/"] = (_req, res) =>
      res.writeHead(200).end("never reached");
    await expect(
      politeFetch("http://a.example/", { userAgent, lookup }),
    ).rejects.toThrow(/too many redirects/);
    expect(dialled.some((d) => d.hostHeader === "d.example")).toBe(false);
  });

  it("stops at 2 MB", async () => {
    routes["vendor.example/big"] = (_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = "x".repeat(64 * 1024);
      for (let i = 0; i < 48; i++) res.write(chunk); // 3 MB, no content-length
      res.end();
    };
    const lookup = dns({ "vendor.example": PUBLIC_IP });
    await expect(
      politeFetch("http://vendor.example/big", { userAgent, lookup }),
    ).rejects.toThrow(/2 MB/);
  });

  it("stops at about 8 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      routes["vendor.example/slow"] = () => {}; // never answers
      const lookup = dns({ "vendor.example": PUBLIC_IP });
      const settled = vi.fn();
      const fetching = politeFetch("http://vendor.example/slow", {
        userAgent,
        lookup,
      }).catch((error: Error) => {
        settled();
        throw error;
      });
      const assertion = expect(fetching).rejects.toThrow(/timed out/);

      await vi.advanceTimersByTimeAsync(7_900);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
