import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function open(url: string | null, dest: string | null = "iframe") {
  const query = url === null ? "" : `?url=${encodeURIComponent(url)}`;
  return GET(
    new Request(`http://localhost:3000/embed/pinterest${query}`, {
      headers: dest === null ? {} : { "sec-fetch-dest": dest },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/embed/pinterest", () => {
  it("draws a Pin with Pinterest's embedPin widget, normalising in.pinterest.com", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const html = await (
      await open("https://in.pinterest.com/pin/123456789/")
    ).text();
    expect(html).toContain(
      '<a data-pin-do="embedPin" href="https://www.pinterest.com/pin/123456789/"></a>',
    );
    expect(html).toContain(
      '"script":"https://assets.pinterest.com/js/pinit.js"',
    );
    // The server never opens the Member's link.
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("draws a board with the embedBoard widget", async () => {
    const html = await (
      await open("https://www.pinterest.com/meera/haldi-decor/")
    ).text();
    expect(html).toContain(
      '<a data-pin-do="embedBoard" href="https://www.pinterest.com/meera/haldi-decor/"></a>',
    );
  });

  it("shows only the link for a pin.it short link, with no Pinterest script", async () => {
    const html = await (await open("https://pin.it/AbC123")).text();
    expect(html).not.toContain("<a data-pin-do");
    expect(html).toContain('"script":null');
    expect(html).toContain('href="https://pin.it/AbC123"');
  });

  it.each([
    null,
    "javascript:alert(1)",
    'https://www.pinterest.com/pin/1/"><script>alert(1)</script>',
    "https://www.instagram.com/p/fA9uwTtkSN/",
  ])("loads no script for %s", async (url) => {
    const html = await (await open(url)).text();
    expect(html).not.toContain("<a data-pin-do");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain('"script":null');
  });

  it.each([null, "document", "empty"])(
    "loads no Pinterest script when the request's sec-fetch-dest is %s, not iframe",
    async (dest) => {
      const html = await (
        await open("https://www.pinterest.com/pin/123456789/", dest)
      ).text();
      expect(html).not.toContain("<a data-pin-do");
      expect(html).toContain('"script":null');
      expect(html).toContain('href="https://www.pinterest.com/pin/123456789/"');
    },
  );

  describe("the board's scroll height", () => {
    const BOARD = "https://www.pinterest.com/meera/haldi-decor/";
    async function heightFor(height: string | null) {
      const query = height === null ? "" : `&height=${height}`;
      const html = await (
        await GET(
          new Request(
            `http://localhost:3000/embed/pinterest?url=${encodeURIComponent(BOARD)}${query}`,
            { headers: { "sec-fetch-dest": "iframe" } },
          ),
        )
      ).text();
      return /"boardHeight":(\d+)/.exec(html)?.[1];
    }

    it("stays 240 px when the page isn't asked for a height", async () => {
      expect(await heightFor(null)).toBe("240");
    });

    it("takes a height between 240 and 900 px", async () => {
      expect(await heightFor("600")).toBe("600");
    });

    it.each([
      ["100", "240"],
      ["5000", "900"],
      ["abc", "240"],
      ["600.7", "600"],
      ["-1", "240"],
      ["", "240"],
    ])("clamps %s to %s", async (height, expected) => {
      expect(await heightFor(height)).toBe(expected);
    });
  });
});
