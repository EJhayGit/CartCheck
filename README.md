# CartCheck

CartCheck is a private grocery checklist for planning a shop and keeping a record of completed trips. Add groceries from a starter catalog or create your own, check items off while shopping, and finish a trip without entering prices. Estimated item totals, actual item totals, and a budget are optional.

**Status:** Completed application (October 6, 2026).

**Live app:** [cartcheck.merzbuilds.dev](https://cartcheck.merzbuilds.dev). Built with React, Vite, Express, and PostgreSQL; the client and API share one Render service, with the database hosted by Supabase.

## What it does

- Provides a searchable starter catalog of 160 groceries and private custom items.
- Keeps multiple named lists per account, with searchable groceries, custom items, quantities, and bought status.
- Records a selected list as a named dated trip, then returns to My Lists. Other lists remain available; new lists are created explicitly.
- Lets you review and correct past trips without changing their original finish date.
- Tracks optional spending and budget in PHP, USD, or EUR. Missing prices stay visibly incomplete; a known free item can be entered as `0.00`.
- Offers responsive layouts and Light, Dark, and System appearance settings.
- Keeps shopper data behind authenticated Express routes with account ownership checks.
- Supports email verification, password reset links, and password changes through configurable transactional email.

The [documentation index](docs/README.md) links the approved requirements, architecture, design, setup, and testing guides.

## Architecture

Express serves the Vite build and `/api` from a single HTTPS origin, with PostgreSQL behind the API. Database credentials stay on the server. Email delivery and verification policy are configured through server environment variables. See the [system design](docs/architecture/SYSTEM_DESIGN.md) and [migration guide](docs/MIGRATIONS.md) before releasing schema changes.

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

Open `http://localhost:5173`. Vite proxies `/api` to Express on port 3000. `GET /healthz` checks the API process and `GET /readyz` checks database readiness. The React app uses the authenticated API.

The [server environment example](server/.env.example) documents database, TLS, pool, CORS, and email settings. Follow the [account email setup guide](docs/ACCOUNT_EMAIL_SETUP.md) before enabling real delivery or required verification. Leave `VITE_API_BASE_URL` unset for the local proxy and approved single-origin Render service. The [client environment example](client/.env.example) documents a direct API origin only for a separately hosted development API. Never put secrets in a `VITE_` variable. Database integration tests against the approved development project require the [guarded procedure](docs/MILESTONE_7_TEST_SAFETY.md).

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
| [docs](docs) | Requirements, architecture, design, setup, and testing guides |
| [AI-USAGE.md](AI-USAGE.md) | Disclosure of AI contributions, decisions, and verification |

Course submissions, historical reports, prototypes, and generated review evidence are kept in a local Git-ignored `archive/`. They are not required to run or contribute to CartCheck.

## License

[MIT](LICENSE).

[![Made with Codex](https://img.shields.io/badge/Made%20with-Codex-111827)](https://openai.com/codex/)
