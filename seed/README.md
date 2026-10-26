# Seed data

## Jaipur starter Vendors (`jaipur-vendors.json`)

Issue [#33](https://github.com/Sah-Nikhil/Utsavvy/issues/33). The 16 Jaipur Vendors the app ships with: 6 Venues, 4 caterers, 3 decorators and 3 photographers. Every fact and Listed price comes from the Vendor's own website and keeps the page, the exact sentence and the date seen. No Instagram-only Vendor was needed (see below). `jaipur-vendors.test.ts` checks the file's shape.

**Status: reviewed.** Sah-Nikhil checked and approved all 19 cards on 26 Oct 2026 (the 16 below and the 3 reserves) and rejected none. `jaipur-vendors.json` holds the 16 main cards exactly as reviewed; the reserves are recorded below and are not in the file.

### How it was collected

`scripts/collect-starter-set.ts` does the fetching and checking; the comment at its top shows how to run it.

1. **Candidates.** The agent's own web search, used only for result URLs. Directories, marketplaces and social sites were excluded in the search itself and again by the script's blocklist. Instagram-only businesses were noted as leads outside the repo and not collected.
2. **Fetch.** Each site through `politeFetch` (User-Agent `UtsavvyBot/1.0`, `robots.txt` obeyed, about a second between requests to a host, at most 4 pages per site). Page text was cached outside the repo.
3. **Draft.** The agent read the cached text and recorded each fact with the exact sentence it came from. Summaries are one line in the agent's own words.
4. **Quote check.** Code kept a fact only if its sentence is on the cited page after whitespace normalisation, and a price only if its amount and currency are in that sentence.
5. **Geocode.** Geoapify, filtered to India and biased to Jaipur, with ", Rajasthan" added to the address. A match more than 50 km from central Jaipur counts as no match. Matches below 0.8 confidence or at locality or city level are marked approximate.
6. **Review.** Sah-Nikhil checks every card (below).

### Instagram-only Vendors (gap fills)

Own-site Vendors come first. Only when a category can't reach its count from own sites may an Instagram-only Vendor fill the gap, and then only by hand: Sah-Nikhil opens its public business profile himself and types the name, category, area or street address, public business phone, the profile URL and the date he checked it. The agent and the script never open Instagram or Facebook, and nothing is copied from search snippets, captions, photos, reviews or follower counts. Such a Vendor:

- is keyed `instagram.com/<handle>`, with `website: null` and the profile in `profileUrl`;
- has one `provenance` entry per field with kind `instagramProfileHumanChecked`, the profile URL, `sentence: null`, the checked date as `seenAt` and `confirmedBy: "Sah-Nikhil"`;
- has **no Listed prices**;
- gets its Marker from Geoapify geocoding the address he typed, with the usual approximate rules.

**In this run no gap fill was needed:** all four categories reached their counts from own sites, so 0 Instagram-only Vendors are in the set.

### Collection run, 21 Oct 2026

| Measure                       | Result                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web searches                  | 22. The first 5, unfiltered, returned only directories and listing sites, so later searches excluded those domains.                                                                                                                                                                                                                              |
| Own-site hit rate             | 19 of the 31 candidate sites read (61%) were a Jaipur Vendor's own website usable for the starter set: 16 chosen plus 3 reserves.                                                                                                                                                                                                                |
| Fetch success rate            | 33 of 34 page requests (97%); 1 returned 404. 2 more pages were not requested because `robots.txt` disallowed them.                                                                                                                                                                                                                              |
| Address match rate            | 17 of 19 Vendors had an address and all 17 got a Marker inside Jaipur. On the re-run of 22 Oct 2026, 1 of 17 matched exactly (Wedding Velvet); the rest are approximate (confidence below 0.8), as all 17 were on 21 Oct. Before the 50 km check and the added ", Rajasthan", 3 addresses matched in other cities (Chennai, Gujarat, Bengaluru). |
| Facts the quote check dropped | 0 of 83 facts and Listed prices. Every sentence was copied from the cached page text.                                                                                                                                                                                                                                                            |
| Instagram-only gap fills      | 0, in every category.                                                                                                                                                                                                                                                                                                                            |
| Comparable Listed prices      | 4 of the 16 Vendors publish one (Parampara Banquet Hall, M L Caterers, Vinayak Foods & Catering, Candid Life Photography). The rest say nothing about price on their site.                                                                                                                                                                       |

Sites read but not used: thelalit.com (one domain for a hotel chain in many cities), alankarmusicalgroup.com (a music group that also offers catering), lemagnifique-events.com (a Delhi planner with a Jaipur office), kbstudio.in (no Jaipur office), tksolanki.com (Ahmedabad), glimpse-photography.com and goyalsstudio.com (no Jaipur address on the page read), muddyearth.com (404), parastenthouse.com and jsktentandevents.com (tent houses, a free-label category). Skipped by `robots.txt`: skjaipurdecoration.com, vishalphotos.com.

Prices that describe the Jaipur market in general ("catering in Jaipur starts from ₹800-₹1,200 per plate") were not recorded as a Vendor's Listed price, even when they appear on that Vendor's own site.

Umaid Haveli's room rate was looked at on 26 Oct 2026, from the Umaid hotel group's booking engine (booking.umaidhotels.com, read through Jina Reader because the page is built by JavaScript; its `robots.txt` returned 403, which RFC 9309 treats as no limits). It was not recorded as a Listed price: the page never names the property, it is on a different domain from umaidhaveli.com, the amounts sit in fragments ("INR 6,250", "Rate for 1 Night Tax Exclusive") with no sentence that carries an amount and its unit together, and it is a discounted room rate for one night rather than a price for hiring the Venue.

### Card review

Sah-Nikhil ticks each card after checking its name, address, Marker, and every Listed price and unit against the Vendor's site. All 16 were checked and approved on 26 Oct 2026.

| Category     | Vendor                           | Domain                   | Checked |
| ------------ | -------------------------------- | ------------------------ | ------- |
| Venue        | Umaid Haveli                     | umaidhaveli.com          | [x]     |
| Venue        | Rood Mahal                       | roodmahal.com            | [x]     |
| Venue        | Harika Bagh                      | harikabagh.com           | [x]     |
| Venue        | Bhanwar Singh Palace             | bspjaipur.com            | [x]     |
| Venue        | Parampara Banquet Hall (Virasat) | virasatjaipur.com        | [x]     |
| Venue        | Sapphire Inn                     | sapphireinnjaipur.com    | [x]     |
| Caterer      | M L Caterers                     | mlcaterers.com           | [x]     |
| Caterer      | Vinayak Foods & Catering         | vinayakfoodsncatering.in | [x]     |
| Caterer      | G.D. Caterer                     | gdcaterer.com            | [x]     |
| Caterer      | Ganesh Dal Bati Churma           | ganeshdalbati.com        | [x]     |
| Decorator    | JMD Events And Flowers           | jmdeventsandflowers.com  | [x]     |
| Decorator    | Manha Event Decoration           | manhaevent.com           | [x]     |
| Decorator    | The Prince Group of Events       | theprinceevents.com      | [x]     |
| Photographer | Candid Life Photography          | candidlifephotography.in | [x]     |
| Photographer | Viresh Studio                    | vireshstudio.com         | [x]     |
| Photographer | Wedding Velvet                   | weddingvelvet.com        | [x]     |

Approved reserves (checked and approved by Sah-Nikhil on 26 Oct 2026, kept out of `jaipur-vendors.json` because the starter set is exactly 16): AG Events And Tent (ageventsandtent.com, decorator), Matrix Studio (matrixstudio.in) and KumKum Photos (kumkumphotosjaipur.com), both photographers. Swap one in only if a card above is later withdrawn. The Prince Group of Events is a wedding planner with its own decor production, so it is a borderline decorator.

### Schema notes for the contract (C0)

The shape follows the `vendors` and `listedPrices` tables in IMPLEMENTATION_PLAN.md section 5.3, without IDs, with each Vendor's Listed prices nested under it:

- `category` is `venue`, `caterer`, `decorator` or `photographer`.
- `provenance` is a list with one entry per filled field: `{ field, kind, url, sentence, seenAt, confirmedBy }`. `kind` is `ownSite` (with the exact, quote-checked sentence and `confirmedBy: null`) or `instagramProfileHumanChecked` (with `sentence: null` and `confirmedBy: "Sah-Nikhil"`).
- `website` is null and `profileUrl` is set only for an Instagram-only Vendor.

One detail the plan doesn't pin down, which C0's schema needs to match (or `loadStarterSet` needs to map): `capacity.min` is optional, because most Venues state only a maximum ("up to 500 guests"). Optional fields the site doesn't state (`phone`, `email`, `capacity`, `areaServed`, `address`, `marker`) are left out rather than set to null.
