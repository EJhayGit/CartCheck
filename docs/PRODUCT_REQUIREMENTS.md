# CartCheck product requirements

**Status:** Approved planning baseline (2026-09-24). CartCheck functionality has not yet been implemented in the course starter.

## Objective

Help an individual shopper, including a student or family member, prepare a reusable grocery checklist, track shopping progress, and review finished trips. Budget tracking is optional. A shopper must be able to complete the checklist flow without entering a price or budget.

## Required first-release behavior

1. **Private account:** Register, sign in, sign out, and return to saved catalog items, the active list, and trip history. An account cannot read or change another account's data.
2. **Reusable catalog:** Supply approximately 100 common grocery starter items with names and categories, without invented prices. Search and filter by category, register a custom item when no suitable match exists, and edit private catalog items. Brand, variant, and package size are not required. An optional image URL may be supplied; missing images use a placeholder.
3. **One active grocery list:** Add an item from the catalog, or register it and return to the add step. Edit a list item's displayed name and quantity, remove it, mark it bought or unbought, and optionally hide checked items without deleting them. The list can be searched or organized by category. One catalog item has at most one active entry: adding it again opens that entry with its current values and saving sets the desired values rather than incrementing them.
4. **Simple quantities:** Each list entry has a positive quantity (whole or decimal, up to three decimal places) and an optional short unit label such as `kg`, `L`, or `packs`. Quantity describes what to buy; it is not used to calculate a normalized or per-unit price. Editing an entry's name or quantity does not silently change the reusable catalog.
5. **Optional prices:** Each entry may have a nullable estimated **item total** and a separate nullable actual **item total**, both nonnegative in the trip currency. Neither price is required to add or mark an item bought, or to finish a trip. Actual spending totals use only bought entries with actual prices; estimates use entries with estimated prices. A missing price is shown as incomplete, never treated as zero. `0.00` is a known, valid free-item amount.
6. **Optional budget and currency:** The active trip may have a nullable budget, editable until finish. The account's preferred currency is PHP by default and may be PHP, USD, or EUR; it applies to new trips only. Existing active and completed trips retain their currency, and amounts in different currencies are never combined or relabeled. When a budget exists, show comparisons against known estimated and actual totals with clear incomplete labels where relevant. An over-budget warning never blocks shopping or finishing.
7. **Finish Trip and history:** A confirmation reviews bought and not-bought entries and any known amounts. Finishing records the whole list as one dated trip: unchecked entries are **not bought** and do not roll into the next list. Create a new empty active list with no budget. History shows the date, item snapshots, quantities, optional prices, recorded spending, and incompleteness. Past trip items may be added, removed, or corrected for name, category, quantity, bought state, and prices after confirmation; totals update while the original finish date remains. Catalog edits never rewrite a past trip.
8. **Usable interface:** Responsive phone portrait, phone landscape, and desktop layouts; neutral colors, light and dark themes, keyboard-visible focus, readable contrast, clear loading/empty/error/confirmation states, and reduced-motion support. Checklist actions remain primary; prices and budget stay secondary.
9. **Public deployment and security:** Deploy the React/Vite client and Express API on Render with PostgreSQL hosted by Supabase. Keep all shopper data private behind Express authentication. Validate server input, limit abusive account requests, use parameterized queries and ownership checks, restrict CORS, and keep credentials out of the browser and repository.

## Screens

- Sign in / register.
- Active list, including quick add, quantity editing, bought status, optional prices and budget, and hide-checked control.
- Searchable catalog and simple custom-item form.
- Finish Trip review.
- Trip list/detail and correction review.

Currency, theme, and sign-out controls may live in a small settings area. A separate product price-history screen is not part of the first release.

## Essential data and acceptance examples

Store accounts and sessions, shared starter items, private catalog items, one active trip per account, trip entries, and completed trip snapshots. Each entry keeps separate nullable estimated and actual item totals. Completed entries preserve their recorded name, category, quantity, unit label, bought status, and amounts.

A shopper can add a starter item and a custom item without prices, edit quantities, check and uncheck either item, hide checked rows, and finish the trip with incomplete spending clearly labeled. A second trip begins empty. A bought item with actual price `0.00` is recorded as known and free. A later correction updates that trip's totals without changing its original date. Signing out and back in restores the account's data; another account cannot access it.

## Approved simplification

The earlier per-`each`/`kg`/`L` price model, reference/last-paid prices, and separate per-product price history are removed from the first release. This gives up automatic repeat-purchase price suggestions and unit-price comparison. Dated trip history and corrections remain so shoppers can review and fix what they recorded. Mandatory brands, variants, package-size comparisons, automatic price comparisons, and price-history charts are outside scope.
