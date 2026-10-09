# CartCheck product requirements

**Status:** Completed application, confirmed by the project owner on 2026-10-06. These requirements document the delivered shopping, account, and interface behavior.

**Catalog deployment note (October 9):** The approved additive seed and existing-account backfill were applied and verified in production: 160 shared templates and all missing private starter copies, with existing customizations and shopping snapshots preserved.

## Objective

Help an individual shopper, including a student or family member, prepare a reusable grocery checklist, track shopping progress, and review finished trips. Budget tracking is optional. A shopper must be able to complete the checklist flow without entering a price or budget.

## Delivered application behavior

1. **Private account:** Register, sign in, sign out, and return to saved catalog items, named lists, and trip history. An account cannot read or change another account's data.
2. **Reusable catalog:** Supply 160 common grocery starter items with names and categories, without invented prices. Search and filter by category, register a custom item when no suitable match exists, and edit private catalog items. Brand, variant, and package size are not required. An optional image URL may be supplied; missing images use a placeholder.
3. **Multiple named shopping lists (approved 2026-10-05):** My Lists shows independently owned active lists with names, optional budgets, currency snapshots, progress and last updated dates. Users explicitly create empty lists with a required trimmed Unicode name of at most 100 code points; names may repeat. Open, rename, edit budget, finish, or confirm deletion of an active list. Add an item from the catalog, or register it and return to the add step. Catalog opened from a list retains that explicit destination; the main Catalog requires destination selection. Edit a list item's displayed name and quantity, remove it, mark it bought or unbought, and optionally hide checked items without deleting them. The list can be searched or organized by category. One catalog item has at most one entry per list: adding it again opens that entry with its current values and saving sets the desired values rather than incrementing them. The same catalog product may appear in several lists.
4. **Simple quantities:** Each list entry has a positive quantity (whole or decimal, up to three decimal places) and an optional short unit label such as `kg`, `L`, or `packs`. Quantity describes what to buy; it is not used to calculate a normalized or per-unit price. Editing an entry's name or quantity does not silently change the reusable catalog.
5. **Optional prices:** Each entry may have a nullable estimated **item total** and a separate nullable actual **item total**, both nonnegative in the trip currency. Neither price is required to add or mark an item bought, or to finish a trip. Actual spending totals use only bought entries with actual prices; estimates use entries with estimated prices. A missing price is shown as incomplete, never treated as zero. `0.00` is a known, valid free-item amount.
6. **Optional budget and currency:** The active trip may have a nullable budget, editable until finish. The account's preferred currency is PHP by default and may be PHP, USD, or EUR; it applies to new trips only. Existing active and completed trips retain their currency, and amounts in different currencies are never combined or relabeled. When a budget exists, show comparisons against known estimated and actual totals with clear incomplete labels where relevant. An over-budget warning never blocks shopping or finishing.
7. **Finish Trip and history:** A confirmation reviews bought and not-bought entries and any known amounts. Finishing records the selected whole list as one named dated trip: unchecked entries are **not bought**. Return to My Lists without creating a replacement list or modifying another list. Users create future lists explicitly. History shows the list name, date, item snapshots, quantities, optional prices, recorded spending, and incompleteness. Past trip items may be added, removed, or corrected for name, category, quantity, bought state, and prices after confirmation; totals update while the original finish date remains. Catalog edits never rewrite a past trip.
8. **Usable interface:** Responsive phone portrait, phone landscape, and desktop layouts; neutral colors, light and dark themes, keyboard-visible focus, readable contrast, clear loading/empty/error/confirmation states, and reduced-motion support. Checklist actions remain primary; prices and budget stay secondary.
9. **Public deployment and security:** Deploy the React/Vite client and Express API on Render with PostgreSQL hosted by Supabase. Keep all shopper data private behind Express authentication. Validate server input, limit abusive account requests, use parameterized queries and ownership checks, restrict CORS, and keep credentials out of the browser and repository.

## Screens

- Sign in / register.
- My Lists overview and create/edit list flow.
- Selected named active list at /lists/:listId, including quick add, quantity editing, bought status, optional prices and budget, and hide-checked control.
- Searchable catalog and simple custom-item form.
- Finish Trip review.
- Trip list/detail and correction review.

Currency, theme, and sign-out controls may live in a small settings area. A separate product price-history screen is not part of the first release.

## Essential data and acceptance examples

Store accounts and sessions, shared starter items, private catalog items, multiple named active trips per account, trip entries, and completed trip snapshots. Evolve the existing shopping_trips table with names and update timestamps. Scope active APIs and cache mutations by list ID and item ID; validate account ownership for every resource. Each entry keeps separate nullable estimated and actual item totals. Completed entries preserve their recorded name, category, quantity, unit label, bought status, and amounts. Legacy names are backfilled without changing original snapshots, ownership, budgets, currency or completion dates.

A shopper can create two named lists, add the same product independently to both, edit quantities, check and uncheck items, hide checked rows, and finish one list with incomplete spending clearly labeled. The other list remains intact and no replacement is created. A bought item with actual price `0.00` is recorded as known and free. A later correction updates that trip's totals without changing its original date. Signing out and back in restores the account's data; another account cannot access it.

## Scope boundaries

The earlier per-`each`/`kg`/`L` price model, reference/last-paid prices, and separate per-product price history are removed from the first release. This gives up automatic repeat-purchase price suggestions and unit-price comparison. Dated trip history and corrections remain so shoppers can review and fix what they recorded. Mandatory brands, variants, package-size comparisons, automatic price comparisons, and price-history charts are outside scope.
