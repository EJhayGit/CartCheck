# CartCheck

CartCheck is a private grocery checklist for planning a shop and keeping a record of completed trips. Add groceries from a starter catalog or create your own, check items off while shopping, and finish a trip without entering prices. Estimated item totals, actual item totals, and a budget are optional.

**Live app:** [cartcheck.merzbuilds.dev](https://cartcheck.merzbuilds.dev). Built with React, Vite, Express, and PostgreSQL; the client and API share one Render service, with the database hosted by Supabase.

## What it does

- Provides a searchable catalog of 160 starter groceries and private custom items.
- Keeps multiple named lists per account, with searchable groceries, custom items, quantities, and bought status.
- Records a selected list as a named dated trip, then returns to My Lists. Other lists remain available; new lists are created explicitly.
- Lets you review and correct past trips without changing their original finish date.
- Tracks optional spending and budget in PHP, USD, or EUR. Missing prices stay visibly incomplete; a known free item can be entered as `0.00`.
- Offers responsive layouts and Light, Dark, and System appearance settings.
- Keeps shopper data behind authenticated Express routes with account ownership checks.
- Supports email verification, password reset links, and password changes through configurable transactional email.

The [documentation index](docs/README.md) links the requirements, architecture, design, and operations guides.

## Architecture

Express serves the Vite build and `/api` from a single HTTPS origin, with PostgreSQL behind the API. Database credentials stay on the server. Email delivery and verification policy are configured through server environment variables. See the [system design](docs/architecture/SYSTEM_DESIGN.md) and [migration guide](docs/MIGRATIONS.md) before releasing schema changes.

## Run locally

You need Node.js 20 or newer, npm, and a disposable PostgreSQL database. A local PostgreSQL 17 Compose service is available in [compose.yml](compose.yml).

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

The [server environment example](server/.env.example) documents database, TLS, pool, CORS, and email settings. Follow the [account email setup guide](docs/ACCOUNT_EMAIL_SETUP.md) before enabling real delivery or required verification. Leave `VITE_API_BASE_URL` unset for the local proxy and approved single-origin Render service. The [client environment example](client/.env.example) documents a direct API origin only for a separately hosted development API. Never put secrets in a `VITE_` variable.

## Verify

```powershell
cd server
npm test
cd ../client
npm test
npm run build
```

The database integration suites use a separate guarded runner (`server/testIntegrationDev.js`) and are skipped by the ordinary server test command.

[GitHub Actions CI](.github/workflows/ci.yml) installs both lockfiles, runs unit/client tests, and builds the client on Node.js 24. It uses no database or email credentials and does not deploy. See [backup and recovery](docs/BACKUP_RECOVERY.md) for the private export and isolated restoration procedure.

## Project layout

| Path | Purpose |
| --- | --- |
| [client](client) | React screens, styles, API client, and frontend tests |
| [server](server) | Express routes, account-scoped PostgreSQL queries, migrations, and tests |
| [docs](docs) | Requirements, architecture, design, and operations guides |

## License

[MIT](LICENSE).
