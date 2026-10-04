# PH starter catalog and shopping UX review - October 4, 2026

Local implementation for owner review. No commit, push, deployment, seed execution, migration, or production data modification occurred. Authentication, verified-email enforcement, Resend, and security settings were not changed. The source seed before this task had **108 products**; it now proposes **52 additions**, for **160 total**. This is a repository count, not a new live production database query.

## Audit and architecture

Shared templates live in cartcheck.starter_products, keyed by stable code. Account creation copies templates into user-owned cartcheck.products with a unique (user_id, source_starter_code). All catalog queries already scope to user_id. Starter copies were blocked from editing solely by an extra source_starter_code IS NULL predicate and hidden edit controls. Trip items snapshot product name/category and preserve historical data independently. No migration is necessary.

The cache is in-memory and scoped to an authenticated session. It deduplicates reads, cancels obsolete GETs, guards response versions, retains stale data on failures, and exposes mutation locks that block background reads. Existing shopping mutations update the cache optimistically. Purchase marking nevertheless set one global pendingMutation ref and global busy state, disabling every checkbox until the request completed. There was no checkbox debounce or artificial delay, and successful purchase marking already avoided a full-list refetch.

Money helpers sum integer cents, distinguish unknown/null from explicit zero, and count incomplete prices. Estimates include all estimated entries; actual spending includes only bought entries with actual prices. Both are authoritative comparisons in the product requirements, so the UI provides separately labeled meters rather than inventing a blended forecast.

## Exact proposed additions

| Stable code | Product | Existing category |
| --- | --- | --- |
| produce-kangkong | Water spinach (kangkong) | Produce |
| produce-pechay | Pechay | Produce |
| produce-okra | Okra | Produce |
| produce-sayote | Chayote (sayote) | Produce |
| produce-sitaw | Yardlong beans (sitaw) | Produce |
| produce-malunggay-leaves | Malunggay leaves | Produce |
| produce-ampalaya | Ampalaya | Produce |
| produce-upo | Upo | Produce |
| dairy-powdered-milk | Powdered milk | Dairy & eggs |
| meat-chicken-thigh | Chicken thigh | Meat & seafood |
| meat-chicken-drumstick | Chicken drumstick | Meat & seafood |
| meat-bangus | Milkfish (bangus) | Meat & seafood |
| meat-tilapia | Tilapia | Meat & seafood |
| seafood-dried-fish | Dried fish | Meat & seafood |
| meat-whole-chicken | Whole chicken | Meat & seafood |
| meat-pork-belly | Pork belly (liempo) | Meat & seafood |
| meat-tocino | Tocino | Meat & seafood |
| meat-longganisa | Longganisa | Meat & seafood |
| seafood-galunggong | Galunggong | Meat & seafood |
| produce-saba-bananas | Saba banana | Produce |
| produce-lakatan-bananas | Lakatan banana | Produce |
| pantry-bihon | Bihon noodles | Pantry |
| pantry-pancit-canton | Pancit canton | Pantry |
| pantry-mung-beans | Mung beans (monggo) | Pantry |
| pantry-bagoong | Bagoong | Pantry |
| pantry-regular-milled-rice | Regular milled rice | Pantry |
| pantry-dinorado-rice | Dinorado rice | Pantry |
| pantry-sinandomeng-rice | Sinandomeng rice | Pantry |
| pantry-glutinous-rice | Glutinous rice (malagkit) | Pantry |
| pantry-cornstarch | Cornstarch | Pantry |
| pantry-corn-grits | Corn grits | Pantry |
| pantry-banana-ketchup | Banana ketchup | Pantry |
| pantry-coconut-cream | Coconut cream | Pantry |
| beverages-instant-coffee | Instant coffee | Beverages |
| beverages-three-in-one-coffee | 3-in-1 coffee | Beverages |
| pantry-cup-noodles | Cup noodles | Pantry |
| household-fabric-conditioner | Fabric conditioner | Household |
| pantry-canned-luncheon-meat | Canned luncheon meat | Pantry |
| pantry-corned-beef | Canned corned beef | Pantry |
| household-toothbrush | Toothbrush | Household |
| frozen-fish-balls | Frozen fish balls | Frozen |
| household-hair-conditioner | Hair conditioner | Household |
| snacks-banana-chips | Banana chips | Snacks |
| meat-pork-shoulder-kasim | Pork shoulder (kasim) | Meat & seafood |
| beverages-powdered-juice | Powdered juice drink | Beverages |
| beverages-chocolate-drink | Chocolate drink powder | Beverages |
| household-sanitary-pads | Sanitary pads | Household |
| household-bath-soap | Bath soap | Household |
| household-shampoo | Shampoo | Household |
| household-toothpaste | Toothpaste | Household |
| household-bleach | Bleach | Household |
| household-facial-tissues | Facial tissues | Household |

All original 108 codes, names, and category assignments are unchanged; no existing rows were removed. No duplicate codes or case-insensitive labels were found in the proposal. Existing candidates deliberately not re-added include Rice (a generic entry, retained alongside specific varieties), Mangoes, Pineapple, Papaya, Coconut, Calamansi, Ground pork, Hot dogs, Eggplant/Talong, Sweet potatoes/Kamote, Pan de sal/Pandesal, White/whole wheat bread, Rolled oats/Oatmeal, Soy sauce, Vinegar, Fish sauce/Patis, Oyster sauce, Coconut milk/Gata, Cooking oil, All-purpose flour, White/Brown sugar, Salt, Black pepper, Canned sardines, Canned tuna, Instant noodles, Crackers, Biscuits, Dishwashing liquid, Laundry detergent, Trash bags, and Toilet paper.

Established category values stay compatible: rice varieties and packaged staples remain Pantry; personal-care additions remain Household. No stored category renames or new category taxonomy was introduced. New labels include familiar Filipino terms where useful for search, such as kangkong, sayote, sitaw, malagkit, bangus, liempo, and kasim. Added category counts: Produce: 10; Dairy & eggs: 1; Meat & seafood: 11; Pantry: 15; Beverages: 4; Household: 9; Frozen: 1; Snacks: 1.

## Seed and customization safety

The seed now uses ON CONFLICT (code) DO NOTHING, preserving existing template values rather than updating labels. The distinct code primary key supplies idempotency. Seeding alone supplies the expanded catalog to future accounts; it does not add entries to existing accounts. The separate, approval-gated db/backfill-starters.sql inserts only the exact 52 added codes for existing accounts and uses ON CONFLICT (user_id, source_starter_code) DO NOTHING. It never updates existing owned copies, private items, users, or trip snapshots. Neither script was run.

Catalog Customize edits the user's existing copied starter row in place. Identity and source code remain stable, so repeated edits cannot create copies. Every update retains user_id/id ownership checks; starter deletion remains protected. The UI explains that it changes only the shopper's catalog copy. Cache edits are immediate, then replaced with the confirmed row; failures restore the prior catalog. Existing active and historical snapshots do not change when catalog fields change. Adding the product to a new trip uses the current customized name/category.

## Shopping, budget, and dark mode

Sorting uses React state plus a copied derived array. Default retains the established remaining/purchased sections and their order. A-Z and Category produce a single sorted list; Unpurchased First and Purchased First use stable partition sorting. Hide Purchased filters before sorting. Sorting never sends a request or alters server order.

Each purchase click immediately patches the cached bought field. Different items issue independent PATCH requests. For the same item, one writer remains in flight and intermediate clicks coalesce into the latest desired value. Responses apply only when their intent version is current and merge only bought, protecting unrelated fields. This prevents out-of-order same-item server writes rather than merely ignoring their responses. A stale failure cannot roll back newer intent. A latest failure restores the last confirmed value, announces a nonmodal notification, and leaves the cache stale for reconciliation on the next read. Another successful item cannot erase that failure staleness. Navigation remains available during purchase writes; Finish waits for persistence. Item edit/delete conflicts with that item's pending purchase are guarded. Cache disposal prevents a late response from updating another session.

Re-adding an existing item honors the API's bought state when idle. If a purchase is pending or its intent version changes during the add request, the add response preserves that local purchase intent. Regression tests cover pending and completed writes during an add.

There is no successful-toggle GET of the whole list. Cache locks protect pending intentions from background refreshes. The explicit state payload remains { bought: true/false }, matching the existing API. Purchase fill/text/background transitions are 150 ms and do not delay state updates; reduced-motion removes transitions.

Budget meters use budgetProgress in money.js, reusing moneySummary, normalizeMoney, and moneyDifference. Fill is clamped to 100%; textual remaining/reached/over states carry the meaning. Partial prices stay explicitly incomplete. No budget or no known prices means no meaningless meter. Known zero remains valid, including a zero budget. Separate estimate and actual meters preserve all existing accounting semantics and update from current cached data.

Dark semantic tokens now use charcoal page/card/input/elevated surfaces, off-white text, gray secondary text, and mint/green accents. Header, authentication panels, dialogs, dropdown/select fields, budget cards, and mobile navigation have neutral surfaces. The logo remains the original asset and accessible clickable control. Approved light colors and Light/Dark/System behavior are preserved. Checked rows use muted struck-through text and green checks. Key dark text contrast ratios: text/card 16.32:1, muted/card 7.99:1, muted/input 7.58:1, accent/card 10.83:1, button text/fill 9.78:1.

## Verification and preview evidence

- Client: **75 tests passed, 0 failed**, npm test --prefix client.
- Server: **35 passed, 0 failed, 4 guarded database integration tests skipped**, with database test configuration explicitly cleared. No production integration suite ran.
- Production Vite build: passed. Existing password-strength chunk size warning remains (about 821 kB); no dependency change was introduced.
- New unit/DOM coverage: sorting modes, stable source order, hide/empty/one-item and rapid status changes; exact budget/null/zero/partial prices and PHP/USD/EUR; seed code/name uniqueness and preserved original-row hash; conflict/rerun modeling and exact backfill parity; owned starter edit and ownership predicates; ten deferred purchase writes, same-item coalescing, reverse responses across items, old failure protection, rollback, session disposal, blocked background reads, and add-existing purchase races.
- Updated guarded catalog integration covers customization reuse, User B's original row, Filipino search and category filters. It was not executed because no disposable test database was supplied. SQL idempotency was checked structurally and modeled in isolated tests, not by running it against PostgreSQL. Real PostgreSQL persistence, two-account isolation, and backfill execution remain unverified in this pass.
- Browser: installed Edge with Playwright against an isolated Vite fixture server. Normal and Slow-3G (400 ms latency, 50 kB/s upload/download) both changed ten checkboxes synchronously in about 13-15 ms before delayed PATCH responses. All ten persisted in the fixture server; UI and fixture state matched after reload. Navigation during pending writes worked. Only the initial cart GET occurred before reload, with no toggle refetch.
- Same-item false -> true -> false -> true -> false produced two serialized writes and final false in both UI and fixture server. A 503 restored the prior state and showed the notification.
- Screenshots/checks cover 390/768/1440/1920 CSS pixels, both themes for Shopping List/default/A-Z/Unpurchased First, Catalog rice varieties, customization, Trips and Settings; budget under/reached/over/no-budget/zero and PHP/USD/EUR; Finish review; ten purchased rows, failure state; and dark sign-in, register, verification, recovery and password reset. No horizontal overflow or page JavaScript errors were found in the captured matrix. Native select controls inherit dark color-scheme; expanded OS dropdown rendering was not separately captured.

[Open screenshot gallery](design/ux-review/index.html) | [Browser checks](design/ux-review/checks.json)

## Changed files

- client/src/App.jsx
- client/src/Catalog.jsx
- client/src/ShoppingList.jsx
- client/src/cacheBehavior.test.js
- client/src/money.js
- client/src/shoppingProgress.js
- client/src/styles.css
- client/src/purchaseMutations.js
- client/src/purchaseMutations.test.js
- client/src/shoppingSort.test.js
- client/src/budgetProgress.test.js
- client/src/shoppingUx.test.js
- client/tools/ux-preview.config.mjs
- client/tools/capture-ux-review.cjs
- server/catalogRepo.js
- server/catalogRepo.test.js
- server/catalog.integration.test.js
- server/db/seed.sql
- server/db/backfill-starters.sql
- server/db/verify.js
- docs/MILESTONE_1_SETUP.md
- docs/design/DESIGN_SYSTEM.md
- docs/SHOPPING_UX_REVIEW.md
- docs/design/ux-review/
- log.md: dated local entry only, remains Git-ignored.

## Approval gate and remaining work

Review the 52 exact additions, screenshots, and test limitations before authorizing any production seed/backfill or release. No schema migration is required. No commit, push, or deploy has been made. The existing-user backfill is necessary if existing accounts should see the new additions. On approval, prepare the requested focused commit and deployment plan; production database actions still need explicit authorization. Before applying data changes, use read-only count/code checks against the actual target and verify current templates, then review the additive scripts and compare affected counts. Database integration should run only against a disposable local test database, never the production project.

## Release authorization - October 4, 2026
Owner requested 'push and deploy' after the local review. Commit/push and application deployment are authorized. The seed and existing-user backfill remain unexecuted pending explicit database authorization.
