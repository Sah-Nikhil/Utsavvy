# Seed data

## Jaipur starter Vendors (`jaipur-vendors.json`)

Issue [#33](https://github.com/Sah-Nikhil/Utsavvy/issues/33). The 16 Jaipur Vendors the app ships with: 6 Venues, 4 caterers, 3 decorators and 3 photographers. Every fact and Listed price comes from the Vendor's own website and keeps the page, the exact sentence and the date seen. `jaipur-vendors.test.ts` checks the file's shape.

**Status: collected, waiting for Sah-Nikhil's card review.** `jaipur-vendors.json` is written only from the approved cards, so it isn't in the repo yet and its seed test fails until then.

### How it was collected

`scripts/collect-starter-set.ts` does the fetching and checking; the comment at its top shows how to run it.

1. **Candidates.** The agent's own web search, used only for result URLs. Directories, marketplaces and social sites were excluded in the search itself and again by the script's blocklist. Instagram-only businesses were noted as leads for a later decision and not collected.
2. **Fetch.** Each site through `politeFetch` (User-Agent `UtsavvyBot/1.0`, `robots.txt` obeyed, about a second between requests to a host, at most 4 pages per site). Page text was cached outside the repo.
3. **Draft.** The agent read the cached text and recorded each fact with the exact sentence it came from. Summaries are one line in the agent's own words.
4. **Quote check.** Code kept a fact only if its sentence is on the cited page after whitespace normalisation, and a price only if its amount and currency are in that sentence.
5. **Geocode.** Geoapify, filtered to India and biased to Jaipur, with ", Rajasthan" added to the address. A match more than 50 km from central Jaipur counts as no match. Matches below 0.8 confidence or at locality or city level are marked approximate.
6. **Review.** Sah-Nikhil checks every card (below).

### Collection run, 21 Oct 2026

| Measure                       | Result                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web searches                  | 22. The first 5, unfiltered, returned only directories and listing sites, so later searches excluded those domains.                                                                                                                                                      |
| Own-site hit rate             | 19 of the 31 candidate sites read (61%) were a Jaipur Vendor's own website usable for the starter set: 16 chosen plus 3 reserves.                                                                                                                                        |
| Fetch success rate            | 33 of 34 page requests (97%); 1 returned 404. 2 more pages were not requested because `robots.txt` disallowed them.                                                                                                                                                      |
| Address match rate            | 17 of 19 Vendors had an address and all 17 got a Marker inside Jaipur, but 0 matched exactly: every Marker is approximate (confidence below 0.8). Before the 50 km check and the added ", Rajasthan", 3 addresses matched in other cities (Chennai, Gujarat, Bengaluru). |
| Facts the quote check dropped | 0 of 83 facts and Listed prices. Every sentence was copied from the cached page text.                                                                                                                                                                                    |
| Comparable Listed prices      | 4 of the 16 Vendors publish one (Parampara Banquet Hall, M L Caterers, Vinayak Foods & Catering, Candid Life Photography). The rest say nothing about price on their site.                                                                                               |

Sites read but not used: thelalit.com (one domain for a hotel chain in many cities), alankarmusicalgroup.com (a music group that also offers catering), lemagnifique-events.com (a Delhi planner with a Jaipur office), kbstudio.in (no Jaipur office), tksolanki.com (Ahmedabad), glimpse-photography.com and goyalsstudio.com (no Jaipur address on the page read), muddyearth.com (404), parastenthouse.com and jsktentandevents.com (tent houses, a free-label category). Skipped by `robots.txt`: skjaipurdecoration.com, vishalphotos.com.

Prices that describe the Jaipur market in general ("catering in Jaipur starts from ₹800-₹1,200 per plate") were not recorded as a Vendor's Listed price, even when they appear on that Vendor's own site.

### Card review

Sah-Nikhil ticks each card after checking its name, address, Marker, and every Listed price and unit against the Vendor's site.

| Category     | Vendor                           | Domain                   | Checked |
| ------------ | -------------------------------- | ------------------------ | ------- |
| Venue        | Umaid Haveli                     | umaidhaveli.com          | [ ]     |
| Venue        | Rood Mahal                       | roodmahal.com            | [ ]     |
| Venue        | Harika Bagh                      | harikabagh.com           | [ ]     |
| Venue        | Bhanwar Singh Palace             | bspjaipur.com            | [ ]     |
| Venue        | Parampara Banquet Hall (Virasat) | virasatjaipur.com        | [ ]     |
| Venue        | Sapphire Inn                     | sapphireinnjaipur.com    | [ ]     |
| Caterer      | M L Caterers                     | mlcaterers.com           | [ ]     |
| Caterer      | Vinayak Foods & Catering         | vinayakfoodsncatering.in | [ ]     |
| Caterer      | G.D. Caterer                     | gdcaterer.com            | [ ]     |
| Caterer      | Ganesh Dal Bati Churma           | ganeshdalbati.com        | [ ]     |
| Decorator    | JMD Events And Flowers           | jmdeventsandflowers.com  | [ ]     |
| Decorator    | Manha Event Decoration           | manhaevent.com           | [ ]     |
| Decorator    | The Prince Group of Events       | theprinceevents.com      | [ ]     |
| Photographer | Candid Life Photography          | candidlifephotography.in | [ ]     |
| Photographer | Viresh Studio                    | vireshstudio.com         | [ ]     |
| Photographer | Wedding Velvet                   | weddingvelvet.com        | [ ]     |

Reserves, used only if a card above is rejected: AG Events And Tent (decorator), Matrix Studio and KumKum Photos (photographers). The Prince Group of Events is a wedding planner with its own decor production, so it is a borderline decorator.

### Schema notes for the contract (C0)

The shape follows the `vendors` and `listedPrices` tables in IMPLEMENTATION_PLAN.md section 5.3, without IDs, with each Vendor's Listed prices nested under it. Three details the plan doesn't pin down, which C0's schema needs to match (or `loadStarterSet` needs to map):

- `category` values are `venue`, `caterer`, `decorator` and `photographer` (lowercase, one word).
- Each `provenance` entry keeps the exact source sentence as well as the page URL and date seen: `{ url, seenAt, sentence }`. The quote check and the card's hover detail both need it.
- `capacity.min` is optional: most Venues state only a maximum ("up to 500 guests").
