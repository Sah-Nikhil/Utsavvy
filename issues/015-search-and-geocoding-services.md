---
id: 15
title: Which search and geocoding services can power live Vendor discovery?
labels: [wayfinder:research]
status: closed
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/20. Edit it there; this file is no longer updated.

## Question

Live Vendor discovery is in v1: when a Member asks, the Assistant finds Vendors' own websites, reads them, and saves Vendor cards (link, image, Listed price, contact, location) with source URL and date seen. Which services make that work legally and reliably from a hosted app, independently of which LLM provider runs the Assistant?

Cover:

- **Finding Vendor websites**: DuckDuckGo (any official API, its terms on automated queries, and whether server IPs get blocked), Exa, Tavily, Brave Search API, Serper and similar, plus Claude's web search tool. For each: free tier, price, whether results may be stored, and fit for Indian local businesses.
- **Reading a Vendor's own site from our server**: robots.txt etiquette, rate limits, extracting price, phone, address and a preview image, and showing that image on a card with a link back.
- **Geocoding** a Vendor's address into Marker coordinates that may be stored and shown on an OpenStreetMap-based map: OpenCage, LocationIQ, MapTiler, Geoapify, Photon and similar (free tiers, storage terms, coverage of Indian addresses), and why public Nominatim and Google Geocoding don't fit.

End with a recommended v1 combination.

Findings: branch `research/search-geocoding`, file `research/search-geocoding.md`.

## Comments

### 2026-10-21 Sah-Nikhil (resolution)

Findings: branch `research/search-geocoding` (commit `6f90f3d`), file `research/search-geocoding.md`. A terms review, not legal advice; no live quality test was run.

- **Recommended v1: Serper → the Vendor's own site → Geoapify.** All three are independent of the LLM provider, and the planned 500 searches plus 300 geocodes fit in free allowances.
- **Finding sites: Serper** (2,500 free queries with no card, then $50 for 50,000). Its terms let us keep downloaded results "for as long as your use case requires". It is scraped Google data, so use it only to find candidate URLs: never store its snippets, Maps or local-pack fields, or images. Rejected: **DuckDuckGo** (the Instant Answer API "is not a full results API" and there is no official results API), **Brave** (terms forbid storing results "in whole or in part"), **Exa** and **Tavily** (unclear rights to display or keep results), **Claude web search** (tied to one provider, and the model decides how often to search).
- **Reading sites**: our own server-side fetch, on a Member's request only. Identify ourselves in the User-Agent, obey robots.txt, read a handful of pages per site slowly, guard against SSRF, and parse schema.org JSON-LD and HTML (`cheerio`, optionally Readability). Save a Listed price only when the site states amount, currency and unit; otherwise leave it empty and invite a Quote. JavaScript-only sites can fall back to Jina Reader (free key, 500 requests a minute).
- **Card images**: a Vendor's photos are their copyright, and a preview-image URL isn't a license. Default to a neutral or generated card visual and link to the Vendor's site; use their photo only with permission.
- **Geocoding: Geoapify** (3,000 free geocodes a day, commercial use allowed with attribution, results may be stored and shown on an OSM map). Store the confidence level, mark city-level matches as approximate, and let Members drag a Marker to fix it. OpenCage is the paid fallback ($50 a month, results storable permanently). Rejected: public Photon, Mapbox (permanent geocoding is paid and tied to Mapbox maps), and Google ("must not use ... in conjunction with a non-Google map").
- **Before launch**: hand-check a sample of Indian Vendor sites and addresses (own-site hit rate, fetch success, address match rate).

Input to [Which stack do we build on?](./010-stack-choice.md) and [How do Vendors and Listed prices get into v1?](./011-vendors-and-listed-prices-v1.md).

