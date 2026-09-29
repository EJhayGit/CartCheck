# CartCheck project scope

**Status (2026-09-29):** Approved first-release scope. Core grocery Milestones 1–7 are complete; account enhancements are implemented and tested locally. Public deployment has not started.

## Minimum complete application

An individual shopper can sign in, find or quickly register a reusable grocery item, add it to one active list, change its name or quantity, mark it bought or unbought, finish the trip with confirmation, and review or correct dated trip history. The checklist works with no prices and no budget. Approximate spending and a trip budget are optional aids, not prerequisites.

The delivered application uses the professor's React/Vite client, Express API, and PostgreSQL architecture. One Render web service is the approved web/API host, Supabase supplies PostgreSQL, and Resend is the transactional email provider. A Supabase development project has been used for guarded tests; the public site and production configuration are not yet verified. The owner has purchased `merzbuilds.dev` and chosen `https://cartcheck.merzbuilds.dev` for CartCheck; DNS and deployment remain pending. Account data must remain private behind Express when the public site launches. The Vercel frontend split was evaluated but is outside the approved CartCheck deployment plan, and Google Sign-In was cancelled.

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
