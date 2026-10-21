# Google places are shown only through Google's Places UI Kit and kept as place IDs

Members can browse Google Maps places (a mehendi artist near Malviya Nagar, a tent house in Pune) in a full-screen Google places sheet built from Google's Places UI Kit, Essentials tier (`gmp-place-search` and `gmp-place-details-compact`). Google's own components draw every name, address, rating, photo and the attribution, themed with the `--gmp-mat-*` CSS custom properties so the sheet matches our tokens. When a Member saves one, Utsavvy keeps only Google's place ID, the Member's own note, who saved it and when, as a Google place on the Canvas. Opening it again loads fresh details by place ID inside the sheet; "Open in Google Maps" hands off to Google Maps. No Google content reaches our database, a Vendor record, a Canvas card, a Marker, the Chat or the Assistant. Decided with Sah-Nikhil on 2026-10-21 as MUST slice S20.

We chose the UI Kit because Google's service terms (section 15.1) expressly allow it alongside a non-Google map, it emits a `gmp-select` event with the place ID so Save works, and its Essentials requests fit inside the monthly free cap. Place IDs are the one piece of Places data Google lets an app keep indefinitely.

## Considered options

- **Places results in the Chat, with shortlisting putting them on our map** (Sah-Nikhil's earlier idea). Rejected under Google's terms: Places content may not be shown with or near a non-Google map, and only place IDs may be stored. A Marker from Places geometry, or from geocoding an address Places returned, would still be Google content on MapLibre. The Chat history is stored and shared, which Places content isn't allowed to be.
- **Maps Embed API in search mode.** Free and allowed in an isolated sheet, but the iframe is cross-origin and has no selection event, so a Member couldn't save anything. Kept as the fallback if the UI Kit spike fails.
- **Google Search in an iframe, or Programmable Search.** Google Search and Google Maps send `X-Frame-Options: SAMEORIGIN`, the Custom Search JSON API is closed to new customers, and new Programmable Search engines can't search the whole web.

## Consequences

- A Google place is not a Vendor. It has no Listed price, Marker, checklist link or Quote, and it never feeds the reference table.
- Any Vendor Marker comes from Geoapify geocoding the address the Vendor publishes on its own site (or a human-checked profile address in the starter set), or from a Member dropping one from their own knowledge. Never from Google.
- The UI Kit components are pre-GA, so S20 starts with a spike, and the app depends on a billed Google Cloud project and a browser key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) restricted by HTTP referrer, with a daily request cap so a copied key can't run up a bill.
- The site's Content Security Policy must allow Google Maps JavaScript.
- MapLibre stays hidden while the sheet is open, so the two maps never share a screen.

## Sources

Checked 2026-10-21: [Places UI Kit overview](https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview), [Place Search and `gmp-select`](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-search), [custom styling](https://developers.google.com/maps/documentation/javascript/places-ui-kit/custom-styling), [Maps service terms, sections 14 and 15](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Maps Platform terms, section 3.2.3](https://cloud.google.com/maps-platform/terms), [place ID caching](https://developers.google.com/maps/documentation/places/web-service/policies), [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details), [Embed API](https://developers.google.com/maps/documentation/embed/embedding-map).
