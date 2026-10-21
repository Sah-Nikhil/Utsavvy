import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FACT_FIELDS,
  UNITS,
  domainOf,
  hasCurrency,
  htmlToText,
  isDirectory,
  nearJaipur,
  parseRobots,
  quoteCheck,
  sentenceHasAmount,
  toMarker,
  type FactField,
  type Provenance,
  type Vendor,
} from "../scripts/collect-starter-set";

describe("seed/jaipur-vendors.json", () => {
  let vendors: Vendor[];
  beforeAll(() => {
    vendors = JSON.parse(
      readFileSync(new URL("./jaipur-vendors.json", import.meta.url), "utf8"),
    );
  });

  it("has 16 Vendors on distinct domains: 6 venues, 4 caterers, 3 decorators, 3 photographers", () => {
    expect(vendors).toHaveLength(16);
    expect(new Set(vendors.map((v) => v.domain)).size).toBe(16);
    const counts: Record<string, number> = {};
    for (const v of vendors) counts[v.category] = (counts[v.category] ?? 0) + 1;
    expect(counts).toEqual({
      venue: 6,
      caterer: 4,
      decorator: 3,
      photographer: 3,
    });
  });

  it("every Listed price's sentence contains its amount and a currency marker", () => {
    for (const v of vendors)
      for (const p of v.listedPrices) {
        expect(hasCurrency(p.sentence), p.sentence).toBe(true);
        if (p.amount) {
          expect(sentenceHasAmount(p.sentence, p.amount.min), p.sentence).toBe(
            true,
          );
          expect(sentenceHasAmount(p.sentence, p.amount.max), p.sentence).toBe(
            true,
          );
        }
      }
  });

  it("every comparable Listed price has an amount and one of the four units", () => {
    for (const v of vendors)
      for (const p of v.listedPrices.filter((p) => p.comparable)) {
        expect(p.amount, p.sentence).toBeDefined();
        expect(UNITS, p.sentence).toContain(p.unit);
      }
  });

  it("every Vendor has provenance for each field it fills", () => {
    for (const v of vendors) {
      for (const field of FACT_FIELDS.filter((f) => v[f] !== undefined)) {
        const source = v.provenance.find((p) => p.field === field);
        expect(source, `${v.domain} ${field}`).toBeDefined();
        expect(source!.seenAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      for (const p of v.listedPrices)
        expect(domainOf(p.sourceUrl), p.sentence).toBe(v.domain);
    }
  });

  it("every ownSite entry is on the Vendor's own site and keeps its sentence", () => {
    for (const v of vendors)
      for (const p of v.provenance.filter((p) => p.kind === "ownSite")) {
        expect(domainOf(p.url), `${v.domain} ${p.field}`).toBe(v.domain);
        expect(p.sentence, `${v.domain} ${p.field}`).toBeTruthy();
        expect(p.confirmedBy).toBeNull();
      }
  });

  it("every Instagram-checked entry was confirmed by Sah-Nikhil on www.instagram.com, with no sentence", () => {
    for (const v of vendors)
      for (const p of v.provenance.filter(
        (p) => p.kind === "instagramProfileHumanChecked",
      )) {
        expect(p.confirmedBy, `${v.domain} ${p.field}`).toBe("Sah-Nikhil");
        expect(new URL(p.url).hostname).toBe("www.instagram.com");
        expect(p.sentence).toBeNull();
      }
  });

  it("an Instagram-only Vendor has no Listed prices, no website and a profileUrl", () => {
    for (const v of vendors.filter((v) =>
      v.provenance.some((p) => p.kind === "instagramProfileHumanChecked"),
    )) {
      expect(v.listedPrices, v.domain).toEqual([]);
      expect(v.website, v.domain).toBeNull();
      expect(v.profileUrl, v.domain).toMatch(
        /^https:\/\/www\.instagram\.com\//,
      );
    }
  });

  it("no own-site domain is on the directory blocklist", () => {
    for (const v of vendors.filter((v) => v.website !== null))
      expect(isDirectory(v.domain), v.domain).toBe(false);
  });

  it("stores and links no Vendor photos", () => {
    expect(JSON.stringify(vendors)).not.toMatch(
      /\.(jpe?g|png|webp|gif|avif)\b/i,
    );
  });
});

describe("the quote check", () => {
  // Worked examples from docs/design/vendors.md.
  it("finds a price's amount in its sentence, in the ways Indian sites write it", () => {
    expect(sentenceHasAmount("Packages starting at ₹250 per plate.", 250)).toBe(
      true,
    );
    expect(
      sentenceHasAmount(
        "Approximately ₹1,200-₹3,500 per plate for 200-400 guests.",
        1200,
      ),
    ).toBe(true);
    expect(
      sentenceHasAmount(
        "Approximately ₹1,200-₹3,500 per plate for 200-400 guests.",
        3500,
      ),
    ).toBe(true);
    expect(
      sentenceHasAmount("Wedding decor from Rs 1,50,000 onwards", 150000),
    ).toBe(true);
    expect(sentenceHasAmount("Full-day shoot at ₹1.5 lakh", 150000)).toBe(true);
    expect(
      sentenceHasAmount("Candid photography from 45K INR per day", 45000),
    ).toBe(true);
    expect(sentenceHasAmount("Packages starting at ₹250 per plate.", 300)).toBe(
      false,
    );
    expect(
      sentenceHasAmount("Packages starting at ₹2500 per plate.", 250),
    ).toBe(false);
  });

  it("needs ₹, Rs or INR in a price's sentence", () => {
    expect(hasCurrency("starting at ₹250 per plate")).toBe(true);
    expect(hasCurrency("Rs. 800 per plate")).toBe(true);
    expect(hasCurrency("Rs800/- per plate")).toBe(true);
    expect(hasCurrency("INR 800 per plate")).toBe(true);
    expect(hasCurrency("800 per plate")).toBe(false);
    expect(hasCurrency("Hours: 10 am to 8 pm")).toBe(false);
  });

  const page = {
    url: "https://vendor.example/menu",
    text: "Vinayak   Caterers\n\nVeg menu starting at ₹250 per plate. Call 98290 12345 to book.",
  };
  const ownSite = (field: FactField, sentence: string): Provenance => ({
    field,
    kind: "ownSite",
    url: page.url,
    sentence,
    seenAt: "2026-10-22",
    confirmedBy: null,
  });
  const draft: Vendor = {
    domain: "vendor.example",
    name: "Vinayak Caterers",
    category: "caterer",
    website: "https://vendor.example/",
    phone: "+91 98290 12345",
    email: "hello@vendor.example",
    summary: "Vegetarian caterer for weddings.",
    provenance: [
      ownSite("name", "Vinayak Caterers"),
      ownSite("phone", "Call 98290  12345 to book."),
      ownSite("email", "Write to hello@vendor.example"),
    ],
    factsSeenAt: "2026-10-22",
    source: "starterSet",
    listedPrices: [
      {
        sourceUrl: page.url,
        sentence: "Veg menu starting at ₹250 per plate.",
        seenAt: "2026-10-22",
        comparable: true,
        amount: { min: 250, max: 250 },
        unit: "per_plate",
        qualifier: "starting",
        diet: "veg",
        text: "from ₹250/plate",
      },
      {
        sourceUrl: page.url,
        sentence: "Non-veg menu starting at ₹400 per plate.",
        seenAt: "2026-10-22",
        comparable: true,
        amount: { min: 400, max: 400 },
        unit: "per_plate",
        qualifier: "starting",
        diet: "non-veg",
        text: "from ₹400/plate",
      },
    ],
  };

  it("keeps facts whose sentence is on the page after whitespace normalisation and drops the rest", () => {
    const { vendor, dropped } = quoteCheck(
      draft,
      new Map([[page.url, page.text]]),
    );

    expect(vendor?.name).toBe("Vinayak Caterers");
    expect(vendor?.phone).toBe("+91 98290 12345");
    expect(vendor?.email).toBeUndefined();
    expect(vendor?.provenance.map((p) => p.field)).toEqual(["name", "phone"]);
    expect(vendor?.listedPrices.map((p) => p.diet)).toEqual(["veg"]);
    expect(dropped).toEqual([
      "vendor.example email",
      "vendor.example price: Non-veg menu starting at ₹400 per plate.",
    ]);
  });

  it("drops a price whose amount isn't in its sentence, even when the sentence is on the page", () => {
    const wrongAmount = {
      ...draft.listedPrices[0],
      amount: { min: 200, max: 250 },
    };
    const { vendor } = quoteCheck(
      { ...draft, listedPrices: [wrongAmount] },
      new Map([[page.url, page.text]]),
    );
    expect(vendor?.listedPrices).toEqual([]);
  });

  it("keeps an Instagram-checked fact without looking for it on a page", () => {
    const checked: Provenance = {
      field: "phone",
      kind: "instagramProfileHumanChecked",
      url: "https://www.instagram.com/example_decor/",
      sentence: null,
      seenAt: "2026-10-22",
      confirmedBy: "Sah-Nikhil",
    };
    const { vendor, dropped } = quoteCheck(
      {
        ...draft,
        provenance: [ownSite("name", "Vinayak Caterers"), checked],
        email: undefined,
        listedPrices: [],
      },
      new Map([[page.url, page.text]]),
    );
    expect(vendor?.phone).toBe("+91 98290 12345");
    expect(vendor?.provenance).toContainEqual(checked);
    expect(dropped).toEqual([]);
  });

  it("drops the whole Vendor when its name can't be checked", () => {
    const { vendor, dropped } = quoteCheck(draft, new Map());
    expect(vendor).toBeUndefined();
    expect(dropped).toContain("vendor.example name");
  });
});

describe("robots.txt", () => {
  const robots = parseRobots(`
# example
User-agent: *
Disallow: /private
Allow: /private/menu

User-agent: SomeOtherBot
User-agent: utsavvybot
Disallow: /prices$
Disallow: /*.pdf
`);

  it("uses our own group, by product token and case-insensitively, over the * group", () => {
    expect(robots("/private/x")).toBe(true); // our group doesn't disallow it
    expect(robots("/prices")).toBe(false);
    expect(robots("/prices/veg")).toBe(true); // $ anchors the end
    expect(robots("/files/menu.pdf")).toBe(false); // * wildcard
    expect(robots("/robots.txt")).toBe(true);
  });

  it("falls back to the * group, where the longest match wins and Allow wins a tie", () => {
    const star = parseRobots(
      "User-agent: *\nDisallow: /private\nAllow: /private/menu\nDisallow: /a\nAllow: /a\n",
    );
    expect(star("/private/rates")).toBe(false);
    expect(star("/private/menu")).toBe(true);
    expect(star("/a")).toBe(true);
    expect(star("/")).toBe(true);
  });

  it("allows everything when no group applies or a Disallow is empty", () => {
    expect(
      parseRobots("User-agent: OtherBot\nDisallow: /\n")("/anything"),
    ).toBe(true);
    expect(parseRobots("User-agent: *\nDisallow:\n")("/anything")).toBe(true);
    expect(parseRobots("User-agent: *\nDisallow: /\n")("/anything")).toBe(
      false,
    );
  });
});

describe("page text", () => {
  it("drops scripts, styles and tags and decodes entities, so sentences can be found", () => {
    const html = `<html><head><style>p{color:red}</style><script>var price = "₹1";</script></head>
      <body><h1>Raj&nbsp;Mahal Gardens</h1><p>Veg plates from <b>&#8377;850</b> &amp; non-veg from &#x20B9;1,100.</p>
      <!-- ₹999 hidden --></body></html>`;
    expect(htmlToText(html)).toBe(
      "Raj Mahal Gardens Veg plates from ₹850 & non-veg from ₹1,100.",
    );
  });
});

describe("Markers from Geoapify", () => {
  const result = (confidence: number, result_type: string) => ({
    lat: 26.9124,
    lon: 75.7873,
    result_type,
    rank: { confidence, match_type: "full_match" },
  });

  it("keeps a confident building or street match exact", () => {
    expect(toMarker(result(0.95, "building"))).toEqual({
      lat: 26.9124,
      lng: 75.7873,
      confidence: 0.95,
      matchType: "full_match",
      approximate: false,
      provider: "geoapify",
      attribution: "© OpenStreetMap contributors, Geoapify",
    });
    expect(toMarker(result(0.8, "street")).approximate).toBe(false);
  });

  it("marks a match below 0.8 confidence, or at locality or city level, approximate", () => {
    expect(toMarker(result(0.79, "building")).approximate).toBe(true);
    expect(toMarker(result(1, "city")).approximate).toBe(true);
    expect(toMarker(result(1, "suburb")).approximate).toBe(true);
    expect(toMarker(result(1, "postcode")).approximate).toBe(true);
  });

  it("only trusts matches within 50 km of Jaipur, since the bias alone let Chennai through", () => {
    expect(nearJaipur(26.814, 75.5507)).toBe(true); // Bagru, on the edge of the district
    expect(nearJaipur(27.0313, 75.8907)).toBe(true); // Kukas
    expect(nearJaipur(13.0705, 80.1608)).toBe(false); // Chennai
    expect(nearJaipur(27.2872, 75.8111)).toBe(true); // about 42 km north, still inside
    expect(nearJaipur(26.4499, 74.6399)).toBe(false); // Ajmer
  });
});

describe("the directory blocklist", () => {
  it("catches directories, marketplaces and social sites on any subdomain or country domain", () => {
    for (const domain of [
      "wedmegood.com",
      "www.weddingwire.in",
      "venuelook.com",
      "maps.google.com",
      "m.facebook.com",
      "justdial.com",
      "instagram.com",
    ])
      expect(isDirectory(domain), domain).toBe(true);
    expect(isDirectory("virasatjaipur.com")).toBe(false);
    expect(isDirectory("vinayakfoodsncatering.in")).toBe(false);
  });
});
