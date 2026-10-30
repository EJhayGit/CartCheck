# Application backup and recovery

> Purpose: private export scope and isolated restore verification. · Read when: exporting data, restoring a backup, or before any data update.

Backups contain private account and shopping data. Keep them in `server/.test-runs/backups/` (ignored by Git and outside `client/dist/`) or a separately approved private destination. Never publish the export or log row contents. A local ignored copy alone is not a separate disaster-recovery backup; maintain an approved protected off-device copy.

## Export scope and approval

The existing private JSON export records all nine `cartcheck` application tables, migration checksums, columns, constraints, indexes and sequence metadata in a repeatable-read, read-only transaction. The development record's export is a custom JSON file with a `.dump` suffix, not a `pg_dump` archive. Do not pass it to `pg_restore`.

Creating a fresh production export requires explicit approval of its private-data destination. The export must use verified TLS, confirm the selected CartCheck project, suppress credentials and row contents, parse its output back, compare every row, and record a SHA-256 hash and aggregate counts. Recheck its timestamp before any approved data update.

For operational disaster recovery, prefer a provider-supported PostgreSQL backup with separately documented roles, grants, extensions, and infrastructure. The JSON application export and its test below do not prove recovery of the full Supabase project. No restoration into production is authorized by this guide.

## Isolated restore verification

The development fixture runtime described in `server/db/startMultipleListsLocal.js` binds to `127.0.0.1:55439` and does not read production environment configuration. Once it is running, from `server/`:

```powershell
node db/testRestoreLocal.js .test-runs/backups/<approved-private-export>.dump
```

The runner accepts exports only inside the ignored backup directory, creates a new randomly named local database, validates migration checksums against the repository, applies only the export's recorded migrations, and inserts rows in foreign-key order. It compares every restored row in UTC, restores sequence positions, and checks constraint validation. Credentials, hashes stored in application rows, and row values are not printed. Aggregate results are written to ignored `server/.test-runs/restore-result.json`. Local databases may contain retained private export data; keep the fixture cluster protected and stop it after verification.

If the export predates a migration, this test verifies recovery of that older schema. It does not silently upgrade it. Any subsequent upgrade needs its own isolated migration validation and release review.

## Last verified: 2026-10-09

A fresh read-only application export (taken before the production catalog update) restored into a new localhost PostgreSQL database: all nine tables and row values matched, all four migration checksums matched, constraints validated, and sequences were restored. Normalize timestamps to UTC when comparing.

**Open limits:** provider roles, grants, extensions, infrastructure, and an independently stored disaster-recovery copy are not verified.
