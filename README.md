# CartCheck

CartCheck is a planned grocery shopping list for students and family members. It is intended to add items with a name, quantity, and category, then show purchased and unpurchased items. **Current status:** the app is still the course's HAUnted Sightings example. CartCheck features have not been implemented.

## Setup and installation

Install Node.js 20 or newer and npm. For the database-backed example, install PostgreSQL (the supplied Compose file specifies PostgreSQL 17). Clone `https://github.com/EJhayGit/CartCheck.git`. The client and server are separate npm packages.

To run the browser-only example, from the repository root:

```powershell
cd client
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The expected screen is **HAUnted Sightings**, with a demo notice. You can add, list, and delete sightings stored in your browser's localStorage. These steps have not yet been run and verified in this checkout.

To run the current PostgreSQL-backed example, create a disposable local database named `haunted`. In `server/`, run `npm ci`, copy `.env.example` to `.env`, set `DATABASE_URL`, run `npm run db:schema`, then run `npm run dev`. In `client/.env`, set `VITE_USE_MOCK_API=false` and restart the client. Check `http://localhost:3000/healthz` and `http://localhost:3000/readyz`. Database mode has not yet been verified here. **Do not run `db:seed` or `db:reset` against data you need to keep:** the seed truncates the sightings table.

### Configuration

Use the example environment files with placeholders only. `npm start` on the server requires the environment to be supplied; `npm run dev` loads `server/.env`.

| Variable | Location | Example and purpose |
| --- | --- | --- |
| `VITE_USE_MOCK_API` | client | `true` for browser demo; only exact `false` selects HTTP. |
| `VITE_API_BASE_URL` | client | `http://localhost:3000`; HTTP mode API base, no trailing slash. |
| `VITE_BASE_PATH` | client build | `/` locally; optional project subpath when hosted. |
| `DATABASE_URL` | server | `postgresql://postgres:YOUR_PASSWORD@localhost:5432/haunted`; required. |
| `CORS_ORIGINS` | server | `http://localhost:5173`; comma-separated allowed origins. |
| `NODE_ENV` | server | `development` locally. |
| `PORT` | server | `3000` by default; hosting can supply it. |
| `POSTGRES_PASSWORD` | root Compose file | `YOUR_PASSWORD`; only for Compose. |

`VITE_` values are public in the client bundle and must never contain secrets. Client configuration changes require a rebuild. The Vite `/api` proxy works only during development.

## Features and usage

The existing example reports sightings with a place, description, and spookiness rating; lists them; and deletes them. Demo mode stores records in one browser. Grocery items, purchase tracking, and automatic item pictures are planned, not available.

| Method | Path | Current purpose |
| --- | --- | --- |
| GET | `/healthz` | Process liveness. |
| GET | `/readyz` | Database readiness. |
| GET | `/api/sightings` | List sightings. |
| GET | `/api/sightings/:id` | Get one sighting. |
| POST | `/api/sightings` | Create a sighting. |
| PUT | `/api/sightings/:id` | Update a sighting. |
| DELETE | `/api/sightings/:id` | Delete a sighting. |

## Project structure

- `client/src/App.jsx`: current React screen and form.
- `client/src/api/`: facade selecting the localStorage or HTTP adapter.
- `client/src/styles.css`: global styles.
- `server/server.js`: Express routes and validation.
- `server/sightingsRepo.js` and `server/db/`: PostgreSQL access and SQL.
- `docs/`: template planning documents that still need CartCheck content.
- `AI-USAGE.md`: AI assistance record, currently an unfilled template.

## Screenshots

No screenshot of a running CartCheck screen exists yet. A screenshot should be captured after the grocery interface is implemented and running. The planning wireframes and design system in the course workspace show intended screens, not a running app.

## Known issues and next steps

- Convert the sighting UI, both API adapters, Express routes, and schema to one grocery item model.
- Decide quantity units, categories, duplicate handling, purchase reversal, and image-provider terms.
- Add behavioral tests and verify browser demo and PostgreSQL modes separately.
- Deploy the React client, Express API, and PostgreSQL database. The nested Pages workflow has not been confirmed active from this repository layout.
- Update example metadata and documentation and capture a real screenshot. Runtime and deployment have not been verified.

## AI use

The CartCheck planning documents in the private course workspace and this documentation draft were prepared with Codex assistance. [AI-USAGE.md](AI-USAGE.md) still needs specific accepted-work records and commit links. No student-written code contribution is claimed here.

## License

MIT; see [LICENSE](LICENSE).
