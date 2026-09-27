# CartCheck

CartCheck is a planned grocery checklist for an individual shopper. Find or register reusable items, manage one active shopping list, mark purchases, optionally record prices and a budget, then finish and review a dated trip. The [approved product requirements](docs/PRODUCT_REQUIREMENTS.md), [design specification](docs/design/README.md), and [implementation roadmap](docs/architecture/ROADMAP.md) define the next development work.

**Current status:** Milestone 1 database files, value helpers, and server connection configuration are prepared and verified against the Supabase development database. The React UI and Express sightings routes are still the professor's **HAUnted Sightings** example; CartCheck account and shopping functionality begins in Milestone 2. No Render service has been created.

See [Milestone 1 local setup](docs/MILESTONE_1_SETUP.md) for safe database initialization and verification.

## Approved architecture

- React and Vite client; Express API; PostgreSQL data store.
- Render is the intended host for the Express service and built React client on one HTTPS origin.
- Supabase is the intended hosted PostgreSQL provider for Express. The browser will not connect directly to Supabase or receive database credentials.
- Express-managed private accounts and sessions remain the first-release plan, subject to any full assignment instruction not present in this repository.
- Preferred trip currency is PHP by default, with USD and EUR available for new trips. A finished trip keeps its original currency.

The [system design](docs/architecture/SYSTEM_DESIGN.md) records the proposed schema, API, security, and verification details. No hosted database tables should be created from these documents alone.

## Approved visual mockups

The [professor's mockup document](docs/02-mockup.md) links to 48 final PNG exports in [docs/assets/mockups](docs/assets/mockups/). They cover 18 approved screens and states in desktop and phone layouts, with landscape captures for the main shopping list. The [static prototypes](docs/design/prototype/README.md) are visual references; they do not implement CartCheck functionality.

## Planned first-release flow

1. Sign in and open one active list.
2. Search approximately 100 common starter items or register a private custom item without a required brand, variant, package size, or price.
3. Add an item, edit its displayed name and quantity, remove it, or mark it bought/unbought. Adding the same catalog item again opens its existing entry for an absolute edit.
4. Optionally enter an estimated item total, a separate actual item total, or a trip budget. Missing amounts are incomplete, not zero. No money entry is required to check off an item or finish.
5. Confirm Finish Trip. Checked items are bought; unchecked items are saved as not bought. A new empty list starts without rolling unchecked items forward.
6. Review dated trip snapshots and correct past entries when needed.

Per-unit pricing, last-paid suggestions, and a separate product price-history screen were removed from the first release to keep the checklist fast. Trip-level spending history and correction remain.

## Running the current starter locally

Install Node.js 20 or newer and npm. To view the existing browser-only sightings example:

```powershell
cd client
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. It currently shows **HAUnted Sightings**, using localStorage demo data. This setup has not been verified in this checkout.

The sightings API remains available as starter code, but its old table is no longer created by the CartCheck migration. Use the documented disposable CartCheck database for migration checks. The non-destructive commands are now `npm run db:migrate` and `npm run db:seed`; there is no reset command. Milestone 2 will replace the sightings API and browser mock with private CartCheck flows.

`VITE_` values are public in the browser bundle. Database URLs, passwords, and session secrets belong only in server or hosting environment variables. The development Vite `/api` proxy does not replace production Express hosting.

## Course evidence still to complete

The revised proposal, visual design-system submission, contemporaneous weekly reports, public deployment, running-app screenshot, demo video, security/privacy checks, and [AI usage record](AI-USAGE.md) remain to be completed or updated as real work occurs. The [proposal document](docs/01-proposal.md) is still a template, so the mockup screen set cannot yet be checked against a submitted proposal. The existing low-fidelity [wireframes](docs/design/WIREFRAMES.md) are planning diagrams. Do not claim student-written code, AI mistakes, testing, or commits without real evidence.

## License

MIT; see [LICENSE](LICENSE).
