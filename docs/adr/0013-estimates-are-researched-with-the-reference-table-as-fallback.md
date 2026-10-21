# Estimates are researched live, with the reference table and the Assistant's own knowledge as fallbacks

Every Estimate comes from a cascade, tried in this order for each budget line:

1. **Researched.** The Assistant looks up current prices for the line's category in the Event's city with Claude's web search tool (for example "wedding catering per plate Jaipur"), reads the comparable Listed prices of the Event's Shortlisted Vendors in that category, and writes its own low and high price per unit. The Estimate's basis records the kind `researched`, the URLs of the pages it used (never their text), the date it searched and one line of reasoning. A plan spends about 6 to 8 searches, and a result is cached per city and category for about 24 hours. The cache holds the Assistant's range and the URLs, not the search results.
2. **Reference table.** When research finds nothing usable, runs out of searches or time, or the Event isn't on Claude, the line is priced from the reference table in [first-brief.md](../design/first-brief.md), by City tier. The table stays exactly as that design seeded it, at version `2026-10-22`: Sah-Nikhil rejected both adjustments D2 proposed. Basis kind `referenceTable`.
3. **Assistant's own knowledge.** When the table has no row either (a free-label category such as a tent house), the Assistant gives its own range, labelled "Assistant's own estimate, no sources". Basis kind `assistantKnowledge`.

Code does all the arithmetic over those per-unit ranges: quantity times unit price, the tier multiplier (table rows only), totals, the Contingency, rounding, the Budget check bands and every date. The model never adds anything up. The Budget check's minimum, typical and high figures are the first-brief formulas applied to the cascade's ranges for the Brief's lines. Every Estimate shows its basis, and Members can edit any line. Listed prices and Quotes keep their meanings and are never added into an Estimate or into each other.

Decided by Sah-Nikhil on 2026-10-22: "we dont want to fix the values for anything this product is supposed to be an agentic assistant, an agentic helper. it should be able to assist not pull data from static preset sources." Of the three sources, he chose to use all of them, in the order researched, then the table, then the Assistant's knowledge. This supersedes two earlier rules: first-brief.md decision 6 and its line "The LLM never writes an amount" (from [What does the Assistant produce from a first brief?](https://github.com/Sah-Nikhil/Utsavvy/issues/13)), and the free-label exception in [vendors.md](../design/vendors.md), "Estimates on Vendor cards", which becomes the general rule.

## Considered options

- **The reference table only**, as first-brief.md planned. Deterministic and cheap, but most of its rows are our own unsourced working figures, and a fixed table is the opposite of what the Assistant is for.
- **Research only.** Every number would have sources, but a search miss, an outage or a Gemini fallback would leave lines with no price, and the tests and the demo would have no fixed numbers.
- **The Assistant's own knowledge only.** No searches and no waiting, but no sources either, so a Member can't check where a number came from.

## Consequences

- The research step is the only place the model writes rupee figures, and it writes only a low and high price per unit for one category. The research call has web search and nothing else: no Canvas tools. Its prompt holds the category, unit, Event type and city, never the Brief's text, names or budget. Search results are outside content. Code keeps a source URL only if it appeared in that call's search results, and drops a result with no URL left.
- With web search stubbed to return nothing, the cascade falls through to the table, so the three first-brief worked examples stay exact, deterministic tests. The researched path is tested through seams (the basis recorded, URLs only, a cache hit spends no search, the fallback order, no model arithmetic) and through scripted cases with tolerance bands.
- Numbers in a live plan vary from run to run and day to day. The demo script keeps its beats (the Budget check flag, "Plan at my budget anyway"), but its figures come from the live cascade, so the rehearsal checks they are plausible. The seeded demo Event is built on the table path, with no model calls.
- Cost and latency: web search costs $10 per 1,000 searches plus the tokens of the results the model reads, and the Brief summary and first plan wait for research. A time limit sends any line still being researched to the table.
- The 24-hour cache is shared by every Event, so it never holds an Event's private layer. A line whose research used the Event's Shortlisted Vendors is kept on that Entry only.
- Chat web search answers still stay in the Chat. They aren't stored and don't change Estimates already on the Canvas.
- The separate `GeneratedEstimate` type and `generatedEstimates` table planned for X1b and X7 are dropped. A free-label line is just another line in the cascade.

## Sources

Checked 2026-10-22: [Claude web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) ($10 per 1,000 searches plus token costs; citations required when results are displayed), [first-brief.md](../design/first-brief.md) "How Estimates are made", [vendors.md](../design/vendors.md) "Estimates on Vendor cards".
