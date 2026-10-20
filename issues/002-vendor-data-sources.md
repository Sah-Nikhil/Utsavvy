---
id: 2
title: Where can Vendor locations and Listed prices for Indian venues legally come from?
labels: [wayfinder:research]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/7. Edit it there; this file is no longer updated.

## Question

Which public sources can give us, legally and within a one-week build, (a) Vendor identity and location for Markers on the map and (b) Listed prices, with their source and date, for Venues, caterers, decorators and photographers in Indian cities?

Cover:

- Google Places API (New): coverage of banquet halls, marriage gardens, caterers, decorators and photographers in Indian metros; fields and price signals; cost and free usage; caching and display terms (attribution, whether Places content must be shown on a Google map).
- Gemini API grounding with Google Maps and with Google Search: what each returns, cost, availability in India, display requirements.
- OpenStreetMap: coverage of event venues in India through Overpass, plus the tile and Nominatim usage policies for a public deployment.
- Wedding listing sites (WedMeGood, WeddingWire India, VenueLook and similar): whether they show prices publicly, what their terms and robots.txt say about reuse, and whether any official feed or API exists.

End with a recommended v1 approach for one or two demo cities.

Findings: branch `research/vendor-data`, file `research/vendor-data.md`.

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Findings: branch `research/vendor-data` (commit `f16ab6c`), file `research/vendor-data.md`. A terms review, not legal advice.

- **Google Places API (New)** is good for discovery (types include `wedding_venue`, `event_venue`, `banquet_hall`, `catering_service`; no photographer or decorator type), but its terms say Places results shown on a map must be on a **Google Map**, prohibit mixing them with a non-Google map (so no Places Markers on Leaflet/OSM), and only allow storing `place_id` indefinitely (coordinates for 30 days). `priceLevel` / `priceRange` are coarse and have no per-plate or package unit, so they are not a defensible Listed price. India pricing gives 35,000 free Text Search Pro calls a month, if the account qualifies for India billing.
- **Gemini grounding** (Google Maps or Google Search) can answer in the Chat with cited places and pages, but its terms require the citations to be shown with the answer and forbid building a stored index or price database from the results. Good for live conversational discovery, not for filling the Canvas with Listed prices.
- **OpenStreetMap**: venues are tagged `amenity=events_venue` (and `community_centre`); no price data. Coverage is unmeasured (public Overpass servers failed during the check) and is likely weak for caterers, decorators and photographers. The OSM tile server and Nominatim are community services with strict usage policies; CARTO basemaps now need a free key (1M tiles a month for commercial use, 5M non-commercial).
- **Wedding directories** (WedMeGood, WeddingWire India, VenueLook, VenueMonk) show per-plate prices publicly, but all four terms forbid scraping and reuse, and none offers a public data feed. Link out to them for comparison only.
- **Legal Listed prices** come from Vendors' own websites (e.g. a Jaipur banquet hall listing "approximately ₹1,200-₹3,500 per plate" for 200-400 guests), recorded with URL, amount or range, unit, conditions and the date seen.
- **Recommended v1**: hand-curate about 12-20 Vendors in **Jaipur** across the four categories (Delhi NCR only if time allows), with OSM or hand-verified coordinates on an OSM-based map, Listed prices only from first-party pages, Estimates clearly labeled otherwise, and Quotes entered by Members. Optionally let the Assistant do live discovery in the Chat through Gemini Maps grounding, shown with its citations and not stored as Vendors.

Input to [Which stack do we build on?](./010-stack-choice.md) (map library and tiles) and [How do Vendors and Listed prices get into v1?](./011-vendors-and-listed-prices-v1.md).
