---
id: 2
title: Where can Vendor locations and Listed prices for Indian venues legally come from?
labels: [wayfinder:research]
status: open
assignee: Sah-Nikhil
parent: 1
blocked_by: []
---

## Question

Which public sources can give us, legally and within a one-week build, (a) Vendor identity and location for Markers on the map and (b) Listed prices, with their source and date, for Venues, caterers, decorators and photographers in Indian cities?

Cover:

- Google Places API (New): coverage of banquet halls, marriage gardens, caterers, decorators and photographers in Indian metros; fields and price signals; cost and free usage; caching and display terms (attribution, whether Places content must be shown on a Google map).
- Gemini API grounding with Google Maps and with Google Search: what each returns, cost, availability in India, display requirements.
- OpenStreetMap: coverage of event venues in India through Overpass, plus the tile and Nominatim usage policies for a public deployment.
- Wedding listing sites (WedMeGood, WeddingWire India, VenueLook and similar): whether they show prices publicly, what their terms and robots.txt say about reuse, and whether any official feed or API exists.

End with a recommended v1 approach for one or two demo cities.

Findings: branch `research/vendor-data`, file `research/vendor-data.md`.
