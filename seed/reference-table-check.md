# Reference table check against the starter set

Issue [#33](https://github.com/Sah-Nikhil/Utsavvy/issues/33).

## Decision, 21 Oct 2026: no fixed reference table

Sah-Nikhil decided that Utsavvy should not price plans from a fixed table: the Assistant is meant to work prices out for each Event, not copy them from a preset list. So this check does not freeze a table version, and no adjustment was approved or rejected.

This reverses IMPLEMENTATION_PLAN.md section 3 item 3 ("the table freezes at the end of 22 Oct") and first-brief.md's rule that Estimates come only from the reference table. The orchestrator owns those documents and the slices that depend on them (S3 and the worked-example tests in section 8), so it carries the change into the plan. The starter set of 16 Vendors is kept.

## What the starter set says about prices

Kept for whoever designs the new pricing. These are the starter set's comparable Listed prices, all seen on the Vendors' own sites on 21 Oct 2026, next to the first-brief seed values they would have been checked against.

| First-brief row (tier Y) | Unit      | Seed value      | Starter-set comparable prices                                                                                           |
| ------------------------ | --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Catering, main dinner    | per plate | ₹1,000-₹2,000   | M L Caterers Silver ₹850, Gold ₹1,350, Platinum ₹1,950 (exact, veg); Parampara Banquet Hall ₹1,200-₹3,500 (approx, veg) |
| Catering, standard       | per plate | ₹700-₹1,200     | M L Caterers Silver ₹850                                                                                                |
| Catering, light          | per plate | ₹500-₹900       | Vinayak Foods & Catering about ₹250-₹500 (veg), from ₹250 (starting)                                                    |
| Photography and video    | per day   | ₹25,000-₹50,000 | Candid Life Photography ₹35,000 photo + video, ₹15,000 photo only (pre-wedding shoot day rates)                         |
| Birthday catering, party | per plate | ₹400-₹800       | Vinayak Foods & Catering about ₹250-₹500 (veg)                                                                          |

Only 4 of the 16 Vendors publish a comparable price, so these numbers are thin evidence on their own.
