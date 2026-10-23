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
});
