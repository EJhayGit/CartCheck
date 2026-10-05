# Multiple named shopping lists: audit and migration review

Date: 2026-10-05. Status: Phase 1 complete; implementation and schema changes await migration-plan review.

This report is based on repository inspection, not a live production database audit. No database connection, migration, production write, commit, push, or deployment was performed. Production row counts and schema drift remain unverified. The supplied feature request supersedes the single-list direction in PRODUCT_REQUIREMENTS.md; update that document during approved implementation.

## 1. Existing model

The existing table is `cartcheck.shopping_trips`, not `trips`. It already represents both active shopping sessions and completed history:

| Field | Current behavior |
| --- | --- |
| id / user_id | BIGINT identity and account ownership |
| status | Required `active` or `completed`, default `active` |
| currency | Required PHP, USD, or EUR; copied from account preference at automatic creation |
| budget | Nullable NUMERIC(12,2), nonnegative; NULL is absent and zero is a real budget |
| revision | Positive integer, incremented for mutations; reviewed revision protects completion/corrections |
| created_at | Required timestamp, default now() |
| completed_at | NULL while active, required when completed |
| name / updated_at | Neither exists in the checked-in trip schema |

`shopping_trips_completion_matches_status` enforces status/date consistency. `shopping_trips_id_user_unique` supports composite ownership foreign keys. `trip_items_trip_owner_fk` and `trip_items_product_owner_fk` prevent cross-account references. Preserve all these constraints.

Items retain name, category, quantity, optional unit label, bought state, separate nullable estimated/actual totals, and created/updated timestamps. `trip_items_one_product_per_trip` prevents duplicate catalog entries within a single trip and already permits the same product in different trips. Completion keeps every item, including unchecked entries, and clears `product_id` so catalog removal cannot damage historical snapshots. Totals are calculated from snapshots, not persisted on trips. Actual totals include only bought items with known actual prices.

The exact restriction, present in both schema.sql and migration 001, is:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS shopping_trips_one_active_per_user_idx
  ON cartcheck.shopping_trips (user_id) WHERE status = 'active';
```

It is a partial unique index, not a named table UNIQUE constraint.

## 2. Dependencies on one active trip

| Area | Files / dependency |
| --- | --- |
| Registration | server/authRepo.js createAccount inserts an empty active trip in its account transaction |
| Cart reads | server/cartRepo.js getCart calls ensureActiveTrip, then locks/selects by owner and active status without a trip ID |
| Budget / catalog add | updateActiveBudget and addCatalogItem use the same automatic creation and owner-only selection |
| Item writes | updateItem/deleteItem verify owner and active parent, but accept item ID without an explicit selected trip ID |
| Automatic creation | cartRepo.ensureActiveTrip and tripRepo.ensureActive use ON CONFLICT (user_id) WHERE status = 'active'; these queries fail if their supporting index is simply removed |
| Finish | server/tripRepo.js finishTrip locks owner + trip ID; completed retries return saved history; both initial finish and retries ensure a replacement active trip |
| APIs | GET/PATCH /api/cart; POST /api/cart/items; PATCH/DELETE /api/cart/items/:id |
| Explicit finish / history | POST /api/trips/:id/finish is already ID scoped; GET /api/trips, GET /api/trips/:id and PUT /api/trips/:id support completed history |
| Navigation | client/src/App.jsx uses local page state, default cart; there is no list-ID URL navigation; ShoppingList remains mounted across tabs |
| Shopping view | ShoppingList.jsx reads/writes the single cart cache; finish consumes result.activeTrip and announces a new empty list |
| Catalog | App.jsx owns add-to-cart, fetches the singleton cart, merges returned item, then opens ShoppingList; Catalog has no destination selection |
| Cache | dataCache.jsx prefetches cart/catalog/trips and revalidates cart/history on focus/online; dataCache.js already has request cancellation, version guards, mutation locks and session disposal |
| Purchase coordinator | purchaseMutations.js has one coordinator per cache and item-ID maps, and writes the literal cart key; multiple mounted list writers would overwrite coordinator registration |
| History | Trips.jsx uses trips and trip:<id> cache keys; summaries/details currently display generic Shopping trip titles |
| Tests | db/verify.js asserts second active trip is rejected; tripRepo.test.js tests rollback if replacement creation fails; cart.integration.test.js, finishCache.test.js, cacheBehavior.test.js and shoppingUx.test.js assume automatic/singleton cart behavior |

Finish is transactional: lock, validate revision/nonempty list, mark completed, detach catalog references, create replacement, read snapshots, commit. Its replacement step must be removed while retaining the rest, including retry idempotency and rollback. Completed-trip correction remains supported and must retain original completion date/currency.

## 3. Proposed schema and backfill

Evolve shopping_trips; do not add a parallel shopping_lists table. Add one new numbered migration, proposed `004_multiple_named_lists.sql`. Leave checksummed migrations 001–003 unchanged. Update schema.sql so fresh schema creation does not recreate the obsolete unique index.

Proposed migration operations, within the existing runner's transaction:

1. Add nullable name TEXT and updated_at TIMESTAMPTZ columns using IF NOT EXISTS.
2. Backfill missing/blank names only: active rows become **My Grocery List**, completed rows become **Shopping Trip**. Preserve nonblank existing names, including Unicode. If a preexisting column contains invalid names, stop and report rather than truncate/overwrite them.
3. Backfill missing updated_at from the latest of created_at, completed_at and related item updated_at. This is an approximation: historical budget edits were not timestamped on the trip. Preserve any existing updated_at values.
4. Enforce required names, nonblank trimmed values, and a 100 Unicode code-point limit. Enforce required updated_at with now() as its creation default. Do not default name for future inserts: create must supply it. Frontend/backend use the same name normalization and code-point counting; database checks provide a compatible lower-level guard. Test Unicode whitespace and emoji boundaries explicitly.
5. Drop only cartcheck.shopping_trips_one_active_per_user_idx using IF EXISTS. Add a nonunique partial active-list index on (user_id, updated_at DESC, id DESC). Retain the existing completed-history index and all ownership, snapshot and integrity constraints.

New names need not be unique. Keep budget/currency/status/revision and all existing item data unchanged. Do not modify completed_at, created_at, ownership, purchased states, or prices during backfill. Do not synthesize new lists for accounts without one. Existing active rows, even empty ones, remain visible.

All application list/item mutations must advance parent updated_at and revision in the same transaction. Completion and history correction also advance updated_at while keeping original completion dates. Use application-controlled timestamp updates consistently with the current repository architecture.

Idempotence: the runner records migration checksums; explicit column/index existence guards and conditional backfills protect reviewed reruns. Constraints need explicit existence checks and definition inspection rather than blindly treating an existing incompatible constraint as success.

## 4. Production preflight and rollback

Actual affected row count: **unknown; no production query was run**. Before any approved production change, use a read-only transaction to inspect pg_indexes, pg_constraint, information_schema.columns, schema_migrations, current row counts, and existing field validity. Confirm the production definition matches the repository. The following review queries do not expose account identities or item content:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'cartcheck' AND tablename = 'shopping_trips';
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'cartcheck.shopping_trips'::regclass;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'cartcheck' AND table_name = 'shopping_trips';
SELECT status, count(*) AS total_rows,
       count(*) FILTER (WHERE NULLIF(btrim(to_jsonb(t)->>'name'), '') IS NULL)
         AS candidate_name_backfills,
       count(*) FILTER (WHERE to_jsonb(t)->>'updated_at' IS NULL)
         AS timestamp_backfills
FROM cartcheck.shopping_trips t GROUP BY status;
SELECT filename, sha256 FROM cartcheck.schema_migrations ORDER BY filename;
ROLLBACK;
```

These candidate counts need the final implementation's whitespace rules checked for exact affected counts if a future-compatible name column already exists. Report final counts/defaults and invalid-name cases before requesting production approval.

The old application cannot run safely after the unique index is dropped: its conflict targets depend on that index and its selections assume one row. This is a coordinated application/schema release. For V1, use a short controlled maintenance window: stop old writers, run the separately approved migration, release tested client/server together, and verify. Do not perform a rolling overlap with old writers. Local preparation does not authorize this production sequence.

Before release, verify recoverable backups and migration lock duration on an isolated database. Backfill plus index creation can lock a large table; production size determines whether a staged migration is necessary. Do not promise zero downtime without those measurements.

Before any account has multiple active lists, restoring the unique index is possible after checking duplicates. Once multiple active lists exist, old-code rollback is unsafe: index recreation fails. Prefer a forward fix or keep the multi-list-compatible server. Never delete/complete/merge lists merely to restore the old restriction. Keep added columns/backfilled names during rollback rather than discard data. Database restore would lose subsequent writes and requires its own explicit approval.

## 5. Planned application behavior

Proposed resource routes:

| Route | Behavior |
| --- | --- |
| GET /api/lists | Owner-scoped active summaries with item progress, known/missing amounts, budget, currency, name and timestamps; paginate generously |
| POST /api/lists | Required trimmed name, nullable budget, supported currency defaulting to account preference; empty active list |
| GET /api/lists/:id | Owner-scoped active list details |
| PATCH /api/lists/:id | Rename and/or budget edits; preserve creation currency |
| DELETE /api/lists/:id | Delete only owner-scoped active list and its items after UI confirmation |
| POST /api/lists/:id/items | Catalog add explicitly scoped to destination; duplicate product behavior stays local to that list |
| PATCH/DELETE /api/lists/:id/items/:itemId | Require owner, selected parent ID, item ID and active status together |
| POST /api/trips/:id/finish | Preserve explicit route; return completedTrip only, no replacement list |
| GET /api/trips, GET/PUT /api/trips/:id | Preserve historical routes/corrections, add names and relevant metadata |

Remove singleton cart use from the new client. Old singleton endpoints must never pick an arbitrary active row; retire them with a clear nonmutating upgrade response. Preserve authentication/origin protections, generic owner-not-found responses, strict ID validation and parameterized queries. Registration removes only automatic list insertion; account/session/catalog provisioning, verification and email behavior stay unchanged.

Use /lists and /lists/:listId with History API navigation/popstate in the current lightweight architecture. Support direct authenticated bookmarks; the server already serves client routes through its SPA fallback. Validate ownership through the API before displaying details. Completed-list bookmarks should resolve through an owner-verified response to historical details, never enable active-list edits. An invalid/foreign ID reveals no existence information.

My Lists replaces the first navigation destination. Compact responsive cards show name, purchased/total count, progress, budget/spending with missing-price labels, remaining/over-budget amount when meaningful, and updated date. Keep unknown spending distinct from known zero; no budget is explicit. Reuse semantic light/dark tokens and neutral charcoal surfaces. Empty state offers Create your first list. Create form includes only name, optional budget and currency. Rename/budget actions reuse accessible dialog patterns; active deletion explains that the list and all its items will be removed and history is unaffected. Open list preserves all current shopping/sort/hide-purchased functionality and includes a return-to-lists action.

Catalog entered from a list carries that explicit destination and shows its name. Main Catalog requires destination selection from active lists, even if only one exists; no arbitrary default. With no lists, offer creation. Preserve the existing open/edit behavior when adding a product already in that destination. Validate destination again server-side if it was finished/deleted in another tab.

Finish saves the selected list transactionally, preserves every snapshot, removes that summary from active lists, caches completed history and returns to My Lists. Retried finish returns the same completed trip and creates nothing. Other active lists stay intact. Preserve current nonempty-finish restriction unless separately changed.

## 6. Cache and optimistic safety

Reuse the session-owned store, with lists summary entries (including pagination), list:<id> active details, trips history summaries and trip:<id> completed details. List switches retain warm entries; extend bounded detail eviction to active detail keys without evicting subscribed/mutating entries. Revalidate overview and visible details on focus/online, retaining cached data during refresh.

Mutation closures capture list ID, item ID and cache key at invocation. Coordinators register per cache + list ID and track item intent within that list. Server responses update only that captured detail and its overview summary, even after navigation. Preserve mutation locks, response version guards, session disposal, coalesced purchase writes, and per-item rollback that retains newer user intent. On uncertain failures reconcile that list only. Creation and completion use server-confirmed identity/state; safe rename/budget/item changes update immediately and roll back with nonblocking errors. Avoid full overview/detail refetches for ordinary successful mutations; responses include parent revision/updatedAt and enough summary data to reconcile accurately.

## 7. Verification after plan approval

- Run migration only against an explicitly isolated local/test database. Seed representative legacy active/completed rows, snapshot their data, apply migration, rerun safely, verify names/timestamps, preserve all original values, allow two active lists, and retain all unrelated constraints. Also test partial existing-column states and invalid future names.
- Add repository/API tests for required Unicode names, duplicates, null/zero budget, currency snapshot, multiple lists, ownership across summaries/details/items/rename/budget/finish/delete, malformed IDs, foreign item-parent combinations, completed restrictions, finish retries/stale revisions and concurrent finish/edit/delete.
- Update singleton assumptions in existing tests; preserve history corrections, catalog, sorting, budget, purchase and account regressions. Use guarded isolated integration execution only. Do not run db/verify.js or destructive integration suites against production, even though verification rolls back rows.
- Add frontend tests for overview, creation/validation, rename/delete confirmation, correct routes/back/forward, catalog destination, finish return, warm switches and late responses across lists/session logout.
- Run focused server/client suites and production build after implementation. Browser review at 390, 768, 1440, 1920 and 2560px, light/dark, keyboard dialogs and loading/error states. Capture all ten requested screenshot states.

## 8. Current deliverables and approval gates

Files changed in this phase: this report and an append-only local ignored log.md entry. No migration file or application/schema change has been created. Tests/build/browser screenshots are pending implementation; this audit does not claim feature verification or a migration dry run.

First approval requested: review this migration/domain/release plan to proceed with local implementation and isolated migration testing. This follows Phase 1's instruction, “Do not change the schema until the migration plan is reviewed.” A separate final approval remains required before any production schema/data change, commit, push, or deployment, after the implementation report, exact production preflight counts, tests and screenshots are available.
