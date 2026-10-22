import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const POST = "https://www.instagram.com/p/fA9uwTtkSN/";
const BLOCKQUOTE =
  '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/fA9uwTtkSN/?utm_source=ig_embed" data-instgrm-version="14" style="max-width:540px;"><div style="padding:16px;"><a href="https://www.instagram.com/p/fA9uwTtkSN/?utm_source=ig_embed" target="_blank">View this post on Instagram</a></div></blockquote>';

function open(url: string, dest: string | null = "iframe") {
  return GET(
    new Request(
      `http://localhost:3000/embed/instagram?url=${encodeURIComponent(url)}`,
      { headers: dest === null ? {} : { "sec-fetch-dest": dest } },
    ),
  );
}

function stubMeta(response: Response) {
  const fetchStub = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/embed/instagram", () => {
  it("asks only Meta's oEmbed endpoint and renders only its blockquote", async () => {
    const fetchStub = stubMeta(
      Response.json({
        html: `${BLOCKQUOTE}<script async src="//www.instagram.com/embed.js"></script>`,
        title: "Teal drapes and brass lanterns",
        author_name: "meera.decor",
        thumbnail_url: "https://scontent.cdninstagram.com/thumb.jpg",
      }),
    );
    const response = await open(POST);
    const html = await response.text();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const calls = fetchStub.mock.calls as unknown as [string][];
    expect(new URL(calls[0]![0]).origin).toBe("https://graph.facebook.com");
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain(BLOCKQUOTE);
    expect(html).not.toContain('src="//www.instagram.com/embed.js"');
    expect(html).not.toContain("Teal drapes");
    expect(html).not.toContain("meera.decor");
    expect(html).not.toContain("thumb.jpg");
  });

  it("renders the link card when Meta answers with an error", async () => {
    stubMeta(
      Response.json(
        { error: { message: "The requested resource does not exist" } },
        { status: 400 },
      ),
    );
    const html = await (await open(POST)).text();
    expect(html).not.toContain("instagram-media");
    expect(html).toContain(`href="${POST}"`);
    expect(html).toContain("Open on Instagram");
    expect(html).toContain('"script":null');
  });

  it("asks Meta nothing for a link that isn't an Instagram post or Reel", async () => {
    const fetchStub = stubMeta(Response.json({ html: BLOCKQUOTE }));
    const html = await (await open("https://evil.example/p/x/")).text();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(html).toContain("This link can't be previewed.");
  });

  it.each([null, "document"])(
    "asks Meta nothing and shows the link when sec-fetch-dest is %s, not iframe",
    async (dest) => {
      const fetchStub = stubMeta(Response.json({ html: BLOCKQUOTE }));
      const html = await (await open(POST, dest)).text();
      expect(fetchStub).not.toHaveBeenCalled();
      expect(html).not.toContain("instagram-media");
      expect(html).toContain('"script":null');
      expect(html).toContain(`href="${POST}"`);
    },
  );
});
