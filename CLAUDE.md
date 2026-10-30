# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project rules (requirements, design system, optimistic UI, local-only `log.md`) live in @AGENTS.MD — follow them.

## Commands

There is no root package; run commands inside `server/` or `client/`.

Server (`server/`, needs `server/.env` with `DATABASE_URL`; see `server/.env.example`):
- `npm run dev` — Express on :3000 with `--watch`
- `npm run db:preflight`, `npm run db:migrate`, `npm run db:seed` — check target, apply numbered migrations, seed starter catalog (both idempotent)
- `npm run db:verify` — schema checks inside a rolled-back transaction

Client (`client/`):
- `npm run dev` — Vite on :5173, proxies `/api` to :3000
- `npm run build` — production build to `client/dist`

Tests use the built-in Node runner in both packages:
- `npm test` (= `node --test`)
- Single file: `node --test authValidation.test.js` (server) or `node --test src/money.test.js` (client)
- `server/*.integration.test.js` skip themselves without a database URL. They run only via the guarded `node --env-file=.env testIntegrationDev.js`, which targets a pinned dev database and writes temporary accounts — never run it without explicit approval.

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` for both packages and the client build on Node 24, with no database.

## Architecture

- **One origin.** In production Express serves `client/dist` (SPA fallback) and `/api`. The browser never talks to Postgres/Supabase or the email provider; never put secrets in `VITE_` variables.
- **Server layering** (flat files in `server/`): `*Validation.js` parses and validates request input → `server.js` routes handle auth, status codes and JSON → `*Repo.js` run parameterized SQL that is always scoped to the signed-in account. Cross-account access returns 404.
- **Database.** Tables live in the non-exposed `cartcheck` schema. `server/db/migrations/NNN_*.sql` are applied by `db/run.js`, which stores checksums and rejects edits to applied migrations — add a new migration instead. `db/schema.sql` is a reference only; never run it as a reset.
- **Data model.** Starter products are price-less templates copied into each account's private catalog on registration. Active lists and finished trips share `shopping_trips`; finishing snapshots items. Money is nullable decimal strings — `NULL` (unknown) is distinct from `0.00`.
- **Client.** `src/api/httpApi.js` is the HTTP facade. `dataCache` provides a session-scoped cache with request dedup and stale-response guards; `sessionSync`/`resetSession` detect cross-tab account changes and clear private caches. Safe mutations are optimistic with rollback (see `purchaseMutations.js`).
- **Auth.** Cookie sessions and hashed single-use email action tokens; email delivery is configured by server env (see `docs/ACCOUNT_EMAIL_SETUP.md`).

Deeper references: `docs/architecture/SYSTEM_DESIGN.md`, `docs/MIGRATIONS.md`.
