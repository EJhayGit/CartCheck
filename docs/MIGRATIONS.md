# Database migrations and multiple-list upgrade

Use the [database setup guide](MILESTONE_1_SETUP.md) for a disposable local database. The migration runner in `server/db/run.js` records checksums; do not edit migrations that have already been applied.

Migration `004_multiple_named_lists.sql` adds required list names and update timestamps to `shopping_trips`, backfills legacy names, and replaces the one-active-trip-per-account index with an owner/update-time index. It preserves ownership, item snapshots, budgets, currencies, and completion dates. The existing table continues to represent active lists and completed trips.

The client and API use explicit list IDs. Registration and finishing no longer create an automatic empty list; users create lists explicitly. Legacy `/api/cart` endpoints are retired. Old server code depends on the removed unique index and cannot safely overlap the new schema.

Before an approved release to a retained database:

1. Inspect migration checksums, schema constraints, candidate backfill counts, and invalid existing names using read-only queries.
2. Verify a recoverable backup and assess migration locks on an isolated database.
3. Stop old application writers using provider-supported controls, apply the reviewed migration, and release the matching client/server together.
4. Verify readiness, account isolation, independent lists, destination selection, and finish/history behavior before reopening traffic.

Once an account has multiple active lists, restoring the old unique index is unsafe. Prefer a forward fix with compatible server code. Never delete or merge lists to make an old-code rollback succeed. A database restore requires its own approval.

Local setup instructions do not authorize production changes. Keep provider state, backup locations, row counts, and dated release evidence in the local archive or ignored work log. They are historical records rather than public deployment status.
