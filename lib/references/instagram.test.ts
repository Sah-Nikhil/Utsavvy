import { describe, expect, it, vi } from "vitest";
import { loadInstagramEmbed } from "./instagram";

const POST = "https://www.instagram.com/p/fA9uwTtkSN/";

// The shape Meta's tokenless oEmbed returns (checked 2026-10-22), trimmed: one
// blockquote with inline styles and a link back to the post.
/** The blockquote Utsavvy builds itself for POST, with Meta's version 14. */
const OUR_BLOCKQUOTE =
  '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/fA9uwTtkSN/" data-instgrm-version="14" style="margin:1px auto;max-width:540px;min-width:326px;width:calc(100% - 2px)"><a href="https://www.instagram.com/p/fA9uwTtkSN/" target="_blank" rel="noopener noreferrer">View this post on Instagram</a></blockquote>';

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

  it("builds its own blockquote from the post link, taking only Meta's version number", async () => {
    const result = await loadInstagramEmbed(
      POST,
      stubFetch(
        oembedResponse({
          html: `${BLOCKQUOTE}
<script async src="//www.instagram.com/embed.js"></script>`,
          author_name: "meera.decor",
          title: "Teal drapes and brass lanterns",
          thumbnail_url: "https://scontent.cdninstagram.com/thumb.jpg",
        }),
      ),
    );
    expect(result).toEqual({ kind: "embed", blockquote: OUR_BLOCKQUOTE });
    const kept = JSON.stringify(result);
    expect(kept).not.toContain("<script");
    expect(kept).not.toContain("thumb.jpg");
    expect(kept).not.toContain("Teal drapes");
    expect(kept).not.toContain("meera.decor");
    expect(kept).not.toContain("utm_source");
  });

  it.each([
    ["no version", BLOCKQUOTE.replace(' data-instgrm-version="14"', "")],
    [
      "a version that isn't a small number",
      BLOCKQUOTE.replace(
        'data-instgrm-version="14"',
        'data-instgrm-version="14&quot; onload=&quot;x"',
      ),
    ],
    [
      "a four-digit version",
      BLOCKQUOTE.replace(
        'data-instgrm-version="14"',
        'data-instgrm-version="1400"',
      ),
    ],
  ])(
    "leaves out the version when Meta's answer has %s",
    async (_label, html) => {
      const result = await loadInstagramEmbed(
        POST,
        stubFetch(oembedResponse({ html })),
      );
      expect(result).toEqual({
        kind: "embed",
        blockquote: OUR_BLOCKQUOTE.replace(' data-instgrm-version="14"', ""),
      });
    },
  );

  // Markup a regex denylist once let through (review of PR #78, M1). Meta's
  // HTML is never rendered now, so none of it can reach the page.
  it.each([
    ["an svg onload with a slash", "<svg/onload=alert(1)>"],
    [
      "a handler right after a quoted value",
      '<div class="a"onmouseover="alert(1)">x</div>',
    ],
    ["a single-quoted off-site link", "<a href='https://evil.example/'>x</a>"],
    ["an unquoted off-site link", "<a href=https://evil.example/>x</a>"],
    [
      "an xlink:href with an entity-encoded javascript: URL",
      '<svg><a xlink:href="javascript&#58;alert(1)"><text>x</text></a></svg>',
    ],
    [
      "an svg set that rewrites href",
      '<svg><a><set attributeName="href" to="javascript&#58;alert(1)"/><text>x</text></a></svg>',
    ],
  ])("never passes on %s from Meta's HTML", async (_label, payload) => {
    const result = await loadInstagramEmbed(
      POST,
      stubFetch(
        oembedResponse({
          html: BLOCKQUOTE.replace(
            "</div></blockquote>",
            `${payload}</div></blockquote>`,
          ),
        }),
      ),
    );
    expect(result).toEqual({ kind: "embed", blockquote: OUR_BLOCKQUOTE });
    const kept = JSON.stringify(result);
    for (const marker of [
      "alert",
      "evil.example",
      "onload",
      "onmouseover",
      "xlink",
      "<svg",
    ])
      expect(kept).not.toContain(marker);
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
