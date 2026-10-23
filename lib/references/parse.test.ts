import { describe, expect, it } from "vitest";
import { parseReferenceUrl } from "./parse";

describe("parseReferenceUrl accepts", () => {
  it.each([
    [
      "https://www.pinterest.com/pin/123456789/",
      "https://www.pinterest.com/pin/123456789/",
    ],
    [
      "https://pinterest.com/pin/123456789",
      "https://www.pinterest.com/pin/123456789/",
    ],
    [
      "https://in.pinterest.com/pin/123456789/",
      "https://www.pinterest.com/pin/123456789/",
    ],
  ])("the Pin %s", (input, embedUrl) => {
    expect(parseReferenceUrl(input)).toEqual({
      platform: "pinterest",
      urlKind: "pin",
      url: input,
      embedUrl,
    });
  });

  it("a Pin link with Pinterest's title slug, embedded by its number", () => {
    expect(
      parseReferenceUrl(
        "https://www.pinterest.com/pin/51-haldi-decor-ideas-for-a-beautiful-celebration--845973111266327654/",
      ),
    ).toMatchObject({
      urlKind: "pin",
      embedUrl: "https://www.pinterest.com/pin/845973111266327654/",
    });
  });

  it("a board", () => {
    expect(
      parseReferenceUrl("https://www.pinterest.com/meera/haldi-decor/"),
    ).toEqual({
      platform: "pinterest",
      urlKind: "board",
      url: "https://www.pinterest.com/meera/haldi-decor/",
      embedUrl: "https://www.pinterest.com/meera/haldi-decor/",
    });
  });

  it("an in.pinterest.com board, normalised to www", () => {
    expect(
      parseReferenceUrl("https://in.pinterest.com/meera/haldi-decor"),
    ).toMatchObject({
      urlKind: "board",
      embedUrl: "https://www.pinterest.com/meera/haldi-decor/",
    });
  });

  it("a pin.it short link as a link only", () => {
    expect(parseReferenceUrl("https://pin.it/AbC123")).toEqual({
      platform: "pinterest",
      urlKind: "pinShort",
      url: "https://pin.it/AbC123",
      embedUrl: null,
    });
  });

  it("an Instagram post", () => {
    expect(
      parseReferenceUrl("https://www.instagram.com/p/fA9uwTtkSN/"),
    ).toEqual({
      platform: "instagram",
      urlKind: "post",
      url: "https://www.instagram.com/p/fA9uwTtkSN/",
      embedUrl: "https://www.instagram.com/p/fA9uwTtkSN/",
    });
  });

  it("an Instagram Reel", () => {
    expect(
      parseReferenceUrl("https://www.instagram.com/reel/Cxyz123/"),
    ).toEqual({
      platform: "instagram",
      urlKind: "reel",
      url: "https://www.instagram.com/reel/Cxyz123/",
      embedUrl: "https://www.instagram.com/reel/Cxyz123/",
    });
  });

  it("a shared Instagram link with the poster's name and a tracking query", () => {
    expect(
      parseReferenceUrl(
        "https://www.instagram.com/meera.decor/reel/Cxyz123/?igsh=abc123",
      ),
    ).toEqual({
      platform: "instagram",
      urlKind: "reel",
      url: "https://www.instagram.com/meera.decor/reel/Cxyz123/",
      embedUrl: "https://www.instagram.com/reel/Cxyz123/",
    });
  });

  it("an Instagram carousel link, keeping which slide it shows", () => {
    expect(
      parseReferenceUrl(
        "https://www.instagram.com/p/fA9uwTtkSN/?img_index=3&igsh=abc123",
      ),
    ).toEqual({
      platform: "instagram",
      urlKind: "post",
      url: "https://www.instagram.com/p/fA9uwTtkSN/?img_index=3",
      embedUrl: "https://www.instagram.com/p/fA9uwTtkSN/",
    });
  });

  it("an Instagram link whose img_index isn't a slide number, without it", () => {
    expect(
      parseReferenceUrl(
        "https://www.instagram.com/p/fA9uwTtkSN/?img_index=%22%3E",
      ),
    ).toMatchObject({ url: "https://www.instagram.com/p/fA9uwTtkSN/" });
  });

  it("surrounding spaces and a Pinterest share suffix", () => {
    expect(
      parseReferenceUrl(
        "  https://in.pinterest.com/pin/123456789/sent/?invite_code=x  ",
      ),
    ).toMatchObject({
      urlKind: "pin",
      url: "https://in.pinterest.com/pin/123456789/sent/",
      embedUrl: "https://www.pinterest.com/pin/123456789/",
    });
  });
});

describe("parseReferenceUrl refuses", () => {
  it.each([
    ["an http:// URL", "http://www.pinterest.com/pin/123456789/", "notHttps"],
    ["another host", "https://www.example.com/pin/123456789/", "notSupported"],
    [
      "a look-alike host",
      "https://pinterest.com.evil.example/pin/123456789/",
      "notSupported",
    ],
    [
      "Pinterest search",
      "https://www.pinterest.com/search/pins/?q=haldi",
      "notSupported",
    ],
    [
      "a Pinterest idea page",
      "https://www.pinterest.com/ideas/haldi-decor/912345678/",
      "notSupported",
    ],
    ["a Pinterest profile", "https://www.pinterest.com/meera/", "notSupported"],
    [
      "a Pinterest profile tab",
      "https://www.pinterest.com/meera/_saved/",
      "notSupported",
    ],
    ["a port", "https://www.pinterest.com:8443/pin/123456789/", "notSupported"],
    [
      "credentials",
      "https://user:pass@www.pinterest.com/pin/123456789/",
      "notSupported",
    ],
    ["a javascript: URL", "javascript:alert(1)", "notHttps"],
    ["a data: URL", "data:text/html,<p>hi</p>", "notHttps"],
    [
      "an Instagram profile",
      "https://www.instagram.com/meera/",
      "notSupported",
    ],
    [
      "an Instagram story",
      "https://www.instagram.com/stories/meera/3123456789/",
      "notSupported",
    ],
    [
      "an Instagram story of a person named p",
      "https://www.instagram.com/stories/p/3123456789/",
      "notSupported",
    ],
    [
      "an Instagram share link",
      "https://www.instagram.com/share/reel/BAabc123/",
      "notSupported",
    ],
    [
      "an Instagram explore page",
      "https://www.instagram.com/explore/p/Cxyz123/",
      "notSupported",
    ],
    [
      "an Instagram account page",
      "https://www.instagram.com/accounts/p/Cxyz123/",
      "notSupported",
    ],
    [
      "an Instagram direct message",
      "https://www.instagram.com/direct/p/Cxyz123/",
      "notSupported",
    ],
    [
      "a host that only ends in pinterest.com",
      "https://xpinterest.com/pin/123456789/",
      "notSupported",
    ],
    [
      "a user name without a password",
      "https://user@www.pinterest.com/pin/123456789/",
      "notSupported",
    ],
    ["not a URL", "teal drapes", "invalid"],
    ["an empty string", "", "invalid"],
  ])("%s", (_label, input, error) => {
    expect(parseReferenceUrl(input)).toEqual({ error });
  });
});
