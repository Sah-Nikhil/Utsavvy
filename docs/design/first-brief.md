# What the Assistant produces from a first Brief

Decision asset for [What does the Assistant produce from a first brief?](https://github.com/Sah-Nikhil/Utsavvy/issues/13), settled with Sah-Nikhil on 2026-10-21. Planning only: this describes behaviour and data, not code. Terms follow [CONTEXT.md](../../CONTEXT.md).

Inputs: [Which LLM and agent tooling should the Assistant run on?](https://github.com/Sah-Nikhil/Utsavvy/issues/10) (first plan generated against an explicit JSON schema and applied through the same Canvas mutations; a Member confirms budget total changes), [Which Inspiration sources can we use, and how can Pinterest come in?](https://github.com/Sah-Nikhil/Utsavvy/issues/8) (Pexels, uploads, paid Gemini images; Pinterest only through its widget) and [Where can Vendor locations and Listed prices for Indian venues legally come from?](https://github.com/Sah-Nikhil/Utsavvy/issues/7) (Jaipur demo city; Estimates always labelled; grounded answers are never stored).

## Decisions

1. **Intake is free text first, then chips.** The Member describes the Event in their own words. The Assistant extracts what it can and asks only for missing essentials, one question at a time, as tap-to-answer chips with a "type my own" option.
2. **Essentials** for every Event: Event type, city, date (exact day or just a month), rough Guest count, total budget (or "help me set one"). Weddings add Tradition, then Functions. Birthdays add whose birthday and the age. Community events add the kind of event (which sets its programmes and days) and, optionally, the number of households. Seven chip questions at most.
3. **Anything not given becomes an Assumption**, tagged "assumed" on the Canvas and listed on the Brief summary. One tap confirms or changes it. Prices are never Assumptions; they are Estimates.
4. **Vibe pick** is optional and comes after the essentials: 12 curated images for the Event type (and Tradition, for weddings), with "Show me more" running a live Pexels search from the Brief's words. The Member taps 3 to 5 or skips. It produces the Theme. Tapped images are saved as Inspirations. If Pexels is down, only the curated set shows.

   > Amended on 2026-10-21 ([ADR 0012](../adr/0012-stock-photos-from-a-local-hand-curated-library.md), inspirations.md rules 21 to 23): the 12 images come from Utsavvy's stock library, "Show me more" shows the rest of the set, and there is no live Pexels search.

5. **Brief summary before generating.** The Assistant posts a Brief summary in the Chat (type, city, dates, Guests, budget, Tradition, Functions, Theme, Assumptions, Budget check). Members edit any field or tap "Make my plan". The plan then streams onto the Canvas section by section.
6. **Estimates come from a reference table by City tier**, not from the LLM's memory. The LLM decides the plan's structure (Functions, Guest split, which budget Entries, Suggestions, run sheets); a deterministic pricing step fills every amount from the table. Live web lookups happen only when a Member asks in the Chat, are shown with their sources, and are never stored or fed back into the table.

   > Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: each line's price per unit comes from a cascade. The Assistant researches current prices with web search first, the reference table is the fallback, and the Assistant's own knowledge is the last resort. Every Estimate shows which one it came from. The LLM still decides the structure, and code still does every total, the bands, rounding and dates.
7. **Budget rolls up** as Function totals + Event-wide + Contingency (10% by default) = Event total. Every budget Entry shows its Estimate; a Quote, when one arrives, sits beside it and is never blended into it.
8. **Budget check bands.** Below the typical minimum: the Brief summary flags it with three fixes before any plan exists, and the Member can still choose "Plan at my budget anyway". Between minimum and typical: plan at the budget with a "tight" note. Above the high end: every Entry stops at its high end and the rest shows as Unallocated.

   > Amended on 2026-10-22: the minimum, typical and high figures are worked out over the estimate cascade's ranges ([ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md)), and v1 offers only "Raise the budget" among the fixes (see "Brief summary" below).
9. **Timeline** is built backwards from the date using typical lead times. Entries whose ideal date has passed are marked late and pulled into the next three weeks by priority, with a short note. A month-only date assumes the 15th.
10. **Every Function gets a short run sheet** (6 to 10 timed Entries, all assumed), as part of the Timeline.
11. **Vendor checklist Entries** name a Vendor category, the Function it serves (or Event-wide), a book-by date from the Timeline, the budget Entry or Entries it pays for, and a status: to find, shortlisted, booked. Which actual Vendors are suggested is left to [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16).
12. **5 to 8 Suggestions**, drawn from the Theme and the Brief, each tied to the Event or one Function, with an Estimate where it costs money. "Add to plan" turns one into a budget Entry and a Timeline Entry; "Not for us" dismisses it. Suggestions are Items; they don't count in the Budget until added.
13. **Community events** treat each programme as a Function (a repeating programme such as daily aarti is one Function with a date range). If households are known, the Budget shows the per-household share. Collecting or tracking contributions is out of scope.
14. **Changing an essential after the first plan** (e.g. 300 Guests to 400): the Assistant sends a Proposal showing what would change (catering up by so much, Venue capacity to recheck, total up by so much) and applies it only when a Member accepts it. Entries Members edited or got Quotes for are kept. Multi-Member behaviour belongs to [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12).

## Question flow

### Opening

The Assistant opens a new Event with one line: "Tell me about what you're planning: what you're celebrating, where, roughly when, for how many people, and your budget if you have one."

It extracts the essentials from the reply (see `BriefExtraction` below), then asks the missing ones in this order. A question is skipped when the free text already answered it.

### Chip questions

| # | Asked when missing | Chips |
|---|---|---|
| 1 | Event type | Wedding · Birthday · Community event |
| 2 | City | Jaipur · Delhi · Mumbai · Bengaluru · Pune · type a city. A city not on the X or Y list is treated as Z, shown as an Assumption ("treated as a smaller city"). |
| 3 | Date | pick a date · just the month · not decided yet. Month only: the 15th, assumed. Not decided (weddings): 12 months from today on the 15th, assumed. For a community festival the Assistant proposes the festival's dates and asks to confirm. |
| 4 | Guests | Wedding: 100 · 200 · 300 · 500 · 800+. Birthday: 20 · 50 · 100 · 200. Community: 50 · 100 · 250 · 500 · 1,000+ at the busiest programme. |
| 5 | Budget | Wedding: ₹10L · ₹25L · ₹50L · ₹1Cr. Birthday: ₹50k · ₹1L · ₹2L · ₹5L. Community: ₹50k · ₹2L · ₹5L · ₹10L. Plus "Help me set one", which sets the budget to the typical Estimate as an Assumption. |
| 6 | Type extra (see below) | |
| 7 | Type extra (see below) | |

**Wedding.** Q6 is Tradition: North Indian Hindu · Marwari / Rajasthani · Punjabi or Sikh · Muslim · South Indian Hindu · Bengali · Christian · Mixed (two families) · Other, I'll describe it. Skipped when the Brief says it ("Punjabi wedding"). Q7 shows that Tradition's Functions as toggle chips, plus "add a Function". Mixed merges two lists; Other has the LLM build a list from the Member's words.

| Tradition | Default Functions |
|---|---|
| North Indian Hindu | haldi, mehendi, sangeet, wedding, reception |
| Marwari / Rajasthani | tilak, mayra (bhaat), haldi, mehendi, sangeet, wedding, reception |
| Punjabi or Sikh | roka, chunni, mehendi, jaggo, Anand Karaj, reception |
| Muslim | manjha, mehendi, nikah, walima |
| South Indian Hindu | nichayathartham, muhurtham, reception |
| Bengali | aashirbaad, gaye holud, biye, bou bhaat |
| Christian | engagement, church wedding, reception |

Each Function gets an assumed date relative to the wedding day and an assumed Guest count as a share of the wedding's Guests: smaller pre-wedding rituals (haldi, manjha, tilak) 20%, mehendi 40%, sangeet or jaggo 75%, the wedding and reception 100%.

**Birthday.** Q6: Who is it for? Child · Adult · Parent or grandparent. Q7: the age (number chips for common ages, or type). The age picks the defaults: a child gets a themed party, a first birthday gets a family puja plus a cake-cutting party, a milestone (50th, 60th, 75th) gets a ritual Function (e.g. shashtipoorthi) plus a dinner. Otherwise one Function.

**Community event.** Q6: What kind? Ganesh utsav · Durga puja · Navratri garba · Diwali mela · Society annual day · Other. The kind proposes its programmes as toggle chips (Ganesh utsav: sthapana, daily aarti, cultural night, visarjan) and its usual length (Ganesh utsav offers 1.5 · 5 · 7 · 10 days). Q7: How many households are contributing? (optional; skip leaves no per-household share).

### Vibe pick

After the essentials, the Assistant offers: "Want to pick a look? Tap 3 to 5 images you like, or skip." The grid shows 12 curated Pexels images chosen ahead of time for the Event type (and Tradition, for weddings), so it appears instantly and works in the demo. "Show me more" or the search box runs a live Pexels search from the Brief's words (e.g. "Jaipur palace wedding marigold"). Pexels credit and link show on every image.

Output: a Theme, `{ palette: 3-5 hex colours, styleWords: 2-4 short phrases, decorKeywords: 3-6 words }`, extracted locally (palette) and by one LLM call (words), as described in the Inspiration sources research. The Theme appears on the Brief summary, where Members can edit it. The tapped images become Inspirations on the Canvas with their credit.

Skipping leaves the Theme empty. Suggestions then lean on the Tradition and the Brief's words alone.

### Brief summary

A Chat message with every field editable in place:

- Event type, city (with City tier), dates per Function, Guests per Function, budget, Tradition, Theme.
- The list of Assumptions, each with "change".
- The Budget check, when the budget is below the typical minimum: "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short." with three fixes, each previewing its new minimum: fewer Guests, fewer or merged Functions, raise the budget. And "Plan at my budget anyway".

  > Amended by [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 1.5 on 2026-10-22: v1 shows the flag, "Raise the budget" and "Plan at my budget anyway". The previewed fewer-Guests and fewer-Functions fixes are SHOULD (X12).
- A late-date note is not added here; lateness is handled in the Timeline.
- "Make my plan".

## How Estimates are made

### Reference table

One table of cost ranges (low and high) per budget category and unit, stored for City tier Y. Tier X multiplies by 1.25 and tier Z by 0.8. Jaipur is Y; the eight X cities are Ahmedabad, Bengaluru, Chennai, Delhi, Hyderabad, Kolkata, Mumbai and Pune; any city on neither list is Z ([Classification of Indian cities](https://en.wikipedia.org/wiki/Classification_of_Indian_cities), following the central government's HRA classes).

Each Estimate carries a `basis` string shown with it, e.g. "Y-tier range ₹1,000-₹2,000 per plate, Utsavvy reference table, Oct 2026".

The seed values below are a planning draft. Values marked † are our own working figures with no source yet; the build slice that implements the table verifies them or replaces them with Listed prices. The tier multipliers are also unsourced.

> Amended by [vendors.md](vendors.md) and [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 3: the table is hand-checked against the starter set's Listed prices for v1, and automatic pooling of Listed prices arrives later with Discovery. Tests always pin the table with pooling off.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: the table is now the fallback for lines that research can't price. Sah-Nikhil rejected both adjustments D2 proposed, so the seed values below are the table, frozen at version `2026-10-22`. The basis string names its kind: researched (with source pages and the date searched), reference table (as in the example above) or "Assistant's own estimate, no sources". The tier multipliers apply to table rows only, since research and the Assistant's own estimate are already for the Event's city.

**Weddings (tier Y, per unit)**

| Category | Unit | Low | High | Source |
|---|---|---|---|---|
| Catering, light (haldi, lunch) | per plate | ₹500 | ₹900 | † |
| Catering, standard (mehendi) | per plate | ₹700 | ₹1,200 | † |
| Catering, main dinner (sangeet, wedding, reception) | per plate | ₹1,000 | ₹2,000 | Jaipur banquet hall's own site, about ₹1,200-₹3,500 (Vendor data research); Jaipur listings mostly ₹2,000-₹3,000, some ₹700-₹800 (background reading of WedMeGood, nothing copied) |
| Venue, small or at home (≤150 Guests) | per Function | ₹15,000 | ₹50,000 | † |
| Venue, large (>150 Guests) | per Function | ₹75,000 | ₹2,00,000 | † |
| Decor, small (≤150 Guests) | per Function | ₹15,000 | ₹40,000 | † |
| Decor, medium (>150 Guests) | per Function | ₹50,000 | ₹1,20,000 | Starting prices around ₹75,000, home functions ₹30,000 (directory listings) |
| Decor, main stage and mandap (wedding, reception) | per Function | ₹75,000 | ₹2,00,000 | as above |
| DJ and sound | per Function | ₹20,000 | ₹50,000 | †; Samaro puts all entertainment at 5-9% (₹2.5-4.5L) |
| Dhol | per Function | ₹8,000 | ₹20,000 | † |
| Mehendi artists (bride + about 40 hands) | per Function | ₹10,000 | ₹30,000 | Bridal mehendi from ₹2,100-₹7,000 in Udaipur; 40-hand packages ₹4,000-₹25,000 |
| Baraat band and ghodi | per Function | ₹30,000 | ₹80,000 | † |
| Pandit and puja items | per ritual Function | ₹10,000 | ₹30,000 | † |
| Photography and video (Event-wide) | per day | ₹25,000 | ₹50,000 | Photo + video day rates ₹25,000-₹40,000, up to ₹90,000 in Delhi NCR (WeddingBazaar listings) |
| Makeup, bride and family (Event-wide) | per Event | ₹40,000 | ₹1,20,000 | Samaro: ₹1-2L across all Functions |
| Outfits (Event-wide) | per Event | ₹75,000 | ₹2,50,000 | †; Samaro puts bridal fashion at 5-8%. Jewellery is excluded by default, shown as an Assumption. |
| Invitations (Event-wide) | per card | ₹80 | ₹250 | †; one card per two Guests, assumed |
| Transport and misc. (Event-wide) | per Event | ₹25,000 | ₹75,000 | † |

**Birthdays (tier Y)**

| Category | Unit | Low | High | Source |
|---|---|---|---|---|
| Catering, party | per plate | ₹400 | ₹800 | Party venues list ₹350-₹1,500 per plate (VenueLook, Indore) |
| Party hall | per Function | ₹15,000 | ₹50,000 | A small banquet hall around ₹50,000 a day (Citizen Matters, Bengaluru) |
| Decor | per Function | ₹5,000 | ₹25,000 | Basic decor from ₹3,000 (Citizen Matters) |
| Cake | per kg | ₹800 | ₹1,500 | †; 1 kg per 20 Guests, assumed |
| Entertainer (magician, games host) | per Function | ₹3,000 | ₹15,000 | Magic show ₹2,500 (Citizen Matters, older article) |
| Return gifts | per child | ₹150 | ₹400 | † |
| Photography | per Function | ₹8,000 | ₹20,000 | Candid-only ₹8,000-₹15,000 (WeddingBazaar listings) |

**Community festivals (tier Y; Ganesh utsav rows)**

| Category | Unit | Low | High | Source |
|---|---|---|---|---|
| Idol, eco clay, 4-5 ft | per Event | ₹20,000 | ₹40,000 | Mumbai mandals: 4 ft clay about ₹35,000, PoP about ₹10,000 (press coverage, low confidence) |
| Pandal and decor, whole festival (Event-wide) | per Event | ₹35,000 | ₹1,50,000 | Cardboard decor ₹35,000 vs ₹2-3L for a PoP setup (press coverage, low confidence) |
| Sound system, whole festival (Event-wide) | per Event | ₹15,000 | ₹40,000 | † |
| Permissions and fees (Event-wide) | per Event | ₹0 | ₹5,000 | † |
| Pandit and puja items | per ritual Function | ₹5,000 | ₹15,000 | † |
| Prasad | per Guest per day | ₹20 | ₹60 | † (₹30-₹60 for sthapana and visarjan, ₹20-₹40 for daily aarti) |
| Flowers for daily aarti | per day | ₹1,000 | ₹3,000 | † |
| Stage and lighting, cultural night | per Function | ₹20,000 | ₹50,000 | † |
| Performers and anchor | per Function | ₹10,000 | ₹40,000 | † |
| Snacks, cultural night | per Guest | ₹80 | ₹150 | † |
| Dhol-tasha pathak, visarjan | per Function | ₹15,000 | ₹40,000 | † |
| Vehicle, visarjan | per Function | ₹5,000 | ₹15,000 | † |

### Pricing a plan

For a drafted plan, the pricing step works out each budget Entry's low and high from the table (unit price × quantity × tier multiplier). Then, with C = Contingency share (0.10):

- **Minimum** = sum of lows × (1 + C). **High** = sum of highs × (1 + C). **Typical** = the midpoint of the two.
- **Below minimum** (budget < Minimum): flagged on the Brief summary. If the Member plans anyway, every Entry is its low scaled down by the same factor so the total fits, each marked "below the usual range", and the Budget check stays on the Budget.
- **Tight** (Minimum ≤ budget < Typical) and **comfortable** (Typical ≤ budget ≤ High): every Entry sits at the same fraction f of its range, where f is chosen so the Entries plus Contingency equal the budget. Tight adds a note on the Budget: "₹25L is below the typical ₹32.5L for this plan, so Estimates sit near the low end."
- **Above high** (budget > High): every Entry at its high, Contingency at 10% of them, the remainder as Unallocated. Suggestions lean premium.
- Entries round to the nearest ₹1,000 (per-plate prices to ₹10); rounding differences go into the Contingency, so the Event total always equals the budget.

The LLM never writes an amount. It explains them ("catering is about 45% of your budget because there are five meals") from the priced result.

> Amended by [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 3 and [vendors.md](vendors.md): amounts a Member states in their own request are allowed, and free-label Vendor categories with no table row get a flagged Assistant Estimate, a knowing exception.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: the model now writes one kind of number, a low and high price per unit for one budget line, in the research step or as its own estimate, always labelled with that basis. It still never writes a total, a planned amount, the Contingency or a date. The pricing step above runs unchanged over those per-unit ranges.

### Live lookups in the Chat

> Amended by [vendors.md](vendors.md) "Chat web search" and [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 3: lookups use Claude's web search tool, not Gemini grounding. The rest of this section still holds.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: Estimates are now researched with web search too, in their own step. A Chat answer still stays in the Chat and doesn't change an Estimate already on the Canvas.

A Member can ask "what do banquet halls in Pune charge per plate?". The Assistant may answer through Gemini's Search or Maps grounding (paid only, per the LLM research), showing its citations. The answer is not stored as a Listed price, not used to change Estimates, and not added to the reference table. A Member who wants a number on the Canvas types it as a Quote. The idea of pooling shortlisted Vendors' data into our own table is handed to [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16), with the note that the stored data must come from the Vendor's own website, not from Gemini's answer.

## First Canvas per Event type

Everything below lands as Items in the Sections defined by the Canvas ticket ([How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11) owns placement).

| | Wedding | Birthday | Community event |
|---|---|---|---|
| Budget | Functions × categories, Event-wide (photography, makeup, outfits, invitations, transport), Contingency, Budget check | One Function (sometimes two), small Event-wide or none, Contingency | Programme Functions, Event-wide (idol, pandal, sound, permissions), Contingency, per-household share when households are known |
| Timeline | Lead-time deadlines from today; run sheet per Function | Same, shorter lead times | Same; committee and permission deadlines |
| Vendor checklist | 10-15 Entries | 4-7 Entries | 5-8 Entries |
| Suggestions | 5-8 | 5-8 | 5-8 |
| Inspirations | Vibe pick images | Vibe pick images | Vibe pick images |

### Lead times

The Timeline places each deadline at its ideal lead time before the Function it serves. A deadline whose ideal date is already past is marked late and gets a new date by priority: P1 within 7 days, P2 within 14, P3 within 21. Its note gives the reason ("Venues for February dates usually book 9-12 months ahead; call these first").

| Wedding deadline | Ideal lead | Priority if late |
|---|---|---|
| Book Venues | 9-12 months | P1 |
| Book caterer (if not with the Venue) | 9 months | P1 |
| Book photographer | 9-12 months | P1 |
| Book decorator | 9 months | P2 |
| Book makeup and mehendi artists (after trials) | 9 months | P2 |
| Book baraat band and ghodi | 6 months | P2 |
| Order outfits, first fittings | 6 months | P2 |
| Book DJ | 6 months | P3 |
| Book transport | 3 months | P3 |
| Send invitations | 8 weeks | P1 |
| Makeup trial per Function | 1 month | P2 |
| Share run sheets with photographer | 1 month | P2 |

Planning guides give 12-18 months for an Indian wedding, with budget, Guest list and Venue first, top photographers booked 12+ months out, caterer and decorator at 9-12 months, makeup and mehendi artists around 9 months, fittings at 6 months, and transport in the last 3 months ([Maharani Weddings](https://www.maharaniweddings.com/indian-wedding-planning-guide), [Manyavar](https://www.manyavar.com/en-in/blog-wedding-planning-checklist-guide.html), [VenueLook](https://venuelook.com/blog/plan-like-a-pro-the-essential-indian-wedding-checklist-from-start-to-finish)). The invitation, DJ and trial leads are our working figures.

Birthday leads (†): party hall 6-8 weeks, entertainer and photographer 4 weeks, invitations 3 weeks, decor and return gifts 2 weeks, cake 1 week. Community leads (†): committee approves budget 3 months, book idol 4-6 months, book dhol-tasha pathak 3 months, pandal and decor 2 months, check permissions 6 weeks, sound 4 weeks.

## JSON shape sketch

Two structured outputs from the LLM, both validated before anything is written. Field names are illustrative; the contract slice fixes them.

```ts
// 1. From the Member's free text. Unknown fields are null, never guessed.
type BriefExtraction = {
  eventType: "wedding" | "birthday" | "community" | null;
  city: string | null;
  date: { kind: "day"; value: string } | { kind: "month"; value: string } | null; // ISO
  guests: number | null;
  budget: number | null;            // rupees
  tradition: string | null;         // wedding
  honoree: { who: "child" | "adult" | "elder"; age: number | null; name: string | null } | null; // birthday
  communityKind: string | null;     // community
  households: number | null;        // community
  notes: string[];                  // anything else worth keeping ("outstation family", "Jain food")
};

// 2. The first plan's structure. No amounts: the pricing step adds them.
type FirstPlanDraft = {
  functions: {
    key: string;                    // "sangeet"
    name: string;
    date: { kind: "day"; value: string } | { kind: "range"; from: string; to: string };
    guests: number;
    budgetEntries: { category: string; quantity: number; unit: string }[]; // category = reference-table key
    runSheet: { time: string; label: string }[];                          // 6-10 Entries
  }[];
  eventWide: { category: string; quantity: number; unit: string }[];
  deadlines: { title: string; functionKey: string | null; vendorCategory: string | null; leadKey: string }[];
  vendorChecklist: { category: string; functionKeys: string[]; budgetEntryRefs: string[] }[]; // [] = Event-wide
  suggestions: {
    title: string;
    body: string;
    functionKey: string | null;
    costCategory: string | null;    // priced like a budget Entry when added
    quantity: number | null;
  }[];                              // 5-8
  assumptions: { field: string; value: string; reason: string }[];
};

// After pricing (server side), each budget Entry and costed Suggestion gains:
type PricedEstimate = { low: number; high: number; amount: number; basis: string; label: "Estimate" };
// Amended by ADR 0013: `basis` becomes a record with its kind ("researched", "referenceTable"
// or "assistantKnowledge"), the price per unit, and for researched lines the source URLs,
// the date searched and one line of reasoning. IMPLEMENTATION_PLAN.md section 5.6 has the fields.
// and the plan gains:
type BudgetCheck = {
  band: "belowMinimum" | "tight" | "comfortable" | "aboveHigh";
  minimum: number; typical: number; high: number;
  contingency: number; unallocated: number; perHousehold: number | null;
};
```

Dates in deadlines are computed from `leadKey` and today's date by the server, the same way as amounts, so the LLM doesn't do date arithmetic. Every Entry produced here is applied through the same Canvas mutations Members use, as decided in the LLM research.

## Worked examples

These double as test cases. Amounts follow from the seed table and the pricing rules above; if the table changes, the expected numbers change with it, so tests should assert the rules (bands, fraction f, roll-up, rounding into Contingency) and use these numbers only with the seed table fixed. Today is 2026-10-21 in all three.

> Amended by [ADR 0013](../adr/0013-estimates-are-researched-with-the-reference-table-as-fallback.md) on 2026-10-22: these are the table-path numbers. Tests reproduce them exactly with web search stubbed to return nothing, so every line falls through to the table. A live plan researches its prices, so its numbers differ.

### 1. Jaipur wedding, about 300 Guests, ₹25L (tight band)

Brief: "My sister's wedding in Jaipur in February 2027, around 300 people, budget 25 lakh."

Extraction: wedding, Jaipur (Y), month 2027-02, 300 Guests, ₹25,00,000. Missing: Tradition. The Assistant asks Q6; the Member taps North Indian Hindu and keeps all five Functions. Vibe pick: three images tapped; Theme "royal Rajputana, marigold, pastel pink".

Assumptions on the Brief summary: wedding on 15 Feb 2027 (month only); mehendi 13 Feb evening, haldi 14 Feb morning at home, sangeet 14 Feb evening, reception 16 Feb evening; Guests haldi 60, mehendi 120, sangeet 225, wedding 300, reception 300; vegetarian menu; jewellery not included; 150 invitation cards; photographer for 4 days.

Budget check: Minimum ₹19.62L, Typical ₹32.47L, High ₹45.33L. ₹25L is tight, so no flag on the Brief summary; f ≈ 0.209.

| Part of the Budget | Low | High | Estimate at f ≈ 0.209 |
|---|---|---|---|
| Haldi (60) | ₹70,000 | ₹1,74,000 | ₹92,000 |
| Mehendi (120) | ₹1,32,000 | ₹2,84,000 | ₹1,64,000 |
| Sangeet (225) | ₹3,70,000 | ₹8,20,000 | ₹4,64,000 |
| Wedding (300) | ₹4,90,000 | ₹11,10,000 | ₹6,20,000 |
| Reception (300) | ₹4,70,000 | ₹10,50,000 | ₹5,91,000 |
| Event-wide | ₹2,52,000 | ₹6,82,500 | ₹3,42,000 |
| Contingency | | | ₹2,27,000 |
| **Event total** | | | **₹25,00,000** |

The wedding Function's Entries: catering ₹3,63,000 (₹1,210 per plate × 300), Venue ₹1,01,000, decor ₹1,01,000, baraat band and ghodi ₹40,000, pandit and puja items ₹14,000. (Totals can differ by a few thousand rupees from rounding; the difference goes to the Contingency.)

Budget note: "₹25L is below the typical ₹32.5L for this plan, so Estimates sit near the low end. Catering is about 45% of the budget because of five meals."

Timeline: 115 days to the first Function, so almost every booking is late. This week (P1): book Venues for the mehendi, sangeet, wedding and reception, book the caterer, book the photographer. Within 14 days (P2): decorator, makeup and mehendi artists, baraat band and ghodi, order outfits. Within 21 days (P3): DJ. On time: book transport by 13 Nov 2026, send invitations by 19 Dec 2026, makeup trials and share run sheets with the photographer by mid-January.

Run sheet, wedding (all assumed): 5:30 pm bride ready · 6:30 pm baraat assembles · 7:00 pm baraat sets off with band and ghodi · 7:45 pm milni and welcome at the Venue · 8:15 pm varmala on stage · 8:30 pm dinner opens · 10:30 pm pheras begin (move to the muhurat) · 1:00 am vidaai. The other four Functions get 6-8 Entries each (e.g. sangeet: 7:00 pm Guests arrive, 7:30 pm family performances, 8:30 pm dinner, 9:30 pm DJ, 11:30 pm close).

Vendor checklist (14 Entries, all "to find"): Venue × 4 (mehendi, sangeet, wedding, reception), caterer (all Functions), decorator (all Functions), photographer (Event-wide), makeup artist (Event-wide), mehendi artists (mehendi), DJ (sangeet, reception), dhol (mehendi), baraat band and ghodi (wedding), pandit (haldi, wedding), invitations printer (Event-wide).

Suggestions (7): Rajasthani folk musicians at the sangeet dinner · marigold canopy for the haldi in the home courtyard · Sanganeri block-printed tote bags as favours · a safa-tying corner for the baraat · kulhad chai and kachori counter at the mehendi · hold the haldi and sangeet at one Venue to save a Venue booking · ask the family pandit for February muhurat dates before booking Venues. Each costed one carries an Estimate from the table.

**Variant, ₹15L (below minimum).** Same Brief with ₹15L. The Brief summary flags: "A plan like this in Jaipur usually starts at about ₹19.6L. You're about ₹4.6L short." Fixes with previews: drop the reception (new minimum about ₹14.2L, fits); invite 200 to the wedding and reception and 150 to the sangeet (new minimum about ₹15.5L, still about ₹55,000 short); raise the budget to ₹19.6L. "Plan at my budget anyway" scales every Entry to about 76% of its low end.

### 2. Jaipur birthday, 6-year-old, 60 Guests, ₹1.5L (comfortable band)

Brief: "Aarav's 6th birthday party in Jaipur on Saturday 12 December, about 35 kids and their parents, budget 1.5 lakh."

Extraction: birthday, Jaipur (Y), 2026-12-12, child aged 6, budget ₹1,50,000. Guests: 60, an Assumption (35 children plus about 25 adults), so Q4 is skipped. One Function. Vibe pick Theme: "jungle safari, leafy green, sunshine yellow".

Assumptions: party 4:00-7:00 pm in a party hall; 35 children get return gifts; 3 kg cake.

Budget check: Minimum ₹68,900, Typical ₹1,31,500, High ₹1,94,200. ₹1.5L is comfortable; f ≈ 0.65. Entries: catering ₹39,600 (₹660 per plate × 60), party hall ₹38,000, decor ₹18,000, cake ₹4,000, entertainer ₹11,000, return gifts ₹11,000, photography ₹16,000, Contingency about ₹12,400. Event total ₹1,50,000.

Timeline: 52 days out. Book the party hall is late (ideal 8 weeks), so P1 this week. Then book the entertainer and photographer by 14 Nov, send invitations by 21 Nov, order decor and return gifts by 28 Nov, order the cake by 5 Dec.

Run sheet: 4:00 pm Guests arrive, games host starts · 4:45 pm magic show · 5:30 pm cake-cutting · 5:45 pm food · 6:30 pm return gifts and goodbyes · 7:00 pm hall handed back.

Vendor checklist (5): party hall, caterer (if not with the hall), decorator, entertainer, photographer, plus the cake as a bakery order.

Suggestions (5): animal-mask making corner · a safari photo booth · seed-ball kits as return gifts · a treasure hunt run by the games host · a jungle-theme cake.

### 3. Pune society Ganesh utsav, 240 households, ₹2.4L (below minimum, per-household share)

Brief: "Ganeshotsav in our society in Pune, 240 flats, we collected ₹1,000 per flat."

Extraction: community, Pune (X), Ganesh utsav, 240 households, budget ₹2,40,000. The Assistant proposes 4-14 Sep 2027 (Ganesh Chaturthi to Anant Chaturdashi, per [Drik Panchang](https://www.drikpanchang.com/festivals/ganesh-chaturthi/ganesh-chaturthi-date-time.html?year=2027)) and the Member confirms. Guests: 400 at the busiest programme (Q4).

Functions: sthapana 4 Sep (150 Guests), daily aarti 4-13 Sep (100 a day, a date range), cultural night 11 Sep (400), visarjan 14 Sep (300). All four dates and Guest counts other than the cultural night's are Assumptions.

Budget check: Minimum ₹2,75,700, Typical ₹5,17,300, High ₹7,59,000 (tier X, so the Y table × 1.25). The Brief summary flags: "A Ganeshotsav like this in Pune usually starts at about ₹2.76L. You're about ₹36,000 short." Fixes: skip the cultural night (new minimum about ₹1.90L, fits); 250 Guests at the cultural night instead of 400 (about ₹2.59L, still about ₹19,000 short); raise the budget to ₹2.76L, which is about ₹1,150 per household. The Budget shows "₹1,000 per household" next to the total.

Timeline: 318 days out, nothing late. Committee approves the budget by early June 2027, book the idol by April, book the dhol-tasha pathak by early June, pandal and decor by early July, check whether permissions are needed by late July, book sound by early August.

Run sheet, visarjan: 4:00 pm final aarti · 4:30 pm procession assembles with the pathak · 5:00 pm procession around the society · 7:00 pm immersion at the artificial tank · 7:30 pm prasad and clean-up.

Vendor checklist (6): idol maker, pandal and decorator, sound, dhol-tasha pathak, pandit, caterer or sweet shop for prasad and snacks.

Suggestions (6): shadu clay idol with immersion in an artificial tank inside the society · an aarti rota so each wing hosts one evening · a kids' modak-making evening · leaf-bowl prasad instead of plastic · compost the flowers after each aarti · a dhol-tasha workshop by the pathak for residents.

## Hand-offs

- [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16): suggesting actual Vendors per checklist Entry; Sah-Nikhil's idea of pooling shortlisted Vendors' data into our own reference table, with stored data coming from the Vendor's own website, not Gemini's answer; opt-in pooling of Members' Quotes later.
- [How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11): where Suggestions, the Budget check, Assumption tags and run sheets sit.
- [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12): changing an essential after the first plan when several Members are editing.
- [How do Inspirations get onto the Canvas in v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/17): the curated vibe pick sets and how vibe pick images appear as Inspirations.
- [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18): the reference table and its verification as a build slice; these three worked examples as scripted test cases and the demo path.

## Sources

Budget splits and totals (context for the seed table, not copied into it):
- [Samaro, how to plan a wedding budget in India (2025)](https://samaro.ai/blogs/how-to-plan-wedding-budget-india-2025): venue 20-28%, catering 18-25%, decor 10-16%, photography 7-10%; [Samaro budget planner](https://samaro.ai/wedding-budget-planner): entertainment 5-9% (₹2.5-4.5L), makeup 2-4% (₹1-2L), 18% GST rarely included in quotes.
- [Manyavar wedding budget guide](https://www.manyavar.com/en-in/blog-wedding-budget-planning-guide-for-indian-couples.html): venue 20-30%, catering 25-30%, decor 10-15%, photography 5-10%.
- WedMeGood 2025 survey as reported by [ETV Bharat](https://www.etvbharat.com/en/lifestyle/yearender-2025-top-wedding-trends-india-enn25120302279) and [Curly Tales](https://curlytales.com/india/ct-scoop/in-now-destination-weddings-jaipur-leads-indias-wedding-budget-spend-at-lakh-more/amp/): average ₹39.5L; Jaipur ₹73L (pulled up by destination weddings).
- [WedMeGood Jaipur banquet halls](https://www.wedmegood.com/vendors/jaipur/wedding-venues/malviya-nagar/banquet-hall/?page=2): background reading only; directory terms forbid reuse, so no figures are taken from it into the product.

Unit prices:
- Jaipur per-plate range from a banquet hall's own site: branch `research/vendor-data`, file `research/vendor-data.md`.
- Photography: [WeddingBazaar, Krishna Photography](https://www.weddingbazaar.com/wedding-photographers/karimnagar/krishna_photography100), [WeddingBazaar, SBgraphy Creatives](https://www.weddingbazaar.com/wedding-photographers/mumbai/sbgraphy-creatives).
- Mehendi: [WedMeGood, Udaipur mehendi artists](https://www.wedmegood.com/vendors/udaipur/mehendi-artists/malla-talai/).
- Birthdays: [Citizen Matters, Jayanagar birthday options](https://citizenmatters.in/4004-birthday-party-options-in-jayanagar/), [VenueLook, Indore first-birthday venues](https://www.venuelook.com/1st-birthday-party-venues-in-indore/locality/rau), [Deccan Herald](https://www.deccanherald.com/content/529056/cream-themes.html).
- Ganesh utsav idols and decor: Mumbai press coverage found through [The Better India](https://www.thebetterindia.com/159317/ganesh-chaturthi-green-eco-friendly-festival/amp/) and [The Quint](https://www.thequint.com/news/india/ganpati-idols-gst-more-expensive); figures not checked page by page, so low confidence.

Lead times and dates:
- [Maharani Weddings planning guide](https://www.maharaniweddings.com/indian-wedding-planning-guide) (12-18 months; 10-15% buffer), [Manyavar checklist](https://www.manyavar.com/en-in/blog-wedding-planning-checklist-guide.html), [VenueLook checklist](https://venuelook.com/blog/plan-like-a-pro-the-essential-indian-wedding-checklist-from-start-to-finish).
- [Drik Panchang, Ganesh Chaturthi 2027](https://www.drikpanchang.com/festivals/ganesh-chaturthi/ganesh-chaturthi-date-time.html?year=2027) and [Anant Chaturdashi 2027](https://www.drikpanchang.com/festivals/anant-chaturdashi/anant-chaturdashi-date-time.html?year=2027).

City tiers: [Classification of Indian cities](https://en.wikipedia.org/wiki/Classification_of_Indian_cities).
