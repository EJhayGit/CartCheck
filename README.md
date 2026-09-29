# CartCheck

CartCheck is a private grocery checklist for planning a shop and keeping a record of completed trips. Add groceries from a starter catalog or create your own, check items off while shopping, and finish a trip without entering prices. Estimated item totals, actual item totals, and a budget are optional.

**Status:** The core grocery milestones and account recovery enhancements are implemented and tested locally. The owner has purchased `merzbuilds.dev`; CartCheck DNS, real email delivery, and the public Render deployment remain unverified, so there is no live app link yet. Google Sign-In has been cancelled.

## What it does

- Keeps one active list per account, with searchable groceries, custom items, quantities, and bought status.
- Records bought and not-bought items as a dated trip, then starts a new empty list.
- Lets you review and correct past trips without changing their original finish date.
- Tracks optional spending and budget in PHP, USD, or EUR. Missing prices stay visibly incomplete; a known free item can be entered as `0.00`.
- Keeps shopper data behind authenticated Express routes with account ownership checks.
- Supports email verification, password reset links, and password changes. Email confirmation remains optional until real delivery is configured and tested.

The approved behavior and release criteria are in the [product requirements](docs/PRODUCT_REQUIREMENTS.md). The [design references](docs/design/README.md) and [roadmap](docs/architecture/ROADMAP.md) provide more detail.

## Stack and release plan

React and Vite provide the client. The approved public deployment is **one Render web service** serving the built client and Express `/api` from one HTTPS origin, with Supabase PostgreSQL behind Express and Resend for transactional email. The intended CartCheck origin is `https://cartcheck.merzbuilds.dev`; `https://merzbuilds.dev` is the portfolio domain, and `mail.merzbuilds.dev` is the selected Resend sending subdomain. These addresses are confirmed choices, but CartCheck DNS, hosting, and email delivery have not been configured or verified. Database credentials stay on the server; browser builds must never contain them. Vercel frontend hosting was evaluated and is not in the CartCheck deployment plan. [System design and deployment review](docs/architecture/SYSTEM_DESIGN.md) explains the prerequisites. A live link and running-app screenshot will be added only after verification.

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
| [docs](docs) | Requirements, architecture, design, and project evidence |
| [AI-USAGE.md](AI-USAGE.md) | Record of AI assistance for this project |

The mockup images in [docs/assets/mockups](docs/assets/mockups) are design references, not screenshots of the running app.

## License

[MIT](LICENSE).

[![Made with Codex](https://img.shields.io/badge/Made%20with-Codex-111827)](https://openai.com/codex/)
