# CartCheck

CartCheck is a private grocery checklist for planning a shop and keeping a record of completed trips. Add groceries from a starter catalog or create your own, check items off while shopping, and finish a trip without entering prices. Estimated item totals, actual item totals, and a budget are optional.

**Status:** The account, catalog, shopping list, and trip history flows have been implemented and tested locally. The public Render deployment is still pending; there is no live app link yet.

## What it does

- Keeps one active list per account, with searchable groceries, custom items, quantities, and bought status.
- Records bought and not-bought items as a dated trip, then starts a new empty list.
- Lets you review and correct past trips without changing their original finish date.
- Tracks optional spending and budget in PHP, USD, or EUR. Missing prices stay visibly incomplete; a known free item can be entered as `0.00`.
- Keeps shopper data behind authenticated Express routes with account ownership checks.

The approved behavior and release criteria are in the [product requirements](docs/PRODUCT_REQUIREMENTS.md). The [design references](docs/design/README.md) and [roadmap](docs/architecture/ROADMAP.md) provide more detail.

## Stack and release plan

React and Vite provide the client. Express serves the API and, for production, the built client from one HTTPS origin on Render. PostgreSQL is hosted by Supabase and accessed only by Express. Database credentials stay on the server; browser builds must never contain them. Public deployment and a running-app screenshot will be added after verification on Render.

## Run locally

You need Node.js 20 or newer, npm, and a disposable PostgreSQL database. A local PostgreSQL 17 Compose service is available in [compose.yml](compose.yml). Follow the [database setup guide](docs/MILESTONE_1_SETUP.md) before running migrations or seed scripts against any database.

From the repository root, configure the server and start it:

```powershell
cd server
npm ci
Copy-Item .env.example .env
# Set DATABASE_URL in the ignored .env file for a disposable database.
npm run db:preflight
npm run db:migrate
npm run db:seed
npm run dev
```

In another terminal, start the client:

```powershell
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Express on port 3000. `GET /healthz` checks the API process and `GET /readyz` checks database readiness. The React app uses the authenticated API; it does not use the old browser-only demo.

The [server environment example](server/.env.example) documents database, TLS, pool, and CORS settings. `VITE_API_BASE_URL` in the [client environment example](client/.env.example) is optional for a separately hosted API; leave it unset for the local proxy and the planned single-origin Render service. Never put secrets in a `VITE_` variable. Database integration tests against the approved development project require the [guarded procedure](docs/MILESTONE_7_TEST_SAFETY.md).

## Verify

```powershell
cd server
npm test
cd ../client
npm test
npm run build
```

The database integration suites use a separate guarded runner and are skipped by the ordinary server test command. See the [test safety guide](docs/MILESTONE_7_TEST_SAFETY.md) before running them.

## Project layout

| Path | Purpose |
| --- | --- |
| [client](client) | React screens, styles, API client, and frontend tests |
| [server](server) | Express routes, account-scoped PostgreSQL queries, migrations, and tests |
| [docs](docs) | Requirements, architecture, design, and project evidence |
| [AI-USAGE.md](AI-USAGE.md) | Record of AI assistance for this project |

The mockup images in [docs/assets/mockups](docs/assets/mockups) are design references, not screenshots of the running app.

## License

[MIT](LICENSE).

[![Made with Codex](https://img.shields.io/badge/Made%20with-Codex-111827)](https://openai.com/codex/)
