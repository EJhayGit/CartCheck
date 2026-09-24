# CartCheck project scope

**Status:** Approved planning baseline (2026-09-24). This defines the first release; implementation has not started.

## Minimum complete application

An individual shopper can sign in, find or quickly register a reusable grocery item, add it to one active list, change its name or quantity, mark it bought or unbought, finish the trip with confirmation, and review or correct dated trip history. The checklist works with no prices and no budget. Approximate spending and a trip budget are optional aids, not prerequisites.

The delivered application uses the professor's React/Vite client, Express API, and PostgreSQL architecture. Render is the intended web/API host and Supabase supplies hosted PostgreSQL. The public site is reachable by visitors, while account data is private. Provider accounts and deployment are still to be created; no hosted resources have been changed.

Approximately 100 shared starter items supply names and categories without store prices. Custom items and edits are private to an account. An optional image URL may be used, with a neutral fallback; uploads and automatic image lookup are deferred.

## First-release rules

| Area | Rule |
| --- | --- |
| Active list | One per account. One catalog item has at most one entry; selecting it again opens a prefilled edit and saving sets the desired values. |
| Quantity | Positive whole or decimal number (up to three decimals), with an optional short unit label. No unit-price normalization. |
| Prices | Optional estimated and actual **item totals** are separate. Missing is `null`, not zero. Marking bought and finishing never require a price. |
| Budget | Optional on the active trip and editable until finish. Unknown amounts make comparisons incomplete; warnings do not block actions. |
| Currency | PHP default; PHP, USD, and EUR supported. A preferred-currency change affects new trips only. No conversion or cross-currency sums. |
| Finish Trip | Confirm and archive checked items as bought and unchecked items as **not bought**. Start a new empty list with no budget; no automatic rollover. |
| History | Show dated trip snapshots and recorded spending, including missing-price information. Confirm corrections to past items; recalculate trip totals and retain the original date. |
| Catalog | Shared starter templates; private custom items and private edits. Catalog changes do not rewrite list or history snapshots. |

## Removed or deferred

- Brands, variants, and package sizes are never required to add an item.
- Unit prices per `each`, `kg`, or `L`, normalized comparisons, reference prices, last-paid suggestions, and a separate per-product price-history screen are excluded from the first release. The consequence is no automatic repeat-purchase estimate or unit-price comparison; trip records remain available.
- Shared family accounts/lists, simultaneous active trips, barcode scanning, store integrations, live price feeds, receipts, payments, charts, exports, monthly budgets, forecasting, and automatic image lookup are outside this release.

## Course deliverables

The revised proposal, visual mockup, visual design-system submission, weekly reports, demo video, security/privacy checks, README evidence, and AI-usage record still need completion as development proceeds. Simplifying CartCheck does not remove the professor's React, Express, PostgreSQL, deployment, documentation, or AI-evidence requirements. The repository does not include the full assignment text needed to confirm whether student-implemented authentication is mandatory; the current plan retains Express-managed authentication and the course checklist's bcrypt guidance.
