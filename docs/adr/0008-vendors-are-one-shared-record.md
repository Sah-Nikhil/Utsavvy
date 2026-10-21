# Vendors are one shared record across all Events

A Vendor's public facts (name, category, website, contact, capacity, Listed prices with their history) and its Marker are stored once, app-wide, keyed by the Vendor's own website, and every Event that shortlists it points at that one record. What an Event adds stays private to it: its Shortlisted Vendors and their statuses, Quotes, Comments, and Vendors a Member typed in by hand. So a Vendor that one family's Discovery found shows up for the next family in the same city, without fetching its site again, and a Marker fixed by one Member is fixed for everyone. We chose this because the facts are public and come from the Vendor's own site, the starter set then needs no copying into each Event, and fewer fetches keeps us polite to Vendors' sites and inside Serper's free searches. Decided in [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16); details in [docs/design/vendors.md](../design/vendors.md).

## Considered options

- **A copy of the Vendor per Event.** Fully isolated and simple to secure, but the starter set has to be copied into every Event, the same site is fetched again for each Event, and two Events can show different prices for the same Vendor.
- **Freeze the price per Event, share only identity.** Simple, but Events go stale silently.
- **Wedding directories or Google Places as the shared source.** Ruled out by their terms ([Where can Vendor locations and Listed prices for Indian venues legally come from?](https://github.com/Sah-Nikhil/Utsavvy/issues/7)).

## Consequences

- Listed prices are never overwritten: a refresh adds new ones dated today and keeps the old ones, and an Event comparing against a changed price is told so.
- Event-scoped Convex functions must never leak one Event's private layer (Quotes, statuses, Comments, hand-typed Vendors) through the shared Vendor.
- Any Member can move a shared Marker, so Marker moves go in the edit history, and the demo reset script restores the starter set.
- Shared Listed prices can be pooled into the reference table of Estimates, behind guardrails.
