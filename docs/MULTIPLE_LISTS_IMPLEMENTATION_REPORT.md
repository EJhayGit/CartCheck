# Multiple named lists — local implementation review

2026-10-05 local implementation review snapshot. Implemented against the approved migration/domain plan. At this review stage production had not been accessed and no commit, push, deployment, or production migration had occurred. Subsequent approved production preflight and release preparation are recorded separately. Migrations 001–003 are unchanged. `log.md` and temporary database tools/credentials remain ignored.

## 1. Migration 004

Full SQL: [004_multiple_named_lists.sql](../server/db/migrations/004_multiple_named_lists.sql).

The existing `shopping_trips` parent remains the domain record: active records are named shopping lists; completed records are historical trips. No new parent or item tables were introduced. Previously, `shopping_trips_one_active_per_user_idx` enforced one active record per account and registration/completion created a singleton replacement.

004 adds required `name TEXT` and `updated_at TIMESTAMPTZ`. Null/Unicode-blank names become **My Grocery List** for active rows and **Shopping Trip** for completed rows. Existing valid names remain intact. Missing timestamps become the greatest creation, completion, or owned item update timestamp. All original parent fields and item snapshots remain intact.

`shopping_trips_name_valid` requires a trimmed name of 1–100 Unicode code points; JavaScript and SQL use matching whitespace rules. Name has no insertion default; `updated_at` defaults to now. Invalid existing nonblank names abort the transaction. Compatible partial states are preserved; incompatible existing named constraints/indexes are rejected.

Only the singleton unique index is removed. It is replaced with a **nonunique**, partial active index on `(user_id, updated_at DESC, id DESC)`. Existing history, ownership, product uniqueness, quantity, amount, status and currency constraints remain. Multiple active lists and duplicate names are allowed. Empty accounts remain empty; finishing never creates another list.

## 2. Isolated migration results

Actual PostgreSQL 17.6, UTF-8, loopback-only `127.0.0.1:55439`, disposable `cartcheck_lists_test`. No hosted database URL was used. Docker was unavailable, so a temporary embedded PostgreSQL runtime was installed under ignored `server/.test-runs`; application dependencies were not changed.

All checks passed: transactional dry run and complete rollback; legacy upgrade; direct SQL rerun; actual checksum migration runner and skipped rerun; fresh schema; compatible partial columns; Unicode blank/name limits; invalid nonblank atomic rejection; incompatible constraint/index rejection; retained integrity verification; multiple active lists and duplicate names.

Reproducible harness: [testMultipleListsLocal.js](../server/db/testMultipleListsLocal.js), with [startMultipleListsLocal.js](../server/db/startMultipleListsLocal.js). It refuses an existing test schema on a normal run. Evidence: [migration-api-results.json](design/multiple-lists-review/migration-api-results.json).

## 3. Before/after legacy verification

Fixture: 2 users, 3 trips (2 active, 1 completed), 3 snapshot items. Backfill assigned two active default names and one historical default name. Original creation/completion dates, revisions, currencies, budgets, ownership, purchased states, products and snapshot prices/labels were unchanged. The same baseline remained unchanged after API suites.

| Original-data fingerprint | Before | After |
| --- | --- | --- |
| Trips SHA-256 | `28ad997e85ecea794ccba5b531c8db37c687461e0ba5867d60d0ced71e4b861f` | identical |
| Items SHA-256 | `58ae60cb9de8743a65c1e238bafda92b55e67af2b30c72e1da31430d1d53dec3` | identical |

These are local fixture counts and hashes, not production measurements.

## 4. Automated verification

| Check | Result |
| --- | --- |
| Server unit tests (`node --test`, excluding integration files) | 40 passed, 0 failed/skipped |
| Real PostgreSQL API/account/catalog integration suites | 13 passed, 0 failed/skipped |
| Client `npm test` | 84 passed, 0 failed (final release run, including Catalog pagination regressions) |
| Significant-change specialist review and final guard follow-up | No remaining actionable findings |

Coverage includes foreign owners, mismatched item parents, malformed IDs, completed restrictions, null/zero amounts and budgets, Unicode names, microsecond pagination, snapshot/history preservation, stale finish revisions, retries without replacement, concurrent edit/delete/finish, optimistic rollback/coalescing, list switches/remounts, late replies, session disposal, route bookmarks/popstate, and Catalog destinations. Legacy account/catalog/history regressions remain covered. Two existing test assertion errors were corrected to match unchanged search/password behavior.

## 5. Production build

`VITE_API_BASE_URL='' npm run build` passed: 58 modules. Main JavaScript 243.18 kB (73.28 kB gzip), CSS 37.14 kB. Existing password-strength dependency chunk remains 820.65 kB and triggers Vite's size warning; this does not fail the build. No new application dependencies.

## 6. Responsive browser review and screenshots

Actual built application, Express API and isolated PostgreSQL; headless Microsoft Edge. All checks passed with no browser exceptions or external requests. Tested **390, 768, 1440, 1920 and 2560px**, light and dark, with no horizontal overflow. Verified keyboard Escape/focus restoration, direct completed and malformed bookmarks, optimistic cold-card rename, creation/zero budget, explicit Catalog destination, finish/no replacement, warm switches with delayed responses/newest purchase intent, failure rollback, delete confirmation, and empty-account reads.

17 screenshots cover every requested state: [screenshot gallery](design/multiple-lists-review/README.md). Machine evidence: [browser-results.json](design/multiple-lists-review/browser-results.json). Runner: [capture-lists-review.cjs](../client/tools/capture-lists-review.cjs).

## 7. Files changed

Client application: `App.jsx`, `Catalog.jsx`, `ShoppingList.jsx`, `Trips.jsx`, new `Lists.jsx` and `ListRoute.jsx`, `api/httpApi.js`, `dataCache.js`, `dataCache.jsx`, `purchaseMutations.js`, `styles.css`.

Client tests/tools: `cacheBehavior.test.js`, `dataCache.test.js`, `finishCache.test.js`, `purchaseMutations.test.js`, `shoppingUx.test.js`, new `listsRoutes.test.js`, `catalogDestination.test.js`, `tools/capture-lists-review.cjs`.

Server: `server.js`, `authRepo.js`, `cartRepo.js`, `tripRepo.js`, `tripValidation.js`, new `listRepo.js`, `listValidation.js`; `db/schema.sql`, `db/verify.js`, new migration 004 and `db/preflightMultipleLists.sql`, `db/startMultipleListsLocal.js`, `db/testMultipleListsLocal.js`, `db/previewMultipleListsLocal.js`.

Server tests: `accountEnhancements.integration.test.js`, `auth.integration.test.js`, `cart.integration.test.js`, `catalog.integration.test.js`, `tripRepo.test.js`, new `listRepo.test.js`, `listValidation.test.js`.

Documentation: `PRODUCT_REQUIREMENTS.md`, approved `MULTIPLE_LISTS_MIGRATION_PLAN.md`, this report, screenshot gallery and JSON/PNG evidence. Local append-only `log.md` is ignored. Generated `client/dist` and temporary local runtime/fixtures are ignored.

## 8. API changes

| Route | Response/behavior |
| --- | --- |
| GET `/api/lists` | Owner-scoped active summaries `{items,nextCursor}` with `tripId`, name, timestamps, currency/budget, counts and money completeness |
| POST `/api/lists` | Required name, optional budget/currency; returns full server-created active detail |
| GET `/api/lists/:id` | Full active detail; owned completed bookmark returns `{completedTrip}`; foreign/absent 404 |
| PATCH `/api/lists/:id` | Rename/budget only; full updated detail, currency preserved |
| DELETE `/api/lists/:id` | Active owned parent/items only; 204 |
| POST `/api/lists/:id/items` | Explicit destination; `{item,created,list}` preserves duplicate behavior |
| PATCH `/api/lists/:id/items/:itemId` | Owner + active parent + item scoped; `{item,list}` |
| DELETE `/api/lists/:id/items/:itemId` | Same scope; `{list}` |
| POST `/api/trips/:id/finish` | Revision guarded, locked transaction; `{completedTrip}` only; retries return saved trip |
| Existing trip history routes | Preserved; names/metadata added; original completion date retained on corrections |
| `/api/cart` and descendants | Nonmutating 410 upgrade response |

Every mutation advances parent revision/updatedAt transactionally. Parent locks protect consistent snapshots and finish races. Authentication/origin protections remain. Registration retains account/catalog/session behavior but creates no list.

My Lists shows independent progress/budget/missing-price cards and create/rename/budget/delete controls. History API routes support bookmarks and back/forward. Catalog from a list carries its ID/name; main Catalog requires an explicit selection even with one list and provides Load more lists for paginated destinations. Finish returns to My Lists and preserves other active lists.

## 9. Cache changes

Session-owned keys: `lists`, `list:<id>`, `trips`, `trip:<id>`. Active and historical details share bounded eviction with subscribed/mutating entries protected. Switching retains warm entries; visible data revalidates on focus/online without clearing UI.

Purchase coordinators and pending intentions are scoped to cache + list ID + item ID. Captured responses update only their list, preserve newer intentions/revisions/membership, and survive remounts. Disposed sessions discard replies. Safe changes render immediately with field/entry rollback and nonblocking errors. Creation/finish wait for server identity/state. Mutation responses reconcile detail and overview without full-list refetches; cold overview writes invalidate stale in-flight reads. Pagination rejects stale cursors. Review freezes selected details and releases on unmount; delayed finish cannot navigate an unmounted screen.

## 10. Exact production preflight still required

**All production counts remain unknown. No production query was run.** The exact read-only SQL for a separately approved preflight is [preflightMultipleLists.sql](../server/db/preflightMultipleLists.sql), including:

- Database identity/encoding and migration 001–003 checksum rows; confirm 004 absent.
- Existing columns/defaults, all trip indexes, and trip/item constraint definitions/validation.
- Per-status total rows, exact Unicode name-backfill rows, timestamp-backfill rows, invalid existing nonblank names, and proposed default names.
- Total item rows, orphan/owner-mismatch items, duplicate nonnull product groups, owners with multiple active lists, and table/index sizes.

Expected integrity/invalid-name counts are zero. Legacy singleton schemas should have zero owners with multiple active lists. Compare production definitions/checksums with reviewed files, report actual counts, and halt on drift or invalid data. Production encoding must support the reviewed Unicode names. Lock timing and backup recovery readiness require production-sized isolated rehearsal and operational verification; the small fixture is no timing guarantee.

## 11. Proposed coordinated production release

1. Obtain approval for read-only production preflight; run the attached transaction and return actual counts/drift assessment before requesting database-change approval.
2. After separate approval, prepare the reviewed commit/build and release artifacts, validate recoverable backups, rehearse on an isolated production-sized copy, and schedule a controlled maintenance window.
3. Stop/drain every old server/background writer and prevent old client traffic. Old singleton code cannot overlap the new schema safely. Do not recreate the old restriction.
4. Run reviewed 004 through the checksum runner in its transaction. Confirm exact backfill counts, preserved original data/integrity, required names, and the nonunique active index. If migration fails, transaction rolls back; keep maintenance until assessed.
5. Release compatible server/client together; invalidate old client assets. Smoke-test using explicitly authorized test accounts: empty overview, two independent lists, destination add, rename/budget, finish/history without replacement, ownership and direct routes.
6. Reopen traffic and monitor. Retain a compatible server for forward fixes. Once multiple active lists exist, old-code rollback or recreating the unique index is unsafe. Never delete, merge or complete user lists to force compatibility; a database restore would require separate approval and loses subsequent writes.

Stopping here for review. Production database changes, commit, push and deployment remain unapproved.
