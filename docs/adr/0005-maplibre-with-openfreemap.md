# The Vendor map uses MapLibre GL JS with OpenFreeMap tiles

Markers are drawn with MapLibre GL JS (`maplibre-gl`, through `react-map-gl/maplibre`) on OpenFreeMap's vector basemap. OpenFreeMap needs no key and no signup, states no limits on views or requests, allows commercial use, and adds its attribution automatically in MapLibre. The vector map zooms smoothly and can be styled to match the Utsavvy theme. Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15). Google Places Markers are excluded because Places results may only be shown on a Google map ([Where can Vendor locations and Listed prices for Indian venues legally come from?](https://github.com/Sah-Nikhil/Utsavvy/issues/7)).

## Considered options

- **Leaflet with CARTO tiles**, as in SahayakOS: the code would be reused almost unchanged. But CARTO now needs a key requested by email, the free allowance depends on declaring the use non-commercial, and CARTO can suspend free keys without notice.
- **Leaflet with OpenStreetMap's own tiles**: no setup, but the servers are best-effort and may block an app without notice, which is too risky on judging day.
- **Stadia Maps** (free plan bans commercial use) and **MapTiler** (free plan meant for "personal, or non-commercial use").

## Consequences

- The SahayakOS map component (`city-map.tsx`) is a reference for behavior (filters, Marker selection, detail panel, fit to bounds), not code to copy, because it is written for Leaflet.
- OpenFreeMap is run by one person with no uptime guarantee, and its terms require the integrator to be at least 18. The style URL is a single setting so the basemap can be swapped (for example to a CARTO vector style with a key) without touching map code.
- The map stays zoomed to a city (Jaipur first), so country borders don't come into view.

## Sources

Checked 2026-10-21: [OpenFreeMap](https://openfreemap.org/) and its [terms](https://openfreemap.org/tos/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [CARTO basemap terms](https://carto.com/legal/basemap-terms/), [Stadia pricing](https://stadiamaps.com/pricing/), [MapTiler pricing](https://www.maptiler.com/cloud/pricing/).
