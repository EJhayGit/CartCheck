# Database migrations

> Purpose: how schema changes are applied and released safely. · Read when: adding a migration or releasing a schema change.

## Rules

- Migrations are numbered SQL files in `server/db/migrations/NNN_*.sql`, applied in order by `server/db/run.js` (`npm run db:migrate`).
- The runner records checksums and rejects edits to applied migrations. Never edit an applied migration; add a new one.
- Never reset a retained database. `server/db/schema.sql` is a reference only.
- Check the target with `npm run db:preflight` first and verify with `npm run db:verify`. Use the [local setup steps](../README.md#run-locally) for a disposable local database.
- Local setup instructions do not authorize production changes.

## 004: multiple named lists

Migration `004_multiple_named_lists.sql` adds required list names and update timestamps to `shopping_trips`, backfills legacy names, and replaces the one-active-trip-per-account index with an owner/update-time index. It preserves ownership, item snapshots, budgets, currencies, and completion dates. The existing table continues to represent active lists and completed trips.

The client and API use explicit list IDs. Registration and finishing no longer create an automatic empty list; users create lists explicitly. Legacy `/api/cart` endpoints are retired. Old server code depends on the removed unique index and cannot safely overlap the new schema.

Before an approved release to a retained database:

1. Inspect migration checksums, schema constraints, candidate backfill counts, and invalid existing names using read-only queries.
2. Verify a recoverable backup and assess migration locks on an isolated database.
3. Stop old application writers using provider-supported controls, apply the reviewed migration, and release the matching client/server together.
4. Verify readiness, account isolation, independent lists, destination selection, and finish/history behavior before reopening traffic.

Once an account has multiple active lists, restoring the old unique index is unsafe. Prefer a forward fix with compatible server code. Never delete or merge lists to make an old-code rollback succeed. A database restore requires its own approval.
