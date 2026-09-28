# CartCheck

CartCheck is a grocery checklist for an individual shopper. The current app has private accounts, a reusable grocery catalog, one active shopping list, and completed-trip history. The [product requirements](docs/PRODUCT_REQUIREMENTS.md), [design specification](docs/design/README.md), and [roadmap](docs/architecture/ROADMAP.md) describe the approved flow.

**Current status (September 28, 2026):** Milestones 1–7 are implemented and verified locally against the existing Supabase development database. The three guarded integration suites and authenticated browser trip passed; temporary data was removed and the existing baseline was preserved. The owner approved the Milestone 7 review. Public full-stack hosting and Milestone 8 have not started.

See [Milestone 1 local setup](docs/MILESTONE_1_SETUP.md) for safe database initialization and verification.

## Approved architecture

- React and Vite client; Express API; PostgreSQL data store.
- Render is the intended host for the Express service and built React client on one HTTPS origin.
- Supabase is the intended hosted PostgreSQL provider for Express. The browser will not connect directly to Supabase or receive database credentials.
- Express-managed private accounts and sessions remain the first-release plan, subject to any full assignment instruction not present in this repository.
- Preferred trip currency is PHP by default, with USD and EUR available for new trips. A finished trip keeps its original currency.

The [system design](docs/architecture/SYSTEM_DESIGN.md) records the schema, API, security, and verification design. Migrations 001 and 002 are applied to the authorized development database; apply migrations to another target only after reviewing that target and the migration plan.

## Approved visual mockups

The [professor's mockup document](docs/02-mockup.md) links to 48 final PNG exports in [docs/assets/mockups](docs/assets/mockups/). They cover 18 approved screens and states in desktop and phone layouts, with landscape captures for the main shopping list. The [static prototypes](docs/design/prototype/README.md) are visual references; they do not implement CartCheck functionality.

## First-release flow

1. Sign in and open one active list.
2. Search approximately 100 common starter items or register a private custom item without a required brand, variant, package size, or price.
3. Add an item, edit its displayed name and quantity, remove it, or mark it bought/unbought. Adding the same catalog item again opens its existing entry for an absolute edit.
4. Optionally enter an estimated item total, a separate actual item total, or a trip budget. Missing amounts are incomplete, not zero. No money entry is required to check off an item or finish.
5. Confirm Finish Trip. Checked items are bought; unchecked items are saved as not bought. A new empty list starts without rolling unchecked items forward.
6. Review dated trip snapshots and correct past entries when needed.

Per-unit pricing, last-paid suggestions, and a separate product price-history screen were removed from the first release to keep the checklist fast. Trip-level spending history and correction remain.

## Setup and running locally

Install Git, Node.js 20 or newer, npm, and PostgreSQL (the optional local Compose file uses PostgreSQL 17). Clone `https://github.com/EJhayGit/CartCheck.git`. Configure `server/.env` from `server/.env.example` with a disposable local PostgreSQL database or an authorized development Supabase connection. Review the migration before applying it. From the repository root, run the server setup and start the two packages in separate PowerShell terminals:

```powershell
cd server
npm ci
Copy-Item .env.example .env
# Edit .env to set DATABASE_URL and any needed SSL_CA_FILE.
npm run db:preflight
npm run db:migrate
npm run db:seed
npm run dev
```

```powershell
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. The first screen is CartCheck sign-in; select **Create an account** to register. Vite proxies `/api` to Express on port 3000. `GET http://localhost:3000/healthz` checks the process; `/readyz` checks the database. The authenticated local browser flow was verified on September 28. For the existing Supabase development database, run integration tests only through the [guarded Milestone 7 procedure](docs/MILESTONE_7_TEST_SAFETY.md), with `CARTCHECK_TEST_PROJECT_REF` pinned in ignored `server/.env`; do not run the individual integration files directly.

The old sightings API and browser mock are no longer used by the React app. Use the documented disposable CartCheck database for migration checks. `npm run db:migrate` records migration hashes, and `npm run db:seed` upserts 108 starter items without prices. There is no reset command. See [database setup](docs/MILESTONE_1_SETUP.md) for TLS and safe verification details.

`VITE_` values are public in the browser bundle. Database URLs, passwords, and session secrets belong only in server or hosting environment variables. The development Vite `/api` proxy does not replace production Express hosting.

### Environment variables

| Variable | Where | Example or purpose |
| --- | --- | --- |
| `DATABASE_URL` | `server/.env` | `postgresql://postgres:YOUR_PASSWORD@localhost:5432/cartcheck`; required and server-only. |
| `SSL_CA_FILE` | `server/.env` | Optional full path to the hosted database CA certificate. |
| `DB_POOL_MAX` | `server/.env` | `5` by default; set within the provider connection allowance. |
| `CARTCHECK_TEST_PROJECT_REF` | `server/.env` | Independent project identity pin required only by guarded tests against the approved Supabase development database. Never put a live ref in a tracked file. |
| `CORS_ORIGINS` | `server/.env` | `http://localhost:5173`; comma-separated allowed origins. |
| `NODE_ENV` | server | `development` locally; `production` on the host. |
| `PORT` | server | `3000` by default; a host may supply it. |
| `VITE_API_BASE_URL` | client | Leave unset for the local Vite proxy; optional URL of a separately hosted API. |
| `VITE_BASE_PATH` | client build | `/` by default; optional subpath for static hosting. |
| `POSTGRES_PASSWORD` | root Compose `.env` | Placeholder only, if using `compose.yml`. |

## Features and usage now available

Create an account or sign in. In **Catalog**, search or filter the 108 starter groceries, register a private custom item, and edit or delete custom items. **Add to list** creates one active entry; choosing the same catalog item again opens its existing entry for editing. In **Shopping list**, edit the displayed name, positive quantity (up to three decimals), optional unit label, estimated and actual totals, and trip budget. Mark items bought or unbought, review and finish the trip, and start a fresh empty list. **Trips** shows dated snapshots and allows reviewed corrections. Changes are stored for the signed-in account and survive refresh. Sign out revokes the session.

### Current API

Private routes use the session cookie. Catalog, cart, and trip mutations also check request Origin and validate input on the server.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz`, `/readyz` | Process and database checks. |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account and session actions. |
| `GET` | `/api/auth/me`, `/api/auth/session` | Restore the signed-in account. |
| `GET`, `POST` | `/api/catalog` | Search/filter the catalog; register a custom item. |
| `PATCH`, `DELETE` | `/api/catalog/:id` | Edit or delete a private custom item. |
| `GET` | `/api/cart` | Read the active list. |
| `POST` | `/api/cart/items` | Add a catalog item or return its existing list entry. |
| `PATCH`, `DELETE` | `/api/cart/items/:id` | Edit or remove a list entry. |
| `PATCH` | `/api/cart` | Set or clear the active trip budget. |
| `PATCH` | `/api/me/settings` | Set the preferred currency for future trips. |
| `POST` | `/api/trips/:id/finish` | Finish a reviewed active trip and create a fresh empty trip. |
| `GET` | `/api/trips`, `/api/trips/:id` | List completed trips and view a saved snapshot. |
| `PUT` | `/api/trips/:id` | Save reviewed historical corrections. |

## Project structure

- `client/src/App.jsx`, `Catalog.jsx`, `ShoppingList.jsx`, and `Trips.jsx`: current React screens.
- `client/src/api/httpApi.js`: fetch wrapper and current HTTP methods.
- `server/server.js`: Express routes, authentication, validation, and errors.
- `server/*Repo.js`: owner-scoped PostgreSQL queries.
- `server/db/migrations/` (including migration 002) and `server/db/seed.sql`: schema history and starter catalog.
- `server/testIntegrationDev.js`, `server/browserTestGuard.js`, and `server/testDatabaseSafety.js`: guarded development database verification and exact temporary cleanup.
- `docs/design/` and `docs/assets/mockups/`: design references.

## Screenshots and deployment

There is no screenshot of the **running** CartCheck app in this repository yet. The [desktop shopping-list mockup](docs/assets/mockups/01-shopping-list-desktop.png) and [phone mockup](docs/assets/mockups/01-shopping-list-mobile-01.png) depict planned screens; they are not runtime captures. The latest Pages workflow built the client and uploaded its artifact, but its deploy step failed with HTTP 404 and advised enabling Pages. No public full-stack deployment is verified. The approved hosting plan is one HTTPS origin for the React build and Express API, with Supabase providing server-only PostgreSQL.

## Known issues and next steps

- Public full-stack deployment and a real running-app screenshot in the repository remain unverified. The browser walkthrough was local and authenticated.
- Complete Milestone 8 course deliverables only when that milestone begins, including the security review, demo video, and [AI usage record](AI-USAGE.md). Student-written code evidence must be supplied by its author.

The Week 2 security checklist and reflection are in the private course workspace. This README and the weekly report were drafted with Codex assistance; the owner should review them before submission.

## License

MIT; see [LICENSE](LICENSE).
