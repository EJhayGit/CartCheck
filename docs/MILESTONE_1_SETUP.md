# Milestone 1: database foundation

The React/Vite client and Express API retain the course starter layout. This milestone prepares the CartCheck data model; the sightings page and routes remain starter examples until Milestone 2. The approved visual mockups in `docs/design/prototype/` and `docs/assets/mockups/` are reference assets.

## Database setup

Use the authorized Supabase development project or a disposable local PostgreSQL database. The repository's `compose.yml` can supply a local database if Docker Desktop is running, but it is optional. Do not reuse the starter `haunted` database or run old sightings reset instructions.

In `server/`, run `npm ci`, copy `.env.example` to `.env`, and set `DATABASE_URL` to the selected database. For Supabase, choose the Session pooler when connecting from an IPv4-only machine, download its CA certificate, and set `SSL_CA_FILE` to the certificate's full local path. Review the migration before running:

```powershell
npm run db:preflight
npm run db:migrate
npm run db:seed
npm run db:migrate
npm run db:seed
npm test
npm run db:verify
```

The second migration and seed runs should not add duplicate rows. `db:migrate` records file hashes in `cartcheck.schema_migrations` and rejects edits to an applied migration. The October 4 local proposal makes `db:seed` insert 160 shared templates without prices; code conflicts leave existing rows unchanged. Production seeding and the separate existing-user backfill require owner approval; neither has been applied. `db/schema.sql` is a readable fresh-schema reference; use numbered migrations to update an existing database. Never run `db/schema.sql` as a reset.

For a direct SQL check on a disposable development database, confirm 160 starters after both seed runs:

```sql
SELECT count(*) FROM cartcheck.starter_products;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'cartcheck' ORDER BY table_name;
```

`npm run db:verify` creates test users, products, trips, and trip items in a transaction that it rolls back. It checks the starter count, owner links, uniqueness, positive quantity, nonnegative totals, and the distinction between `NULL` and `0.00`.

## Supabase connection preparation

The backend uses `pg` and `DATABASE_URL` only on the Express server. Do not put the connection string in `client/.env`, a `VITE_` variable, or source code. For a persistent Render backend, copy the **direct** connection URI from the Supabase project Connect panel when IPv6 works. If the host only supports IPv4, copy the **session pooler** URI from that panel. Do not infer the pooler hostname, and avoid transaction pooling for a long-lived backend. Set `DB_POOL_MAX` within the project's connection allowance (default 5).

Hosted connections require TLS certificate verification. The server rejects URL query options, including `sslmode`, to keep that setting explicit. If Node cannot validate the certificate chain with its default trust store, download the database CA from the Supabase dashboard and set server-only `SSL_CA_FILE` to its local path. Test `GET /readyz` after configuring the URL; `GET /healthz` only confirms that Express is alive. An unavailable database returns 503 from `/readyz`.

The app tables live in the non-exposed `cartcheck` schema. Do not expose it through Supabase's Data API or grant browser roles access. Express will implement authenticated, owner-scoped queries in later milestones. Review the migration before applying it to any remote or retained database. The development Supabase project may be used for this milestone's verification when its owner authorizes it; this does not authorize a production reset.

## Development Supabase verification (2026-09-27)

The `001_initial.sql` migration applied to the development project and a repeat run reported it already applied. Two seed runs each left 108 rows with 108 distinct starter codes. `db:verify` confirmed uniqueness, foreign keys, owner linkage, positive quantity, nonnegative item totals, independent nullable estimated/actual totals, and known `0.00` values. Its test rows were rolled back. The server used the Session pooler with TLS certificate verification; `/healthz` and `/readyz` both returned HTTP 200. No reset or destructive operation was used.

The local `server/.env` and downloaded certificate are Git-ignored. A different developer or host must provide its own connection URI and certificate path. The starter sightings routes will fail against a CartCheck-only database until Milestone 2 replaces them.
