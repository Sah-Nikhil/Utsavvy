import { describe, expect, it, vi } from "vitest";
import { loadInstagramEmbed } from "./instagram";

const POST = "https://www.instagram.com/p/fA9uwTtkSN/";

// The shape Meta's tokenless oEmbed returns (checked 2026-10-22), trimmed: one
// blockquote with inline styles and a link back to the post.
const BLOCKQUOTE =
  '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/fA9uwTtkSN/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14" style=" max-width:540px;"><div style="padding:16px;"> <a href="https://www.instagram.com/p/fA9uwTtkSN/?utm_source=ig_embed&amp;utm_campaign=loading" target="_blank"><div>View this post on Instagram</div><svg width="50px" viewBox="0 0 60 60"><path d="M1 1"></path></svg></a></div></blockquote>';

function oembedResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    response.clone(),
  );
}

describe("loadInstagramEmbed", () => {
  it("calls only Meta's oEmbed endpoint, asking for no script and no caption", async () => {
    const fetchStub = stubFetch(
      oembedResponse({
        version: "1.0",
        type: "rich",
        html: BLOCKQUOTE,
        thumbnail_url: "https://scontent.cdninstagram.com/thumb.jpg",
      }),
    );
    await loadInstagramEmbed(POST, fetchStub);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const requested = new URL(String(fetchStub.mock.calls[0]![0]));
    expect(requested.origin).toBe("https://graph.facebook.com");
    expect(requested.pathname).toBe("/v25.0/instagram_oembed");
    expect(requested.searchParams.get("url")).toBe(POST);
    expect(requested.searchParams.get("omitscript")).toBe("true");
    expect(requested.searchParams.get("hidecaption")).toBe("true");
    expect(fetchStub.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
  });

  it("keeps only the returned blockquote", async () => {
    const result = await loadInstagramEmbed(
      POST,
      stubFetch(
        oembedResponse({
          html: `${BLOCKQUOTE}\n<script async src="//www.instagram.com/embed.js"></script>`,
          author_name: "meera.decor",
          title: "Teal drapes and brass lanterns",
          thumbnail_url: "https://scontent.cdninstagram.com/thumb.jpg",
        }),
      ),
    );
    expect(result).toEqual({ kind: "embed", blockquote: BLOCKQUOTE });
    const kept = JSON.stringify(result);
    expect(kept).not.toContain("<script");
    expect(kept).not.toContain("thumb.jpg");
    expect(kept).not.toContain("Teal drapes");
  });

  it.each([
    [
      "Meta answers with an error (private, deleted or embed-disabled)",
      oembedResponse(
        {
          error: {
            message: "The requested resource does not exist",
            code: 24,
            error_subcode: 2207045,
          },
        },
        400,
      ),
    ],
    ["the answer has no html", oembedResponse({ version: "1.0" })],
    [
      "the html has no Instagram blockquote",
      oembedResponse({ html: "<div>Something else</div>" }),
    ],
    [
      "the blockquote carries an event handler",
      oembedResponse({
        html: BLOCKQUOTE.replace("<div ", '<div onmouseover="alert(1)" '),
      }),
    ],
    [
      "the blockquote carries a script",
      oembedResponse({
        html: BLOCKQUOTE.replace(
          "</div></blockquote>",
          "<script>alert(1)</script></div></blockquote>",
        ),
      }),
    ],
    [
      "the blockquote points somewhere other than Instagram",
      oembedResponse({
        html: BLOCKQUOTE.replaceAll(
          "https://www.instagram.com/p/",
          "https://evil.example/p/",
        ),
      }),
    ],
    ["the answer isn't JSON", new Response("<html>oops</html>")],
  ])("renders the link card when %s", async (_label, response) => {
    expect(await loadInstagramEmbed(POST, stubFetch(response))).toEqual({
      kind: "link",
    });
  });

  it("renders the link card when the request fails", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await loadInstagramEmbed(POST, failing)).toEqual({ kind: "link" });
  });

  it.each([
    "https://www.pinterest.com/pin/123456789/",
    "https://www.instagram.com/meera/",
    "https://evil.example/p/fA9uwTtkSN/",
  ])(
    "makes no request for %s, which isn't an Instagram post or Reel",
    async (url) => {
      const fetchStub = stubFetch(oembedResponse({ html: BLOCKQUOTE }));
      expect(await loadInstagramEmbed(url, fetchStub)).toEqual({
        kind: "link",
      });
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
});
