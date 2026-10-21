# Reference table check against the starter set

Issue [#33](https://github.com/Sah-Nikhil/Utsavvy/issues/33).

## Decision, 22 Oct 2026: table kept unchanged, version `2026-10-22`

Sah-Nikhil rejected both proposed adjustments below, so the reference table stays exactly as first-brief.md seeds it and is frozen as version `2026-10-22`.

The table is now the fallback in the Estimate cascade (ADR 0013): an Estimate first comes from the Assistant's researched estimate (live web search plus the Listed prices of Shortlisted Vendors), then from this reference table, and only as a last resort from the Assistant's own knowledge.

## What the starter set says about prices

These are the starter set's comparable Listed prices, all seen on the Vendors' own sites on 21 Oct 2026, next to the first-brief seed values for tier Y.

| First-brief row (tier Y) | Unit      | Seed value      | Starter-set comparable prices                                                                                           | Proposed low and high                   | Decision |
| ------------------------ | --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------- |
| Catering, main dinner    | per plate | ₹1,000-₹2,000   | M L Caterers Silver ₹850, Gold ₹1,350, Platinum ₹1,950 (exact, veg); Parampara Banquet Hall ₹1,200-₹3,500 (approx, veg) | B: ₹1,000-₹2,500 (high ₹2,000 → ₹2,500) | Rejected |
| Catering, standard       | per plate | ₹700-₹1,200     | M L Caterers Silver ₹850                                                                                                | No change                               | Kept     |
| Catering, light          | per plate | ₹500-₹900       | Vinayak Foods & Catering about ₹250-₹500 (veg), from ₹250 (starting)                                                    | A: ₹400-₹900 (low ₹500 → ₹400)          | Rejected |
| Photography and video    | per day   | ₹25,000-₹50,000 | Candid Life Photography ₹35,000 photo + video, ₹15,000 photo only (pre-wedding shoot day rates)                         | No change                               | Kept     |
| Birthday catering, party | per plate | ₹400-₹800       | Vinayak Foods & Catering about ₹250-₹500 (veg)                                                                          | No change                               | Kept     |

Only 4 of the 16 Vendors publish a comparable price, so these numbers are thin evidence on their own. Rows not listed had no comparable starter-set price.

## Worked-example impact

None, since both adjustments were rejected: the worked examples in IMPLEMENTATION_PLAN.md section 8 stay as written. For the record, worked example 1 would have moved as follows, by first-brief.md's pricing rules:

- A: Minimum ₹19.62L → ₹19.55L; wedding catering stays ₹1,210 per plate.
- B: High ₹45.33L → ₹49.87L, f 0.209 → 0.178; wedding catering ₹1,210 → ₹1,270 per plate.
