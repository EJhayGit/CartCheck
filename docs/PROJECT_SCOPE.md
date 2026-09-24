# CartCheck project scope (proposed)

**Status:** Awaiting concept and requirements approval. This is a product scope, not an implementation plan.

## Minimum complete application

The first release covers one shopper's full cycle: sign in, find or register a reusable product, add it to one active cart, set a trip budget, mark bought items, **Finish Trip** with confirmation, and consult or correct trip and item price history. It uses the required deployed React client, Express API, and PostgreSQL database. The public site is open to visitors, but each account's shopping data is private. CartCheck is a checklist and spending record.

Approximately 100 common starter products reduce typing. They supply names, categories, and units; they do not imply live store prices. A missing image uses a neutral placeholder. Shoppers may provide an image URL for their own product or override; file uploads and storage are outside this first release.

## Later idea

- Automatic image lookup through a third-party API. Matching quality, licensing, request limits, and key handling need evaluation; missing images never block shopping.

## Outside the requested scope

- Shared family lists or accounts, multiple simultaneous trips, barcode scanning, store integrations, live price feeds, receipt scanning, and online payment are outside the requested scope.
- Monthly budgets, forecasting, charts, exports, and complex taxes or discounts are outside the requested scope. The required analytics are trip totals, budget comparison, and per-item price history.

## Proposed boundaries and decisions for review

| Decision | Proposed first-release rule |
| --- | --- |
| Currency | Account setting defaults to PHP. It applies to new carts; each trip retains its chosen currency. No automatic currency conversion. |
| Price unit | Each, kilogram, or liter. Kilogram and liter quantities may be decimal. A changed unit must not reinterpret existing cart entries or history. |
| Price source | The latest completed purchase supplies “last paid”; an editable reference price is only an estimate. |
| Price | Zero is valid for a free item. A bought item needs a known price before Finish Trip. |
| Budget | Set when a new cart begins; editable until Finish Trip. Over-budget warnings do not block it. |
| Finish Trip | Confirm and archive the entire cart, including unchecked items. Start a new empty cart with a new budget. |
| History | Past trip items and their bought status, quantity, and price can be corrected; totals and item price history must reflect the correction. |
| Catalog | Starter products are shared templates; edits and custom products belong to one account. |
| Product images | Image URLs are supported; uploads and automatic lookup are deferred. Invalid or absent images show a placeholder. |

## Remaining clarification for approval

The proposed Finish Trip behavior archives unchecked items as **not bought** and starts a new empty cart. This follows “finalize the cart”; confirm if unchecked items should instead be copied into the next cart.

The currency setting needs a short list of supported currencies before implementation. Each trip keeps its own currency, and totals from different currencies are never combined without conversion.

Existing course deliverables in this folder (proposal, mockup, design system, weekly reports, demo video, and security/privacy checklist) still need to be completed or updated to match the approved scope. The current application remains the template's sightings example until implementation begins.
