# How Vendors and Listed prices get into v1

Decision asset for [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16), settled with Sah-Nikhil on 2026-10-21. Planning only: this describes behaviour and data, not code. Terms follow [CONTEXT.md](../../CONTEXT.md).

Inputs: [Where can Vendor locations and Listed prices for Indian venues legally come from?](https://github.com/Sah-Nikhil/Utsavvy/issues/7) (directories forbid reuse; Google Places data can't go on our map; Listed prices only from Vendors' own sites), [Which search and geocoding services can power live Vendor discovery?](https://github.com/Sah-Nikhil/Utsavvy/issues/20) (Serper for URLs only, our own polite fetch, Jina Reader fallback, Geoapify geocoding, neutral card images), [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15) (Convex, Claude Sonnet default with a Haiku helper, MapLibre with OpenFreeMap), [How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11) (Items in Sections, including a Vendors Section) and [What does the Assistant produce from a first brief?](https://github.com/Sah-Nikhil/Utsavvy/issues/13) (Vendor checklist Entries, the reference table of Estimates by City tier). Research reports: `research/vendor-data:research/vendor-data.md` and `research/search-geocoding:research/search-geocoding.md`.

## Decisions

1. **Two ways in: a starter set and Discovery.** v1 ships with about 16 hand-checked Jaipur Vendors (6 Venues, 4 caterers, 3 decorators, 3 photographers). On top of that, Discovery finds more Vendors on request in any Indian city. The demo Event is in Jaipur.
2. **Listed prices come only from a Vendor's own website.** Never from wedding directories (WedMeGood, WeddingWire, VenueLook, VenueMonk and similar), Google Places, search snippets or a Chat web search answer.
3. **One shared record per Vendor.** A Vendor's public facts, Listed prices and Marker are one app-wide record, shared by every Event. Everything an Event adds (its Shortlisted Vendors, statuses, Quotes, Comments and hand-typed Vendors) stays private to that Event. See [ADR 0008](../adr/0008-vendors-are-one-shared-record.md).
4. **Discovery results arrive in the Chat; Members choose what goes on the Canvas.** Nothing found by Discovery lands on the Canvas until a Member taps "Add to Canvas".
5. **Extraction is checked against the page.** Every extracted fact carries the exact sentence it came from, and code keeps it only if that sentence is really on the page.
6. **Every price found is kept; only some are comparable.** A Listed price always keeps its sentence, page and date seen. It is comparable (usable in the Budget and map filters) only when its unit is per_plate, per_person, per_day or per_function and its amount is clear.
7. **Prices refresh on request and keep their history.** No background crawling.
8. **Eight fixed categories, plus any other label.** Venue, Caterer, Decorator, Photographer, Mehendi artist, Makeup artist, DJ or music, and Priest (pandit). A Vendor outside these gets its own label, which becomes its own category.
9. **Shortlisted Vendors are linked to Vendor checklist Entries,** each link with its own status: Considering, Contacted, Quoted, Booked, Dropped.
10. **The Budget shows Estimate, Listed price and Quote side by side, never mixed.** A Member decides when a Quote replaces a budget Entry's amount.
11. **Chat web search uses Claude's web search tool only,** for Events running on Claude. Its answers stay in the Chat.
12. **Listed prices also tune the reference table,** by hand at build time and automatically in the app, behind guardrails (see "Pooling Listed prices into the reference table").
13. **Instagram-only Vendors may fill starter-set gaps** (added 2026-10-21). See "The starter set".
14. **Google places are browsed and saved only through Google's own components** (added 2026-10-21). See "Google places". A Google place is never a Vendor.

## Categories

| Category | Typical unit | Table-backed Estimate | In the starter set |
|---|---|---|---|
| Venue | per_plate or per_function | yes | 6 |
| Caterer | per_plate | yes | 4 |
| Decorator | per_function | yes | 3 |
| Photographer | per_day or per_function | yes | 3 |
| Mehendi artist | per_person or per_function | yes | no |
| Makeup artist | per_person | yes | no |
| DJ or music | per_function | yes | no |
| Priest (pandit) | per_function | yes | no |

Any other label (tent house, dhol, baraat band and ghodi, invitations printer, choreographer, idol maker) becomes its own category with its own map filter. Discovery, Quotes and shortlisting work the same for it. Its Estimate is the exception described in "Estimates on Vendor cards".

Which reference-table rows each fixed category maps to (for example, a Caterer's per_plate Listed price against "Catering, main dinner") is declared in the reference table, which the first-brief design owns.

## Discovery

### When it runs

- A Member asks in the Chat ("caterers near Vaishali Nagar under ₹800 a plate"), or
- A Member taps "Find Vendors" on a Vendor checklist Entry, which fills in the category, the Event's city and the Function's Guest count.

Discovery never runs on its own, and never without a Member's request.

### The flow

1. **Known Vendors first.** The Assistant immediately shows shared Vendors that match the category and city (the starter set plus anything found before), filtered by the Function's needs.
2. **One search.** Serper organic web search, India locale, with a query like `caterer Vaishali Nagar Jaipur official website`, top 10 results. Only the result URLs are used. Serper's snippets, titles, images, Maps and local-pack fields are never stored or shown. A query's URL list is cached for 7 days, so the same question doesn't spend another search.
3. **Filter candidates.** Drop directories, marketplaces and social sites (WedMeGood, WeddingWire, VenueLook, VenueMonk, ShaadiSaga, WeddingBazaar, JustDial, Sulekha, IndiaMART, Zomato, Tripadvisor, magicpin, Instagram, Facebook, YouTube, Pinterest, LinkedIn, Google Maps and similar). The list is a setting. Keep one URL per domain. A domain that is already a shared Vendor is shown from the record, not fetched again, unless its facts are older than 30 days.
4. **Read up to 5 sites in parallel,** using the polite fetch rules below.
5. **Own-site check.** The helper model decides whether the page is one business's own site or a listing, blog or aggregator. The business name must appear on the page. Anything else is dropped.
6. **Extract and check** (see "Extraction").
7. **Geocode** the address with Geoapify (see "Markers").
8. **Save and stream.** Each new Vendor is saved as a shared record and streamed into the Chat as a Vendor card as soon as it is ready. The Chat shows a status line while it works ("Reading 3 of 5 sites"). Expect about 10 to 20 seconds; the whole run stops at 30 seconds and keeps what it has.
9. **Instagram and other social hits** are listed at the end of the reply as plain links ("Also on Instagram: @example_decor"). They are not saved as Vendors. Our server never opens Instagram or Facebook pages.

### Polite fetch rules

- Identify ourselves in the User-Agent with a contact URL (for example `UtsavvyBot/1.0 (+https://<app>/bot)`).
- Read and obey `robots.txt` for each host. A disallowed page is skipped.
- At most 4 pages per site: the page found, plus up to 3 linked pages on the same site whose link or URL suggests prices, menus, packages, contact or about. One request at a time per host, about a second apart.
- Timeouts (about 8 seconds a page), a size cap (about 2 MB) and at most 3 redirects. Only `http` and `https` on the default ports.
- **SSRF guard:** resolve every host, and every redirect target, before fetching, and refuse loopback, private, link-local and cloud-metadata addresses.
- Honour `429`, `403` and `Retry-After`. No logins, no CAPTCHA solving, no directory pages.
- A page with almost no text (built by JavaScript) is retried once through Jina Reader. Jina doesn't change these rules: a site we may not read directly is not read through Jina either.

### When things go wrong

| Situation | What the Member sees |
|---|---|
| `robots.txt` disallows, or the site refuses | That site is skipped silently; the others still arrive. |
| The page can't be read, even through Jina | Skipped. If every site fails, the Assistant says so and offers the options below. |
| No own websites found (only directories and social pages) | "I couldn't find these Vendors' own websites." Plus a "Compare on WedMeGood" link for that city and category, Chat web search, and adding a Vendor by hand. |
| Serper's quota is used up | Known Vendors only, with a short notice that live search is paused. |
| The Event has used its 10 Discovery runs for the day | Known Vendors only, with "Live search is limited to 10 times a day per Event; try again tomorrow." |
| A geocode is only city-level or low-confidence | The Vendor is saved with an approximate Marker (see "Markers"). |

The daily cap protects Serper's 2,500 free searches. Refresh doesn't count against it (it spends no search), but each Vendor can be refreshed at most once a day.

### Adding a Vendor by hand

- **Paste a website URL.** The same fetch, check and extract steps run on that one site, and the result is a normal shared Vendor.
- **Type it in.** Name, category, phone and area, for a Vendor with no website, such as the family's usual caterer. This Vendor is private to the Event (it is the family's contact, not public data). It has no Listed prices, only Quotes, and a Marker only if a Member drops one on the map.

## Extraction

1. **Structured data first.** Read schema.org JSON-LD on the page (`LocalBusiness` and its subtypes, `PostalAddress`, `Offer`, `priceRange`).
2. **Then the helper model** (`claude-haiku-5-5`, or the Event key's helper model under [ADR 0004](../adr/0004-event-keys.md)) reads the page text and returns each field together with the exact sentence it came from.
3. **Code checks every field.** After normalising whitespace, the quoted sentence must appear in the page text, and for a price, the amount and currency (₹, Rs or INR) must appear in that sentence. A field that fails is dropped, never guessed. So a made-up price can never become a Listed price.
4. Page text is untrusted. It is treated as data in the extraction prompt, never as instructions, and is sanitised before anything from it is displayed.

## The Vendor card

| Section | Fields | Provenance shown |
|---|---|---|
| Identity | Name, category (or its free label), website | "from example.in · seen 21 Oct 2026" |
| Contact | Address with locality and city, phone, email | Page and date per field |
| Capacity (Venues) | Minimum and maximum Guests | Page and date |
| Area served (other Vendors) | Localities or "all of Jaipur" | Page and date |
| Listed prices | Each Listed price, comparable or not | Page, exact sentence on hover or tap, date seen |
| Summary | One line written by the Assistant in its own words, never copied prose | "Summary by the Assistant" |
| Estimate | Shown when no comparable Listed price exists (see below) | Its basis string |
| Link-out | "Compare on WedMeGood": the WedMeGood listing page for that city and category, not a deep link to a specific listing | None needed |

Every stored fact keeps the URL of the page it came from and the date it was seen. The card shows one short provenance line per section and the full detail on hover or tap. An Instagram-only starter Vendor reads "from its Instagram profile · checked 22 Oct 2026 by Sah-Nikhil" instead, and has no sentence to show.

**Image:** a neutral illustration per category (one generic illustration for free-label categories). A Vendor's own photos are their copyright, and a preview-image URL is not a licence, so we never show or store them. Search-engine thumbnails are never used.

On an Event's Canvas the card also shows that Event's private layer: a chip per linked checklist Entry with its status ("Sangeet: Quoted · Wedding: Booked"), the current Quote per Entry, and Comments.

## Listed prices

A Vendor can have several Listed prices (veg and non-veg plates, weekday and weekend rates). Every Listed price stores:

- **Source:** page URL, the exact sentence, and the date seen.
- **Comparable fields,** filled only when the unit and amount are clear:
  - Amount: a single number or a min-max range, in INR.
  - Unit: `per_plate`, `per_person` (makeup, mehendi), `per_day` or `per_function`.
  - Qualifier: `exact`, `approx` or `starting`.
  - Diet: veg, non-veg or either.
  - Guest range, when the site states one.
  - Inclusions note, in our words ("excl. GST, decor extra").

A price in any other unit ("₹500 per hand", "₹3,000 per hour") or with no clear amount ("packages from ₹50k, call us") is still saved and shown, as text, marked **not comparable**. It is left out of the Budget and the map's price filter, and the card invites a Quote.

When a Vendor has no Listed price at all, the card says "No price on their website", shows the Estimate and invites a Quote.

### Refresh and history

- A card whose facts are more than 30 days old shows "Seen 45 days ago" and a **Refresh** button. Refresh re-reads the Vendor's site (same polite rules) and saves new Listed prices dated today. Old Listed prices are kept as history, not overwritten.
- Adding a Vendor to an Event refreshes it once, automatically, if its facts are more than 30 days old.
- If a refresh changes a Listed price that an Event is comparing against, that Event's card shows "Listed price changed from ₹1,200 to ₹1,400 on 12 Nov".
- No scheduled or background refresh of all Vendors.

## Estimates on Vendor cards

- For the eight fixed categories, the Estimate comes from the first-brief reference table for the Event's City tier, with its basis string.
- **For a free-label category with no table row, the Assistant may generate an Estimate**, labelled "Estimate (not from our cost table)", with the basis "Assistant's general estimate, not from the Utsavvy reference table". It is generated once per category and City tier and reused. Sah-Nikhil chose this knowingly as an exception to the first-brief rule that the LLM never writes an amount; the build plan must carry the exception.
- Estimates are never stored as, or shown as, Listed prices.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: the free-label exception is now the general rule. Every Estimate, for any category, comes from the cascade: researched with web search first, then the reference table, then the Assistant's own estimate labelled "Assistant's own estimate, no sources". A free-label line has no table row, so it is researched or the Assistant's own estimate. A Vendor card reads the city's cached researched range for its category when one exists, and the table otherwise.

## Pooling Listed prices into the reference table

Both, decided on 2026-10-21:

- **By hand at build time.** Collecting the starter set produces real Jaipur Listed prices. The reference-table build slice uses them to check and adjust its ranges, citing them in the table's Source column.
- **Automatically in the app, behind guardrails:**
  - Only comparable Listed prices count, and only when their category, unit and diet match a reference-table row (the table declares which ones feed each row).
  - A row's range for a City tier moves only once it has at least 5 comparable Listed prices from different Vendors, seen in the last 12 months. Prices are normalised to tier Y with the tier multipliers.
  - Outliers more than 3 times the median, or less than a third of it, are ignored.
  - The pooled range is the 25th to 75th percentile of the Listed prices' midpoints.
  - Estimates already on a Budget never change. Only new plans and new budget Entries use a moved range.
  - The basis string says what it used, for example "Y-tier range ₹1,100-₹2,300 per plate, Utsavvy reference table + 7 Listed prices from Vendors' own sites, Oct 2026".
  - Tests pin the hand-checked table, with pooling off, so the first-brief worked examples stay fixed.
  - Chat web search answers, Quotes and generated Estimates are never pooled.

## Shortlisted Vendors and the Vendor checklist

- "Add to Canvas" on a Vendor card makes it a **Shortlisted Vendor** of the Event, placed in the Vendors Section. It is linked to the Vendor checklist Entry for its category (and Function, when known). If no such Entry exists, one is created.
- A Vendor appears **once** per Event, even when it serves several Entries (the same caterer for the Sangeet and the Wedding). Each link to an Entry has its own status and its own Quotes.
- **Statuses per link:** Considering, Contacted, Quoted, Booked, Dropped. Members set them by hand. Adding a Quote moves the link to Quoted automatically if it was at Considering or Contacted.
- **Booking** one Vendor for an Entry marks that Entry done.
- The first-brief Entry status (to find, shortlisted, booked) is worked out from its links: to find while no link is active (not Dropped), shortlisted once one is, booked once one link is Booked.
- Who may shortlist, change statuses, refresh Vendors or drag Markers is for [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14).

## Quotes

- **Form:** "Add Quote" on a Shortlisted Vendor's card, for one of its linked Entries. Fields: amount, unit (one of the four units, or a total), the Function or Functions it covers (optional; none means the whole Entry), the Guest count it assumes, the date received, a note, and an optional photo or PDF of the quote (Convex file storage).
- **Paste into the Chat:** a Member pastes the Vendor's WhatsApp message ("veg 950/plate for 300 pax, live counters extra"). The Assistant fills the same form and the Member confirms before it is saved.
- A link can have several Quotes. The newest is current; older ones are kept.
- Quotes are private to the Event and never pooled. Opt-in pooling of Quotes is a later idea ([Ideas discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/23)).

## The Budget comparison

Each budget Entry has a **planned amount**, which starts from its Estimate. Beside it, never averaged or mixed into it, the Budget shows:

- the **Estimate** with its basis,
- each Shortlisted Vendor's **comparable Listed price**, worked out for that Function's Guest count and labelled as such ("₹1,200/plate × 300 = ₹3.6L, from Listed price"),
- each Shortlisted Vendor's current **Quote**.

Over or under, against the planned amount and against the Function's budget, is shown in colour. When a Vendor is Booked, the Assistant asks "Use the ₹2.85L Quote as this line's amount?", and a Member confirms. The planned amount never changes by itself.

A Quote that names Functions is compared against those Functions' budget Entries; one that names none is compared against all budget Entries its checklist Entry pays for.

## Markers and the map

- **What's on it:** Markers for the Event's Shortlisted Vendors, coloured by status, plus other shared Vendors in the Event's city as faint Markers.
- **Filters:** category, plus picking a Function fills in its needs: capacity at least that Function's Guest count (Venues), and a comparable Listed price within its budget Entry.
- **Cities:** any Indian city. The Event's city is geocoded once and centres the map. Only Jaipur has the starter set.
- **Geocoding:** Geoapify forward geocoding of the address from the Vendor's own site (or, for an Instagram-only starter Vendor, the address Sah-Nikhil typed from its public profile), filtered to India and biased to the Event's city. Those two, and a Marker a Member drops from their own knowledge, are the only sources of a Marker. Never Google: not a Places location, and not a geocoded address that Google returned. Store the coordinates, the confidence and match type, the provider and its attribution. Show Geoapify and OpenStreetMap attribution near the map.
- **Approximate Markers:** a city- or locality-level match, or a low-confidence one (the build sets the threshold; start at 0.8), shows as a hollow Marker labelled "approximate". Any Member can drag it to the right spot, which updates the shared record and is kept in the edit history.
- **Vendors without an address** (a caterer with only an area served) have no Marker. They are listed beside the map.
- **Hand-typed Vendors** have a Marker only if a Member drops one.

## Chat web search

- Uses Claude's web search tool (Anthropic's `web_search`, at most 3 searches per reply), so it works only when the Event runs on Claude (the default model or an Anthropic Event key). On Gemini or OpenAI, the Assistant offers Discovery instead. Other providers' search tools are a later idea ([Ideas discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/22)).
- Citations are always shown with the answer.
- Answers stay in the Chat. A Member can save one as a Note, with its citations. Its prices never become Listed prices, never change Estimates and are never pooled. A Member who wants a number on the Canvas records a Quote after talking to the Vendor.
- Anthropic's service does the fetching. Our server never opens directory pages itself.
- An answer may cite Instagram profiles and directory pages as live links. They stay links in that answer: never saved as Vendors, facts or Listed prices.
- This replaces the first-brief design's mention of Gemini Search or Maps grounding for Chat lookups; the rule that answers are shown with sources and never stored is unchanged.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: Estimates now run their own web search, separate from the Chat's, and can cite a Shortlisted Vendor's Listed price as a source. A Chat answer still never changes an Estimate already on the Canvas, and the Listed price still shows as its own badge beside the Estimate.

## The starter set

- About 16 Jaipur Vendors: 6 Venues, 4 caterers, 3 decorators, 3 photographers.
- **Own sites first.** A Vendor comes from its own website whenever one can be found.
- **Instagram-only Vendors fill gaps** (decided 2026-10-21). When a category can't be filled from own sites, Sah-Nikhil may add a Vendor whose only presence is a public Instagram business profile. He reads the profile himself and types its facts: name, category, area or address, public business phone, the profile URL and the date he checked it. The record's provenance says `instagramProfileHumanChecked` and that Sah-Nikhil confirmed it. It has **no Listed prices**, so its card says "No price on their website", shows the Estimate and invites a Quote. Its Marker comes from Geoapify geocoding the address he typed. No captions, photos, reviews or prices are copied. Automated reading of Instagram or Facebook, directories, Google Places data and search snippets stay excluded.
- Collected by running the Discovery pipeline itself on Jaipur queries, then hand-checking every card against the Vendor's site (name, address, Marker position, every Listed price and its unit).
  > Amended by [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 2: Discovery comes after v1, so an agent collects the starter set under the same polite fetch rules and quote check, and Sah-Nikhil hand-checks every card.
- Stored as seed data in the repo and loaded by the demo Event's reset script.
- The collection run is also the pre-launch quality check the search research asked for. Record the own-site hit rate, fetch success rate, address match rate and extraction accuracy in the seed notes.
- Its Listed prices feed the hand check of the reference table.

## Google places

Decided with Sah-Nikhil on 2026-10-21 ([ADR 0011](../adr/0011-google-places-only-through-the-places-ui-kit.md)).

- **The Google places sheet.** A full-screen sheet built from Google's Places UI Kit (Essentials: `gmp-place-search` and `gmp-place-details-compact`), themed with the `--gmp-mat-*` CSS properties to match our look. A Member types a query such as "mehendi artists near Malviya Nagar, Jaipur", sees Google's list, opens one for Google's details, with Google's attribution always visible. The Vendor map is hidden while the sheet is open.
- **Saving.** Picking a place shows "Save to this Event" with a required note in the Member's own words ("Riya's mehendi artist, ask about the sangeet"). Saving makes a **Google place** Item in the Vendors Section holding only the place ID and that note, plus who saved it and when. Utsavvy stores no Google name, address, phone, rating, photo or coordinates anywhere: not in the database, a Vendor record, the card or a Marker.
- **The card** shows a neutral illustration, "Google place", the Member's note and "Saved by Meera · 21 Oct 2026", with two buttons: "View Google place" (reopens the sheet with Google's details for that place ID) and "Open in Google Maps" (`https://www.google.com/maps/search/?api=1&query=<the Event's city>&query_place_id=<place ID>`).
- **Not a Vendor.** A Google place has no Listed price, Marker, checklist link, status or Quote, and never feeds the reference table. Nothing from the sheet goes into the Chat, and the Assistant sees only the Member's note.
- **Who.** Any Member can browse, save and delete Google places (deleting goes to history, like any Item). Viewers see the cards and can open them, but don't browse or save.

**Considered and rejected:** Places results in the Chat, with shortlisting putting them on our map. Google's terms forbid Places content with or near a non-Google map and storing anything but place IDs, so neither the result list in our Chat nor a Marker drawn from Places (its location, or Geoapify geocoding a Places address) is allowed.

## Worked examples

### A Venue with a price range

Parampara Banquet Hall's own page ([virasatjaipur.com](https://virasatjaipur.com/venues/parampara-banquet-hall), seen 2026-10-21) states approximately ₹1,200-₹3,500 per plate for 200-400 Guests.

| Field | Value |
|---|---|
| Amount | ₹1,200 to ₹3,500 |
| Unit | per_plate |
| Qualifier | approx |
| Diet | either |
| Guest range | 200 to 400 |
| Source | the page URL, the sentence, 21 Oct 2026 |
| Comparable | yes |

For a Sangeet with 300 Guests, the Budget shows "₹3.6L to ₹10.5L, from Listed price" beside the Estimate from the reference table (catering, main dinner, tier Y: ₹1,000 to ₹2,000 per plate, so ₹3L to ₹6L).

### A caterer with a starting price

Vinayak Foods & Catering's own site ([vinayakfoodsncatering.in](https://www.vinayakfoodsncatering.in/), seen 2026-10-21) states "starting at ₹250 per plate" and says the exact amount depends on menu and scale.

Saved as ₹250, per_plate, qualifier starting, diet either, inclusions note "depends on menu and scale". Comparable, and the Budget labels it "from ₹250/plate (starting price)".

### A price that isn't comparable

Illustrative: a mehendi artist's site says "Bridal mehendi ₹500 per hand". There's no `per_hand` unit, so it is saved as text with its sentence, page and date, shown on the card as "₹500 per hand (not comparable)", left out of the Budget, and the card invites a Quote.

### A Quote pasted from WhatsApp

Illustrative: a Member pastes "Veg 950/plate for 300 pax, live counters extra" from Example Caterers into the Chat. The Assistant proposes a Quote of ₹950 per_plate, 300 Guests, Function: Sangeet, note "live counters extra", received today. The Member confirms. The link moves from Contacted to Quoted, and the Sangeet catering line shows Estimate ₹3L-₹6L, Listed price from ₹250/plate, and Quote ₹2.85L side by side.

## For the build plan

Handed to [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18):

- Reconcile with the first-brief design: Chat lookups go through Claude web search, not Gemini grounding; generated Estimates for free-label categories are an exception to "the LLM never writes an amount"; the reference table gains automatic pooling behind the guardrails above.
- Slices that fall out of this design: shared Vendor records and seed data; the Discovery pipeline (search, filter, polite fetch with SSRF guard, extraction with quote check, geocoding); Vendor cards; Shortlisted Vendors and checklist links; Quotes (form and Chat paste); the Budget comparison; the map; Chat web search; pooling.
- Settings: the directory and social blocklist, the 30-day freshness window, the 10-runs-a-day cap, the geocode confidence threshold, the pooling guardrails.

## Sources

Checked 2026-10-21: research branches `research/vendor-data` and `research/search-geocoding`; [Serper terms](https://serper.dev/terms); [Geoapify geocoding](https://www.geoapify.com/geocoding-api/); [Claude web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) ($10 per 1,000 searches, citations required when displayed); [Gemini API terms](https://ai.google.dev/gemini-api/terms); [RFC 9309](https://www.rfc-editor.org/info/rfc9309/); [Jina Reader](https://jina.ai/reader/); first-party pages cited in the worked examples.
